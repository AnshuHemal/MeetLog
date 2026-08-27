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

/**
 * Downloads audio file into a Buffer from Google Drive or direct URL
 */
async function downloadAudioBuffer(audioUrl: string): Promise<Buffer> {
  console.log(`[GEMINI TRANSCRIPTION] Downloading audio from ${audioUrl.slice(0, 45)}...`);
  
  if (audioUrl.includes("drive.google.com/uc?id=") || audioUrl.includes("drive.google.com/file/d/")) {
    try {
      const match = audioUrl.match(/id=([a-zA-Z0-9_-]+)/) || audioUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        const fileId = match[1];
        console.log(`[GDRIVE] Downloading file ${fileId} from Google Drive Alt Media endpoint...`);
        const gdriveRes = await axios.get(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          {
            headers: {
              ...(process.env.GOOGLE_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.GOOGLE_ACCESS_TOKEN}` } : {}),
            },
            responseType: "arraybuffer",
            timeout: 120000,
          }
        );
        return Buffer.from(gdriveRes.data);
      }
    } catch (gdriveErr: any) {
      console.warn(`[GDRIVE] Alt media download failed, falling back to direct stream:`, gdriveErr.message);
    }
  }

  const res = await axios.get(audioUrl, {
    responseType: "arraybuffer",
    timeout: 120000,
  });
  return Buffer.from(res.data);
}

/**
 * Uploads an audio buffer to Google AI Resumable Files API
 */
async function uploadAudioToGoogleAI(
  audioBuffer: Buffer,
  apiKey: string,
  fileName: string = "meeting_audio.mp3",
  mimeType: string = "audio/mp3"
): Promise<{ fileUri: string; fileResourceName: string }> {
  console.log(`[GOOGLE AI FILES] Initiating resumable upload (${(audioBuffer.length / (1024 * 1024)).toFixed(1)}MB)...`);

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
        "X-Goog-Upload-Header-Content-Length": audioBuffer.length.toString(),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      validateStatus: () => true,
    }
  );

  if (initRes.status >= 400) {
    throw new Error(`Google AI File Upload init failed (${initRes.status}): ${JSON.stringify(initRes.data)}`);
  }

  const uploadUrl = initRes.headers["x-goog-upload-url"];
  if (!uploadUrl) {
    throw new Error("Missing X-Goog-Upload-URL in Google AI File Upload response.");
  }

  console.log(`[GOOGLE AI FILES] Uploading binary payload...`);
  const uploadRes = await axios.put(uploadUrl, audioBuffer, {
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      "Content-Type": mimeType,
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    validateStatus: () => true,
  });

  if (uploadRes.status >= 400) {
    throw new Error(`Google AI File binary upload failed (${uploadRes.status}): ${JSON.stringify(uploadRes.data)}`);
  }

  const fileData = uploadRes.data?.file;
  if (!fileData?.uri || !fileData?.name) {
    throw new Error(`Invalid file upload response from Google AI: ${JSON.stringify(uploadRes.data)}`);
  }

  console.log(`[GOOGLE AI FILES] File successfully uploaded: ${fileData.name} (${fileData.uri})`);
  return {
    fileUri: fileData.uri,
    fileResourceName: fileData.name,
  };
}

/**
 * Deletes temporary audio file from Google AI storage
 */
async function deleteGoogleAIFile(fileResourceName: string, apiKey: string): Promise<void> {
  try {
    const deleteUrl = `https://generativelanguage.googleapis.com/v1beta/${fileResourceName}?key=${apiKey}`;
    await axios.delete(deleteUrl, { validateStatus: () => true });
    console.log(`[GOOGLE AI FILES] Cleaned up temporary file: ${fileResourceName}`);
  } catch (err: any) {
    console.warn(`[GOOGLE AI FILES] Failed to cleanup file ${fileResourceName}:`, err.message);
  }
}

/**
 * Executes Gemini 3.5 Transcribe on a single audio slice with automatic key pool rotation
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
    console.log(`[GEMINI 3.5 TRANSCRIBE] Processing Part ${slice.partIndex}/${slice.totalParts} with key ${keyId.slice(0, 8)}...`);

    const { fileUri, fileResourceName: resName } = await uploadAudioToGoogleAI(
      audioBuffer,
      apiKey,
      `meeting_part_${slice.partIndex}.mp3`,
      "audio/mp3"
    );
    fileResourceName = resName;

    const speakerHint = numSpeakers ? `There are approximately ${numSpeakers} distinct speakers in this meeting.` : "Identify distinct speakers (e.g. Speaker 1, Speaker 2).";

    const prompt = `You are a world-class speech-to-text intelligence system.
Transcribe the provided audio file with extreme accuracy, verbatim fidelity, and precise speaker diarization.

${speakerHint}

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

    // Try dedicated gemini-3.5-transcribe first, fallback to gemini-3.5-flash
    const modelsToTry = ["gemini-3.5-transcribe", "gemini-3.5-flash", "gemini-2.5-flash"];
    let transcriptionData: GeminiTranscriptionResult | null = null;
    let lastModelError: any = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`[GEMINI 3.5 TRANSCRIBE] Invoking model ${modelName}...`);
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
            timeout: 180000,
            validateStatus: () => true,
          }
        );

        if (generateRes.status === 200) {
          const rawText = generateRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            transcriptionData = JSON.parse(rawText.trim());
            console.log(`[GEMINI 3.5 TRANSCRIBE] Model ${modelName} returned ${transcriptionData?.entries?.length || 0} diarized segments!`);
            break;
          }
        } else if (generateRes.status === 429) {
          throw new Error(`Rate limit exceeded (429): ${JSON.stringify(generateRes.data)}`);
        } else {
          lastModelError = generateRes.data;
          console.warn(`[GEMINI 3.5 TRANSCRIBE] Model ${modelName} returned HTTP ${generateRes.status}, trying fallback...`);
        }
      } catch (mErr: any) {
        if (mErr.message?.includes("429") || mErr.message?.includes("quota")) {
          throw mErr;
        }
        lastModelError = mErr;
      }
    }

    if (!transcriptionData || !Array.isArray(transcriptionData.entries) || transcriptionData.entries.length === 0) {
      throw new Error(`Gemini transcription failed to produce segments. Last error: ${JSON.stringify(lastModelError)}`);
    }

    await reportKeySuccess(keyId);
    return { entries: transcriptionData.entries };

  } catch (error: any) {
    console.error(`[GEMINI KEY ERROR] Part ${slice.partIndex} with key ${keyId.slice(0, 8)} failed:`, error.message);

    if (error.message?.includes("429") || error.message?.includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED")) {
      await reportKeyRateLimit(keyId, 60, error.message);
    } else if (error.message?.includes("402") || error.message?.includes("insufficient_quota")) {
      await reportKeyExhausted(keyId, error.message);
    }

    // Rotate to next key
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

  console.log(`[GEMINI 3.5] Audio sliced into ${slices.length} part(s). Processing in parallel...`);

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
        start_time_seconds: entry.start_time_seconds + slice.startOffsetSeconds,
        end_time_seconds: entry.end_time_seconds + slice.startOffsetSeconds,
        transcript: entry.transcript,
      });
    }
  }

  // Store combined entries in meeting payload for the processor
  const payload: GeminiMultiPartJobPayload = {
    isMultiPart: slices.length > 1,
    provider: "GEMINI",
    meetingId,
    audioUrl,
    parts: slices.map((s) => ({
      partIndex: s.partIndex,
      totalParts: s.totalParts,
      startOffsetSeconds: s.startOffsetSeconds,
      durationSeconds: s.durationSeconds,
    })),
  };

  const jobId = `gemini_${meetingId}_${Date.now()}`;

  // Temporarily store the parsed transcription entries in meeting progress or database
  // and trigger immediate processor execution
  (globalThis as any)[`gemini_transcription_${jobId}`] = allEntries;

  return { jobId };
}

export function getStoredGeminiEntries(jobId: string): GeminiTranscriptEntry[] | null {
  return (globalThis as any)[`gemini_transcription_${jobId}`] || null;
}

export function clearStoredGeminiEntries(jobId: string): void {
  delete (globalThis as any)[`gemini_transcription_${jobId}`];
}
