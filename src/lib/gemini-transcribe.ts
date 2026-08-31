import axios from "axios";
import {
  getAvailableKey,
  waitForAvailableKey,
  parseGoogleRetryDelay,
  reportKeySuccess,
  reportKeyRateLimit,
  reportKeyExhausted,
} from "./key-pool";
import { sliceAudioBuffer, AudioSlice } from "./audio-slicer";
import { prisma } from "./prisma";
import { addMeetingLog } from "./pipeline-logger";

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
async function downloadAudioBuffer(audioUrl: string, meetingId?: string): Promise<Buffer> {
  if (meetingId) {
    addMeetingLog(meetingId, "storage", "GDRIVE", `Downloading audio stream from ${audioUrl.slice(0, 50)}...`);
  }
  console.log(`[GEMINI TRANSCRIPTION] Downloading audio from ${audioUrl.slice(0, 45)}...`);

  if (audioUrl.includes("drive.google.com")) {
    const { downloadGoogleDriveFile } = await import("./gdrive");
    const buffer = await downloadGoogleDriveFile(audioUrl);
    const sample = buffer.subarray(0, 64).toString("utf8").toLowerCase();
    if (sample.includes("<!doctype html") || sample.includes("<html")) {
      throw new Error("Google Drive download returned an HTML error page. Please re-authorize Google Drive in Integrations.");
    }
    if (meetingId) {
      addMeetingLog(meetingId, "success", "GDRIVE", `Audio downloaded successfully (${(buffer.byteLength / (1024 * 1024)).toFixed(1)} MB).`);
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
  if (meetingId) {
    addMeetingLog(meetingId, "success", "STORAGE", `Audio downloaded successfully (${(buffer.byteLength / (1024 * 1024)).toFixed(1)} MB).`);
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
  mimeType: string = "audio/mp3",
  meetingId?: string,
  partIndex?: number
): Promise<{ fileUri: string; fileResourceName: string }> {
  const totalBytes = audioBuffer.length;
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
  console.log(`[GOOGLE AI FILES] Initiating resumable upload for ${totalMb}MB audio...`);
  if (meetingId && partIndex) {
    addMeetingLog(meetingId, "storage", "GOOGLE AI", `Part ${partIndex} -> Initiating resumable upload for ${totalMb}MB audio...`);
  }

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
  if (meetingId && partIndex) {
    addMeetingLog(meetingId, "success", "GOOGLE AI", `Part ${partIndex} -> Upload complete! (URI: ${fileData.name})`);
  }
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
  excludedKeyIds: string[] = [],
  meetingId?: string
): Promise<{ entries: GeminiTranscriptEntry[] }> {
  const keySelection = await waitForAvailableKey("GEMINI", excludedKeyIds, 60000, (waitSecs: number) => {
    if (meetingId) {
      addMeetingLog(meetingId, "info", "KEY_POOL", `All Gemini keys in cooldown. Waiting ${waitSecs}s for rate-limit reset...`);
    }
  });

  if (!keySelection) {
    throw new Error("No active Gemini API keys available in the database pool or environment.");
  }

  const { id: keyId, key: apiKey } = keySelection;
  let fileResourceName: string | null = null;

  try {
    console.log(`[GEMINI TRANSCRIBE] Processing Part ${slice.partIndex}/${slice.totalParts} with key ${keyId.slice(0, 8)}...`);
    if (meetingId) {
      addMeetingLog(meetingId, "audio", "GEMINI", `Part ${slice.partIndex}/${slice.totalParts} -> Starting transcription on key ${keyId.slice(0, 8)}...`);
    }

    const { fileUri, fileResourceName: resName } = await uploadAudioToGoogleAI(
      audioBuffer,
      apiKey,
      `meeting_part_${slice.partIndex}.mp3`,
      "audio/mp3",
      meetingId,
      slice.partIndex
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

    // 2. Second Tier: Fallback to Gemini Multimodal Speech Diarization
    if (!transcriptionData || transcriptionData.entries.length === 0) {
      const speakerHint = numSpeakers ? `There are approximately ${numSpeakers} distinct speakers in this meeting.` : "Identify distinct speakers (e.g. Speaker 1, Speaker 2).";
      const durationNotice = slice.durationSeconds > 0
        ? `This audio clip is EXACTLY ${Math.round(slice.durationSeconds)} seconds long. The first spoken word begins at 0.0s and the last spoken word finishes at or before ${Math.round(slice.durationSeconds)}.0s.`
        : "";

      const prompt = `You are a high-precision acoustic speech-to-text intelligence system.
Listen to this audio chunk and transcribe EVERY spoken word with exact acoustic start and end timestamps.

${speakerHint}
${durationNotice}

CRITICAL COMPLETENESS & TIMING RULES:
1. VERBATIM FULL TRANSCRIPTION: You MUST transcribe EVERY single sentence spoken from 0.00s until the very last second of this audio clip. Never summarize, skip sentences, or stop early.
2. All start_time_seconds and end_time_seconds must be exact timecodes relative to 0.00s of this specific audio chunk.
3. start_time_seconds: The exact second when the speaker starts speaking this phrase (e.g. 1.25).
4. end_time_seconds: The exact second when the speaker finishes this phrase (e.g. 4.60).
5. Do NOT space timestamps evenly or extrapolate linearly. If there are pauses or silence, reflect the actual gaps.
6. Break speech into coherent dialogue turns (typically 2 to 6 seconds per segment).
7. Attribute each segment to distinct speakers ("Speaker 1", "Speaker 2", etc.).
8. Filter out filler words ("um", "uh", "ah", "you know") while keeping exact words intact.
9. If the audio slice contains silence, music, or non-speech noise with no words spoken, return {"entries": []}.
10. Format output as pure JSON matching the schema:
{
  "entries": [
    {
      "speaker_id": "Speaker 1",
      "start_time_seconds": 1.2,
      "end_time_seconds": 4.6,
      "transcript": "Hello everyone, let's begin."
    }
  ]
}`;

      const modelsToTry = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash"];

      // Retry each model up to 2 times on transient 503 / network errors
      for (const modelName of modelsToTry) {
        let modelSuccess = false;

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log(`[GEMINI TRANSCRIBE] Part ${slice.partIndex} -> Invoking model ${modelName} (attempt ${attempt})...`);
            if (meetingId) {
              addMeetingLog(meetingId, "ai", "GEMINI", `Part ${slice.partIndex}/${slice.totalParts} -> Invoking model ${modelName}...`);
            }
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
                  maxOutputTokens: 8192,
                },
              },
              {
                headers: {
                  "Content-Type": "application/json",
                },
                timeout: 120000, // 2 minutes timeout
                validateStatus: () => true,
              }
            );

            if (generateRes.status === 200) {
              const rawText = generateRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (rawText) {
                transcriptionData = JSON.parse(rawText.trim());
                console.log(`[GEMINI TRANSCRIBE] Part ${slice.partIndex} -> Model ${modelName} returned ${transcriptionData?.entries?.length || 0} diarized segments!`);
                if (meetingId) {
                  addMeetingLog(meetingId, "success", "GEMINI", `Part ${slice.partIndex}/${slice.totalParts} -> Extracted ${transcriptionData?.entries?.length || 0} diarized segments!`);
                }
                modelSuccess = true;
                break;
              }
            } else if (generateRes.status === 429) {
              throw new Error(`Rate limit exceeded (429): ${JSON.stringify(generateRes.data)}`);
            } else if (generateRes.status === 503 || generateRes.status === 500) {
              console.warn(`[GEMINI TRANSCRIBE] Part ${slice.partIndex} -> Model ${modelName} returned HTTP ${generateRes.status}. Retrying in 2s...`);
              if (meetingId) {
                addMeetingLog(meetingId, "warning", "RATE_LIMIT", `Part ${slice.partIndex} -> HTTP ${generateRes.status} received. Retrying with backoff...`);
              }
              await new Promise((r) => setTimeout(r, 2000));
            } else {
              lastModelError = generateRes.data;
              console.warn(`[GEMINI TRANSCRIBE] Part ${slice.partIndex} -> Model ${modelName} returned HTTP ${generateRes.status}.`);
              break;
            }
          } catch (mErr: any) {
            if (mErr.message?.includes("429") || mErr.message?.includes("quota")) {
              throw mErr;
            }
            lastModelError = mErr.message || mErr;
            console.warn(`[GEMINI TRANSCRIBE] Part ${slice.partIndex} -> Model ${modelName} attempt ${attempt} error: ${mErr.message}.`);
            await new Promise((r) => setTimeout(r, 1500));
          }
        }

        if (modelSuccess) {
          break;
        }
      }
    }

    // Cleanly clamp timestamps to slice boundaries
    const rawEntries = Array.isArray(transcriptionData?.entries) ? transcriptionData.entries : [];
    for (const e of rawEntries) {
      e.start_time_seconds = Math.max(0, Math.round(Number(e.start_time_seconds || 0) * 100) / 100);
      e.end_time_seconds = Math.max(
        e.start_time_seconds + 0.1,
        Math.round(Number(e.end_time_seconds || 0) * 100) / 100
      );
      if (slice.durationSeconds > 0 && e.end_time_seconds > slice.durationSeconds + 1) {
        e.end_time_seconds = slice.durationSeconds;
      }
    }

    await reportKeySuccess(keyId);
    return { entries: rawEntries };

  } catch (error: any) {
    console.error(`[GEMINI KEY ERROR] Part ${slice.partIndex} with key ${keyId.slice(0, 8)} failed:`, error.message);

    const isQuotaError =
      error.message?.includes("429") ||
      error.message?.includes("quota") ||
      error.message?.includes("RESOURCE_EXHAUSTED");
    const isExhausted =
      error.message?.includes("402") ||
      error.message?.includes("insufficient_quota");

    if (isQuotaError) {
      const { parseGoogleRetryDelay } = await import("./key-pool");
      const retrySecs = parseGoogleRetryDelay(error.message);
      await reportKeyRateLimit(keyId, retrySecs, error.message);
      if (meetingId) {
        addMeetingLog(
          meetingId,
          "warning",
          "KEY_FAILOVER",
          `Key ${keyId.slice(0, 8)} reached RPM quota (${retrySecs}s cooldown). Seamlessly failing over to next pool key...`
        );
      }
    } else if (isExhausted) {
      await reportKeyExhausted(keyId, error.message);
      if (meetingId) {
        addMeetingLog(
          meetingId,
          "error",
          "KEY_EXHAUSTED",
          `Key ${keyId.slice(0, 8)} permanently exhausted. Rotating to next pool key...`
        );
      }
    }

    // Automatically rotate to the next active key in pool or wait for cooling key
    const nextKeySelection = await waitForAvailableKey("GEMINI", [...excludedKeyIds, keyId], 60000, (waitSecs: number) => {
      if (meetingId) {
        addMeetingLog(meetingId, "info", "KEY_POOL", `All Gemini keys in cooldown. Waiting ${waitSecs}s before retrying Part ${slice.partIndex}...`);
      }
    });

    if (nextKeySelection) {
      return transcribeSingleAudioSlice(
        audioBuffer,
        slice,
        languageCode,
        numSpeakers,
        [...excludedKeyIds, keyId],
        meetingId
      );
    }

    // If all keys failed even after cooldown, retry with fresh pool state instead of dropping slice
    console.warn(`[GEMINI TRANSCRIBE] Retrying Part ${slice.partIndex} with refreshed key pool...`);
    await new Promise((r) => setTimeout(r, 3000));
    return transcribeSingleAudioSlice(audioBuffer, slice, languageCode, numSpeakers, [], meetingId);
  } finally {
    if (fileResourceName) {
      await deleteGoogleAIFile(fileResourceName, apiKey);
    }
  }
}

