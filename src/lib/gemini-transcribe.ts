import axios from "axios";
import { getAvailableKey, reportKeySuccess, reportKeyRateLimit, reportKeyExhausted } from "./key-pool";
import { sliceAudioBuffer, AudioSlice } from "./audio-slicer";
import { prisma } from "./prisma";

export interface GeminiTranscriptEntry {
  speaker_id: string;
  start_time_seconds: number;
  end_time_seconds: number;
  transcript: string;
}

export interface GeminiTranscriptionResult {
  entries: GeminiTranscriptEntry[];
  language_code?: string;
}

export interface GeminiMultiPartJobPayload {
  isMultiPart: boolean;
  provider: "GEMINI";
  meetingId: string;
  audioUrl: string;
  parts: Array<{
    partIndex: number;
    totalParts: number;
    startOffsetSeconds: number;
    durationSeconds: number;
  }>;
}

// 8MB chunk size for Google AI Files Resumable Upload protocol
const GOOGLE_AI_CHUNK_SIZE = 8 * 1024 * 1024;

/**
 * Downloads audio file into a Buffer from Google Drive or direct URL
 */
async function downloadAudioBuffer(audioUrl: string): Promise<Buffer> {
  console.log(`[GEMINI TRANSCRIPTION] Downloading audio from ${audioUrl.slice(0, 45)}...`);

  if (audioUrl.includes("drive.google.com")) {
    const { downloadGoogleDriveFile } = await import("./gdrive");
    const buffer = await downloadGoogleDriveFile(audioUrl);
    const sample = buffer.subarray(0, 64).toString("utf8").toLowerCase();
    if (sample.includes("<!doctype html") || sample.includes("<html")) {
      throw new Error("Google Drive download returned an HTML error page. Please re-authorize Google Drive in Integrations.");
    }
    return buffer;
  }

  const res = await axios.get(audioUrl, {
    responseType: "arraybuffer",
    timeout: 600000, // 10 minutes timeout for large audio downloads
  });

  const buffer = Buffer.from(res.data);
  const sample = buffer.subarray(0, 64).toString("utf8").toLowerCase();
  if (sample.includes("<!doctype html") || sample.includes("<html")) {
    throw new Error("Audio download returned an HTML error page instead of media content.");
  }
  return buffer;
}

/**
 * Uploads an audio buffer to Google AI Resumable Files API in chunks with robust retry
 */
async function uploadAudioToGoogleAI(
  audioBuffer: Buffer,
  apiKey: string,
  fileName: string = "meeting_audio.mp3",
  mimeType: string = "audio/mp3"
): Promise<{ fileUri: string; fileResourceName: string }> {
  const totalBytes = audioBuffer.length;
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
  console.log(`[GOOGLE AI FILES] Initiating resumable upload for ${totalMb}MB audio...`);

  const initUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
  const initRes = await axios.post(
    initUrl,
    {
      file: {
        display_name: fileName,
      },
    },
    {
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": totalBytes.toString(),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    }
  );

  const uploadUrl = initRes.headers["x-goog-upload-url"];
  if (!uploadUrl) {
    throw new Error("Google AI Files API did not return an upload URL.");
  }

  let uploadedOffset = 0;
  let fileData: any = null;

  while (uploadedOffset < totalBytes) {
    const chunkEnd = Math.min(uploadedOffset + GOOGLE_AI_CHUNK_SIZE, totalBytes);
    const chunk = audioBuffer.subarray(uploadedOffset, chunkEnd);
    const isLastChunk = chunkEnd >= totalBytes;
    const chunkLength = chunk.length;

    const progressPercent = Math.round((chunkEnd / totalBytes) * 100);
    console.log(
      `[GOOGLE AI FILES] Uploading chunk: ${uploadedOffset / 1024 / 1024 | 0}MB-${chunkEnd / 1024 / 1024 | 0}MB / ${totalMb}MB (${progressPercent}%)...`
    );

    let chunkSuccess = false;
    let lastError: any = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const uploadRes = await axios.post(uploadUrl, chunk, {
          headers: {
            "Content-Length": chunkLength.toString(),
            "X-Goog-Upload-Offset": uploadedOffset.toString(),
            "X-Goog-Upload-Command": isLastChunk ? "upload, finalize" : "upload",
            "Content-Type": mimeType,
          },
          timeout: 300000, // 5 minutes per chunk
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });

        if (isLastChunk) {
          fileData = uploadRes.data?.file;
        }

        chunkSuccess = true;
        uploadedOffset = chunkEnd;
        break;
      } catch (err: any) {
        lastError = err;
        console.warn(`[GOOGLE AI FILES] Chunk upload attempt ${attempt}/3 failed: ${err.message}. Retrying...`);
        await new Promise((r) => setTimeout(r, attempt * 1500));
      }
    }

    if (!chunkSuccess) {
      throw new Error(`Google AI Files upload failed at offset ${uploadedOffset}/${totalBytes}: ${lastError?.message || "Network error"}`);
    }
  }

  if (!fileData || !fileData.uri) {
    throw new Error("Failed to get uploaded file URI from Google AI Files API.");
  }

  console.log(`[GOOGLE AI FILES] Upload complete! File URI: ${fileData.uri}`);
  return {
    fileUri: fileData.uri,
    fileResourceName: fileData.name,
  };
}