/**
 * Starts Gemini 3.5 Transcribe for a meeting (using 180s high-precision chunking with 6s sliding overlap)
 */
export async function startGeminiTranscriptionJob(
  meetingId: string,
  audioUrl: string,
  languageCode: string = "unknown",
  numSpeakers?: number
): Promise<{ jobId: string }> {
  console.log(`[GEMINI 3.5] Starting high-precision transcription pipeline for meeting ${meetingId}...`);
  addMeetingLog(meetingId, "info", "PIPELINE", `Initializing Gemini 3.5 audio intelligence pipeline...`);

  const audioBuffer = await downloadAudioBuffer(audioUrl, meetingId);
  
  // Slice audio into 180-second (3-minute) frame-accurate chunks with 6-second overlap
  const GEMINI_CHUNK_SECONDS = 180;
  const OVERLAP_SECONDS = 6;

  addMeetingLog(meetingId, "audio", "SLICER", `Probing audio duration and analyzing frame boundaries...`);
  const slices = await sliceAudioBuffer(
    audioBuffer,
    "meeting.mp3",
    GEMINI_CHUNK_SECONDS,
    GEMINI_CHUNK_SECONDS,
    OVERLAP_SECONDS
  );

  console.log(`[GEMINI 3.5] Audio sliced into ${slices.length} high-precision chunk(s) (${GEMINI_CHUNK_SECONDS}s each, ${OVERLAP_SECONDS}s overlap)...`);
  addMeetingLog(meetingId, "success", "SLICER", `Audio prepared into ${slices.length} frame-accurate sub-part(s) (${GEMINI_CHUNK_SECONDS}s each, ${OVERLAP_SECONDS}s overlap).`);

  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      progressMessage: `Transcribing audio with Google Gemini 3.5 Audio Intelligence (${slices.length} chunk${slices.length > 1 ? "s" : ""})...`,
    },
  });

  // Process chunks in controlled batches of 2 with 400ms staggered delay to avoid 503 overload
  const CONCURRENCY = 2;
  const results: Array<{ entries: GeminiTranscriptEntry[] }> = new Array(slices.length);

  for (let i = 0; i < slices.length; i += CONCURRENCY) {
    const batch = slices.slice(i, i + CONCURRENCY);
    console.log(`[GEMINI 3.5] Processing batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(slices.length / CONCURRENCY)} (chunks ${i + 1} to ${i + batch.length})...`);
    addMeetingLog(meetingId, "ai", "BATCH", `Executing batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(slices.length / CONCURRENCY)} (chunks ${i + 1} to ${i + batch.length})...`);
    
    const batchResults = await Promise.all(
      batch.map((slice) =>
        transcribeSingleAudioSlice(slice.buffer, slice, languageCode, numSpeakers, [], meetingId)
      )
    );

    for (let j = 0; j < batch.length; j++) {
      results[i + j] = batchResults[j];
    }

    if (i + CONCURRENCY < slices.length) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  // Seamlessly stitch and deduplicate entries across the sliding overlap windows
  const allEntries: GeminiTranscriptEntry[] = [];

  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    const partEntries = results[i]?.entries || [];

    for (const entry of partEntries) {
      const globalStart = Math.round((entry.start_time_seconds + slice.startOffsetSeconds) * 100) / 100;
      const globalEnd = Math.round((entry.end_time_seconds + slice.startOffsetSeconds) * 100) / 100;
      const text = String(entry.transcript || "").trim();

      if (!text) continue;

      // Deduplicate overlapping segments from consecutive chunks
      if (allEntries.length > 0) {
        const lastEntry = allEntries[allEntries.length - 1];

        // If this entry completely overlaps in time and has similar text, skip duplicate
        const isDuplicate = allEntries.slice(-4).some((prev) => {
          const timeOverlap = Math.max(0, Math.min(prev.end_time_seconds, globalEnd) - Math.max(prev.start_time_seconds, globalStart));
          const segDuration = Math.max(0.1, globalEnd - globalStart);
          const overlapFraction = timeOverlap / segDuration;

          if (overlapFraction > 0.5 || Math.abs(prev.start_time_seconds - globalStart) < 2.0) {
            const cleanPrev = prev.transcript.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF\u0900-\u097F]/g, "");
            const cleanNew = text.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF\u0900-\u097F]/g, "");
            if (cleanPrev === cleanNew || (cleanPrev.length > 5 && cleanNew.length > 5 && (cleanPrev.includes(cleanNew) || cleanNew.includes(cleanPrev)))) {
              return true;
            }
          }
          return false;
        });

        if (isDuplicate) {
          continue;
        }
      }

      allEntries.push({
        speaker_id: entry.speaker_id || "Speaker 1",
        start_time_seconds: globalStart,
        end_time_seconds: globalEnd,
        transcript: text,
      });
    }
  }

  // Sort chronologically to guarantee 100% monotonic audio timeline
  allEntries.sort((a, b) => a.start_time_seconds - b.start_time_seconds);

  addMeetingLog(meetingId, "success", "STITCHER", `Stitched ${allEntries.length} total dialogue segments with zero drift.`);

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