/**
 * Deletes an audio file from Google AI Files after processing
 */
async function deleteGoogleAIFile(fileResourceName: string, apiKey: string): Promise<void> {
  try {
    const name = fileResourceName.startsWith("files/") ? fileResourceName : `files/${fileResourceName}`;
    const deleteUrl = `https://generativelanguage.googleapis.com/v1beta/${name}?key=${apiKey}`;
    await axios.delete(deleteUrl, { timeout: 30000 });
    console.log(`[GOOGLE AI FILES] Cleaned up temporary file ${name}`);
  } catch (err: any) {
    console.warn(`[GOOGLE AI FILES] Failed to delete file ${fileResourceName}:`, err.message);
  }
}

/**
 * Executes Gemini 3.5 Transcribe & Gemini 3.6 Flash on an audio slice with automatic key pool rotation
 */
async function transcribeSingleAudioSlice(
  audioBuffer: Buffer,
  slice: AudioSlice,
  languageCode: string = "unknown",
  numSpeakers?: number,
  excludedKeyIds: string[] = []
): Promise<{ entries: GeminiTranscriptEntry[] }> {
  const keySelection = await getAvailableKey("GEMINI", excludedKeyIds);
  if (!keySelection) {
    throw new Error("No active Gemini API keys available in the database pool or environment.");
  }

  const { id: keyId, key: apiKey } = keySelection;
  let fileResourceName: string | null = null;

  try {
    console.log(`[GEMINI TRANSCRIBE] Processing Part ${slice.partIndex}/${slice.totalParts} with key ${keyId.slice(0, 8)}...`);

    const { fileUri, fileResourceName: resName } = await uploadAudioToGoogleAI(
      audioBuffer,
      apiKey,
      `meeting_part_${slice.partIndex}.mp3`,
      "audio/mp3"
    );
    fileResourceName = resName;

    let transcriptionData: GeminiTranscriptionResult | null = null;
    let lastModelError: any = null;

    // 1. First Tier: Try dedicated Google Gemini 3.5 Transcribe on the Interactions API
    try {
      console.log(`[GEMINI 3.5 TRANSCRIBE] Invoking dedicated speech model 'gemini-3.5-transcribe' on Interactions API...`);
      const interactionsRes = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`,
        {
          model: "gemini-3.5-transcribe",
          input: [
            {
              type: "audio",
              uri: fileUri,
              mime_type: "audio/mp3",
            },
          ],
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 600000, // 10 minutes timeout
          validateStatus: () => true,
        }
      );

      if (interactionsRes.status === 200 && interactionsRes.data) {
        const data = interactionsRes.data;
        if (Array.isArray(data.segments) && data.segments.length > 0) {
          transcriptionData = {
            entries: data.segments.map((s: any) => ({
              speaker_id: s.speaker_tag || s.speaker || "Speaker 1",
              start_time_seconds: Number(s.start_offset ?? s.start_time_seconds ?? 0),
              end_time_seconds: Number(s.end_offset ?? s.end_time_seconds ?? 0),
              transcript: String(s.text || s.transcript || "").trim(),
            })),
          };
          console.log(`[GEMINI 3.5 TRANSCRIBE] Success! Interactions API returned ${transcriptionData.entries.length} diarized segments.`);
        } else if (Array.isArray(data.entries) && data.entries.length > 0) {
          transcriptionData = { entries: data.entries };
          console.log(`[GEMINI 3.5 TRANSCRIBE] Success! Interactions API returned ${transcriptionData.entries.length} entries.`);
        } else if (data.output_text) {
          transcriptionData = {
            entries: [
              {
                speaker_id: "Speaker 1",
                start_time_seconds: 0,
                end_time_seconds: slice.durationSeconds || 0,
                transcript: data.output_text.trim(),
              },
            ],
          };
          console.log(`[GEMINI 3.5 TRANSCRIBE] Success! Received output_text (${data.output_text.length} chars).`);
        }
      } else {
        lastModelError = interactionsRes.data;
        console.warn(`[GEMINI 3.5 TRANSCRIBE] Interactions API returned HTTP ${interactionsRes.status}. Cascading to Gemini 3.6 Flash...`);
      }
    } catch (intErr: any) {
      console.warn(`[GEMINI 3.5 TRANSCRIBE] Interactions API cascade:`, intErr.message);
    }

    // 2. Second Tier: Fallback to Gemini 3.6 Flash / 3.5 Flash Multimodal Speech Diarization
    if (!transcriptionData || transcriptionData.entries.length === 0) {
      const speakerHint = numSpeakers ? `There are approximately ${numSpeakers} distinct speakers in this meeting.` : "Identify distinct speakers (e.g. Speaker 1, Speaker 2).";
      const durationNotice = slice.durationSeconds > 0
        ? `CRITICAL TIMELINE: This audio clip duration is EXACTLY ${Math.round(slice.durationSeconds)} seconds long. The first word begins at 0.0s and the last word finishes at or before ${Math.round(slice.durationSeconds)}.0s. All start_time_seconds and end_time_seconds must accurately reflect this timeline.`
        : "";

      const prompt = `You are a world-class speech-to-text intelligence system.
Transcribe the provided audio file with extreme accuracy, verbatim fidelity, and precise speaker diarization.

${speakerHint}
${durationNotice}

Requirements:
1. Provide exact start_time_seconds and end_time_seconds (relative to the beginning of this audio chunk starting at 0.0s) for each spoken turn.
2. Attribute each dialogue segment to the appropriate speaker label ("Speaker 1", "Speaker 2", etc.).
3. Clean up stuttering and disfluencies (remove "um", "uh", "ah", "you know") while keeping the speaker's exact meaning intact.
4. Auto-format numbers, dates, acronyms, and punctuation properly.
5. Return ONLY a valid JSON object matching the requested schema.

Response Schema:
{
  "entries": [
    {
      "speaker_id": "Speaker 1",
      "start_time_seconds": 0.0,
      "end_time_seconds": 4.8,
      "transcript": "Hello everyone, welcome to the meeting."
    }
  ]
}`;

      const modelsToTry = ["gemini-3.6-flash", "gemini-3.5-flash"];

      for (const modelName of modelsToTry) {
        try {
          console.log(`[GEMINI TRANSCRIBE] Invoking multimodal model ${modelName}...`);
          const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

          const generateRes = await axios.post(
            generateUrl,
            {
              contents: [
                {
                  parts: [
                    {
                      file_data: {
                        file_uri: fileUri,
                        mime_type: "audio/mp3",
                      },
                    },
                    {
                      text: prompt,
                    },
                  ],
                },
              ],
              generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.1,
              },
            },
            {
              headers: {
                "Content-Type": "application/json",
              },
              timeout: 600000, // 10 minutes timeout for processing
              validateStatus: () => true,
            }
          );

          if (generateRes.status === 200) {
            const rawText = generateRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText) {
              transcriptionData = JSON.parse(rawText.trim());
              console.log(`[GEMINI TRANSCRIBE] Model ${modelName} returned ${transcriptionData?.entries?.length || 0} diarized segments!`);
              break;
            }
          } else if (generateRes.status === 429) {
            throw new Error(`Rate limit exceeded (429): ${JSON.stringify(generateRes.data)}`);
          } else {
            lastModelError = generateRes.data;
            console.warn(`[GEMINI TRANSCRIBE] Model ${modelName} returned HTTP ${generateRes.status}, trying fallback...`);
          }
        } catch (mErr: any) {
          if (mErr.message?.includes("429") || mErr.message?.includes("quota")) {
            throw mErr;
          }
          lastModelError = mErr;
        }
      }
    }

    if (!transcriptionData || !Array.isArray(transcriptionData.entries) || transcriptionData.entries.length === 0) {
      throw new Error(`Gemini transcription failed to produce segments. Last error: ${JSON.stringify(lastModelError)}`);
    }

    // Calibrate timestamps to ensure they align with the probed audio duration
    const rawEntries = transcriptionData.entries;
    if (slice.durationSeconds > 0 && rawEntries.length > 0) {
      const maxRawEnd = Math.max(...rawEntries.map((e) => e.end_time_seconds));
      if (maxRawEnd > slice.durationSeconds + 1) {
        const scaleFactor = slice.durationSeconds / maxRawEnd;
        for (const e of rawEntries) {
          e.start_time_seconds = Math.round(e.start_time_seconds * scaleFactor * 100) / 100;
          e.end_time_seconds = Math.min(
            slice.durationSeconds,
            Math.round(e.end_time_seconds * scaleFactor * 100) / 100
          );
        }
      }
    }

    await reportKeySuccess(keyId);
    return { entries: rawEntries };

  } catch (error: any) {
    console.error(`[GEMINI KEY ERROR] Part ${slice.partIndex} with key ${keyId.slice(0, 8)} failed:`, error.message);

    const isTimeout = error.code === "ECONNABORTED" || error.message?.includes("timeout");
    if (!isTimeout) {
      if (error.message?.includes("429") || error.message?.includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED")) {
        await reportKeyRateLimit(keyId, 60, error.message);
      } else if (error.message?.includes("402") || error.message?.includes("insufficient_quota")) {
        await reportKeyExhausted(keyId, error.message);
      }
    }

    // Rotate to next available key
    return transcribeSingleAudioSlice(audioBuffer, slice, languageCode, numSpeakers, [...excludedKeyIds, keyId]);
  } finally {
    if (fileResourceName) {
      await deleteGoogleAIFile(fileResourceName, apiKey);
    }
  }
}

/**
 * Starts Gemini 3.5 Transcribe for a meeting (supporting automatic slicing for long audios)
 */
export async function startGeminiTranscriptionJob(
  meetingId: string,
  audioUrl: string,
  languageCode: string = "unknown",
  numSpeakers?: number
): Promise<{ jobId: string }> {
  console.log(`[GEMINI 3.5] Starting transcription pipeline for meeting ${meetingId}...`);

  const audioBuffer = await downloadAudioBuffer(audioUrl);
  const slices = await sliceAudioBuffer(audioBuffer);

  console.log(`[GEMINI 3.5] Audio processed into ${slices.length} part(s). Processing in parallel...`);

  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      progressMessage: `Transcribing audio with Google Gemini 3.5 Transcribe (${slices.length} part${slices.length > 1 ? "s" : ""})...`,
    },
  });

  const partPromises = slices.map((slice) =>
    transcribeSingleAudioSlice(slice.buffer, slice, languageCode, numSpeakers)
  );

  const results = await Promise.all(partPromises);

  // Recalibrate timestamps across parts
  const allEntries: GeminiTranscriptEntry[] = [];
  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    const partEntries = results[i].entries;

    for (const entry of partEntries) {
      allEntries.push({
        speaker_id: entry.speaker_id || "Speaker 1",
        start_time_seconds: Math.round((entry.start_time_seconds + slice.startOffsetSeconds) * 100) / 100,
        end_time_seconds: Math.round((entry.end_time_seconds + slice.startOffsetSeconds) * 100) / 100,
        transcript: entry.transcript,
      });
    }
  }

  const jobId = `gemini_${meetingId}_${Date.now()}`;
  (globalThis as any)[`gemini_transcription_${jobId}`] = allEntries;

  return { jobId };
}

export function getStoredGeminiEntries(jobId: string): GeminiTranscriptEntry[] | null {
  return (globalThis as any)[`gemini_transcription_${jobId}`] || null;
}

export function clearStoredGeminiEntries(jobId: string): void {
  delete (globalThis as any)[`gemini_transcription_${jobId}`];
}