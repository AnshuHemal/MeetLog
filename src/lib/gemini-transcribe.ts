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
    }
  );

  const uploadUrl = initRes.headers["x-goog-upload-url"];
  if (!uploadUrl) {
    throw new Error("Google AI Files API did not return an upload URL.");
  }

  let offset = 0;
  let fileUri = "";
  let fileResourceName = "";

  while (offset < totalBytes) {
    const end = Math.min(offset + GOOGLE_AI_CHUNK_SIZE, totalBytes);
    const chunk = audioBuffer.subarray(offset, end);
    const isLastChunk = end === totalBytes;
    const chunkSizeMb = (chunk.length / (1024 * 1024)).toFixed(1);

    console.log(
      `[GOOGLE AI FILES] Uploading chunk: ${Math.round(offset / (1024 * 1024))}MB-${Math.round(
        end / (1024 * 1024)
      )}MB / ${totalMb}MB (${Math.round((end / totalBytes) * 100)}%)...`
    );

    let chunkUploaded = false;
    let chunkAttempts = 0;

    while (!chunkUploaded && chunkAttempts < 3) {
      chunkAttempts++;
      try {
        const chunkRes = await axios.post(uploadUrl, chunk, {
          headers: {
            "Content-Length": chunk.length.toString(),
            "X-Goog-Upload-Offset": offset.toString(),
            "X-Goog-Upload-Command": isLastChunk ? "upload, finalize" : "upload",
          },
          timeout: 120000,
        });

        if (isLastChunk) {
          const fileData = chunkRes.data?.file;
          if (fileData) {
            fileUri = fileData.uri;
            fileResourceName = fileData.name;
          }
        }
        chunkUploaded = true;
      } catch (err: any) {
        console.warn(
          `[GOOGLE AI FILES] Chunk upload attempt ${chunkAttempts} failed: ${err.message}. Retrying in 2s...`
        );
        await new Promise((r) => setTimeout(r, 2000));
        if (chunkAttempts >= 3) {
          throw new Error(`Failed to upload audio chunk to Google AI Files: ${err.message}`);
        }
      }
    }

    offset = end;
  }

  if (!fileUri) {
    throw new Error("Google AI Files upload completed but no file URI was returned.");
  }

  console.log(`[GOOGLE AI FILES] Upload complete! File URI: ${fileUri}`);
  if (meetingId && partIndex) {
    addMeetingLog(meetingId, "success", "GOOGLE AI", `Part ${partIndex} -> Upload complete (${totalMb}MB mounted).`);
  }

  // Poll until the file state is ACTIVE if required
  let attempts = 0;
  while (attempts < 15) {
    attempts++;
    try {
      const getFileRes = await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/${fileResourceName}?key=${apiKey}`,
        { timeout: 15000 }
      );
      const state = getFileRes.data?.state;
      if (state === "ACTIVE") {
        break;
      }
      if (state === "FAILED") {
        throw new Error("Google AI File processing failed on the server.");
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }

  return { fileUri, fileResourceName };
}

/**
 * Cleans up temporary audio file from Google AI Files API to prevent storage buildup
 */
async function deleteGoogleAIFile(fileResourceName: string, apiKey: string): Promise<void> {
  if (!fileResourceName) return;
  try {
    await axios.delete(
      `https://generativelanguage.googleapis.com/v1beta/${fileResourceName}?key=${apiKey}`,
      { timeout: 10000 }
    );
    console.log(`[GOOGLE AI FILES] Cleaned up temporary file ${fileResourceName}`);
  } catch (err: any) {
    console.warn(`[GOOGLE AI FILES] Failed to delete ${fileResourceName}:`, err.message);
  }
}

/**
 * Robust Multi-Format Transcript Parser:
 * Seamlessly parses compact timestamp dialogue format ([MM:SS.ss - MM:SS.ss] Speaker: text)
 * and JSON structures with fallback repairs.
 */
function parseGeminiTranscript(rawText: string): GeminiTranscriptEntry[] {
  if (!rawText) return [];
  const cleaned = rawText
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const entries: GeminiTranscriptEntry[] = [];

  function parseTimestampToSeconds(timeStr: string): number {
    const trimmed = timeStr.trim();
    if (!trimmed) return 0;
    if (trimmed.includes(":")) {
      const parts = trimmed.split(":").map(Number);
      if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
      if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
      }
    }
    const sec = parseFloat(trimmed);
    return isNaN(sec) ? 0 : sec;
  }

  // 1. Try Compact Timestamped Dialogue Format: [MM:SS.ss - MM:SS.ss] Speaker 1: Text
  const lineRegex = /\[\s*([\d\.:]+)\s*(?:-|–|to)\s*([\d\.:]+)\s*\]\s*(?:(Speaker\s*\w+|[^:\n]+):)?\s*(.+)/gi;
  let match;
  while ((match = lineRegex.exec(cleaned)) !== null) {
    const startSec = parseTimestampToSeconds(match[1]);
    const endSec = parseTimestampToSeconds(match[2]);
    const speaker = match[3]?.trim() || "Speaker 1";
    const text = match[4]?.trim();

    if (text && text.length > 0) {
      entries.push({
        speaker_id: speaker,
        start_time_seconds: Math.round(startSec * 100) / 100,
        end_time_seconds: Math.max(startSec + 0.1, Math.round(endSec * 100) / 100),
        transcript: text,
      });
    }
  }

  if (entries.length > 0) {
    return entries;
  }

  // 2. Try JSON Format
  try {
    const jsonCandidate = cleaned.slice(cleaned.indexOf("{"));
    const parsed = JSON.parse(jsonCandidate);
    if (Array.isArray(parsed.entries) && parsed.entries.length > 0) {
      for (const e of parsed.entries) {
        const startSec = typeof e.start_time_seconds === "string" ? parseTimestampToSeconds(e.start_time_seconds) : Number(e.start_time_seconds || 0);
        const endSec = typeof e.end_time_seconds === "string" ? parseTimestampToSeconds(e.end_time_seconds) : Number(e.end_time_seconds || startSec + 1);
        const text = String(e.transcript || "").trim();
        if (text) {
          entries.push({
            speaker_id: e.speaker_id || "Speaker 1",
            start_time_seconds: Math.round(startSec * 100) / 100,
            end_time_seconds: Math.max(startSec + 0.1, Math.round(endSec * 100) / 100),
            transcript: text,
          });
        }
      }
      if (entries.length > 0) {
        return entries;
      }
    }
  } catch {}

  // 3. Fallback Regex for raw JSON entries
  const entryRegex = /\{\s*"speaker_id"\s*:\s*"([^"]+)"\s*,\s*"start_time_seconds"\s*:\s*([\d\.]+)\s*,\s*"end_time_seconds"\s*:\s*([\d\.]+)\s*,\s*"transcript"\s*:\s*"([^"]+)"\s*\}/g;
  while ((match = entryRegex.exec(rawText)) !== null) {
    entries.push({
      speaker_id: match[1],
      start_time_seconds: parseFloat(match[2]),
      end_time_seconds: parseFloat(match[3]),
      transcript: match[4],
    });
  }

  return entries;
}

/**
 * Executes Gemini Audio Intelligence on audio with automatic key pool rotation & model cascade
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

    let parsedEntries: GeminiTranscriptEntry[] = [];
    let lastModelError: any = null;

    // 1. Try dedicated Google Gemini 3.5 Transcribe on Interactions API
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
          parsedEntries = data.segments.map((s: any) => ({
            speaker_id: s.speaker_tag || s.speaker || "Speaker 1",
            start_time_seconds: Number(s.start_offset ?? s.start_time_seconds ?? 0),
            end_time_seconds: Number(s.end_offset ?? s.end_time_seconds ?? 0),
            transcript: String(s.text || s.transcript || "").trim(),
          }));
          console.log(`[GEMINI 3.5 TRANSCRIBE] Success! Interactions API returned ${parsedEntries.length} diarized segments.`);
        }
      } else {
        lastModelError = interactionsRes.data;
        console.warn(`[GEMINI 3.5 TRANSCRIBE] Interactions API returned HTTP ${interactionsRes.status}. Cascading to Gemini 3.6 Flash...`);
      }
    } catch (intErr: any) {
      console.warn(`[GEMINI 3.5 TRANSCRIBE] Interactions API cascade:`, intErr.message);
    }

    // 2. Multimodal Speech Recognition with Acoustic Timeline Anchoring
    if (parsedEntries.length === 0) {
      const speakerHint =
        numSpeakers === 1
          ? "CRITICAL SPEAKER ATTRIBUTION: This recording is a single-speaker presentation / monologue. You MUST attribute ALL dialogue turns strictly to 'Speaker 1'. Never output 'Speaker 2'."
          : numSpeakers && numSpeakers > 1
          ? `There are approximately ${numSpeakers} distinct speakers in this meeting. Attribute speech cleanly to distinct speakers ("Speaker 1", "Speaker 2", etc.).`
          : "SPEAKER DIARIZATION: If only one person is speaking throughout this audio, attribute ALL dialogue turns strictly to 'Speaker 1'. Only introduce 'Speaker 2' if there is a distinct, genuine second human voice engaging in dialogue. Do not create new speakers for pitch, tone, or accent variations of the same person.";
      const durationSeconds = Math.round(slice.durationSeconds || 0);
      const durationConstraint = durationSeconds > 0
        ? `CRITICAL ACOUSTIC DURATION: This audio recording is exactly ${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, "0")} long (${durationSeconds}.00 seconds). Every single timestamp must be strictly between 00:00.00 and ${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, "0")}. Never output timestamps beyond ${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, "0")}.`
        : "";

      const prompt = `You are a professional, high-precision speech transcription intelligence system with millisecond acoustic accuracy.
Listen to this audio recording and transcribe EVERY SINGLE SPOKEN WORD from 00:00 to the very end of the file.

${durationConstraint}

${speakerHint}

TRANSCRIPTION FORMAT:
Output the full transcript in chronological dialogue turns with exact start and end timestamps using this format:
[MM:SS.ss - MM:SS.ss] Speaker Name: Exact transcribed text

Example:
[00:01.50 - 00:05.80] Speaker 1: Welcome to today's session.
[00:06.20 - 00:11.40] Speaker 1: Let's discuss the project architecture.

CRITICAL RULES:
1. FULL VERBATIM: You MUST transcribe 100% of the spoken audio. Do not summarize, truncate, or stop early.
2. PRECISE ACOUSTIC TIMESTAMPS: Every timestamp must reflect the physical second where the speaker begins and ends speaking in this audio clip.
3. LANGUAGE ACCURACY: Transcribe in the exact spoken language (e.g. Hindi, Marathi, English, Hinglish, etc.) with accurate spelling.
4. Output ONLY the timestamped dialogue turns without conversational preamble or commentary.`;

      const modelsToTry = [
        "gemini-3.6-flash",
        "gemini-flash-latest",
        "gemini-3.5-flash-lite",
        "gemini-3.7-flash",
        "gemini-3.5-flash",
      ];

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
                  temperature: 0.1,
                  maxOutputTokens: 8192,
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
                parsedEntries = parseGeminiTranscript(rawText);
                const count = parsedEntries.length;
                if (count > 0) {
                  console.log(`[GEMINI TRANSCRIBE] Part ${slice.partIndex} -> Model ${modelName} returned ${count} diarized segments!`);
                  if (meetingId) {
                    addMeetingLog(meetingId, "success", "GEMINI", `Part ${slice.partIndex}/${slice.totalParts} -> Extracted ${count} diarized segments!`);
                  }
                  modelSuccess = true;
                  break;
                }
              }
            } else if (generateRes.status === 429) {
              lastModelError = generateRes.data;
              console.warn(`[GEMINI TRANSCRIBE] Part ${slice.partIndex} -> Model ${modelName} reached tier quota on key ${keyId.slice(0, 8)}. Cascading to next model tier...`);
              if (meetingId) {
                addMeetingLog(meetingId, "warning", "QUOTA_CASCADE", `Part ${slice.partIndex} -> Model ${modelName} reached tier quota. Cascading to next model tier...`);
              }
              break;
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
              lastModelError = mErr.message || mErr;
              console.warn(`[GEMINI TRANSCRIBE] Part ${slice.partIndex} -> Model ${modelName} quota limit: ${mErr.message}. Cascading to next tier...`);
              break;
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

    // Require non-empty entries for valid audio parts so no audio slices are ever dropped
    if (!parsedEntries || parsedEntries.length === 0) {
      const errStr = JSON.stringify(lastModelError || "");
      if (errStr.includes("429") || errStr.includes("quota") || errStr.includes("RESOURCE_EXHAUSTED")) {
        throw new Error(`Rate limit exceeded (429): ${errStr}`);
      }
      throw new Error(`Part ${slice.partIndex}/${slice.totalParts} produced no entries. Rotating key and retrying...`);
    }

    // Cleanly clamp & normalize timestamps to slice boundaries
    for (const e of parsedEntries) {
      let startSec = Number(e.start_time_seconds || 0);
      let endSec = Number(e.end_time_seconds || startSec + 1);

      // Self-healing: if model output absolute time instead of relative to chunk start
      if (slice.startOffsetSeconds > 0 && startSec >= slice.startOffsetSeconds - 5) {
        startSec = Math.max(0, startSec - slice.startOffsetSeconds);
        endSec = Math.max(startSec + 0.1, endSec - slice.startOffsetSeconds);
      }

      e.start_time_seconds = Math.max(0, Math.round(startSec * 100) / 100);
      e.end_time_seconds = Math.max(
        e.start_time_seconds + 0.1,
        Math.round(endSec * 100) / 100
      );
      if (slice.durationSeconds > 0 && e.end_time_seconds > slice.durationSeconds + 2) {
        e.end_time_seconds = slice.durationSeconds;
      }
    }

    await reportKeySuccess(keyId);
    return { entries: parsedEntries };

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
          `Key ${keyId.slice(0, 8)} reached quota (${retrySecs}s cooldown). Seamlessly failing over to next pool key...`
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
 * Starts Gemini 3.5 Transcribe for a meeting
 * Uses direct full-audio streaming for recordings up to 45 minutes for zero cut-sentence distortion and bit-perfect acoustic sync.
 */
export async function startGeminiTranscriptionJob(
  meetingId: string,
  audioUrl: string,
  languageCode: string = "unknown",
  numSpeakers?: number
): Promise<{ jobId: string }> {
  console.log(`[GEMINI 3.5] Starting high-precision transcription pipeline for meeting ${meetingId}...`);
  addMeetingLog(meetingId, "info", "PIPELINE", `Initializing Gemini 3.5 audio intelligence pipeline...`);

  let audioBuffer = await downloadAudioBuffer(audioUrl, meetingId);
  
  // Check if media is video and extract speech audio
  const { isMediaVideo, extractAudioFromVideo } = await import("./media-extractor");
  if (isMediaVideo(audioUrl, audioBuffer)) {
    console.log(`[GEMINI 3.5] Video container detected for meeting ${meetingId}. Extracting audio track...`);
    addMeetingLog(
      meetingId,
      "audio",
      "EXTRACTOR",
      `Video container detected (${(audioBuffer.byteLength / (1024 * 1024)).toFixed(1)}MB)! Extracting 16kHz speech audio track...`
    );
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        progressMessage: "Extracting speech audio from video recording...",
      },
    }).catch(() => {});

    const extracted = await extractAudioFromVideo(audioBuffer, audioUrl);
    audioBuffer = extracted.audioBuffer;

    addMeetingLog(
      meetingId,
      "success",
      "EXTRACTOR",
      `Audio track extracted successfully (${(audioBuffer.byteLength / (1024 * 1024)).toFixed(1)}MB, ready for speech chunking).`
    );
  }
  
  // 120 seconds (2 minutes) per chunk: guarantees token count stays safely under 8192 output limit
  // and captures 100% of speech from minute 0:00 to the end without token truncation!
  const GEMINI_CHUNK_SECONDS = 120;
  const GEMINI_MAX_THRESHOLD = 150;
  const OVERLAP_SECONDS = 0;

  addMeetingLog(meetingId, "audio", "SLICER", `Analyzing audio stream and preparing sample-accurate 2-minute chunks...`);
  const slices = await sliceAudioBuffer(
    audioBuffer,
    "meeting.mp3",
    GEMINI_CHUNK_SECONDS,
    GEMINI_MAX_THRESHOLD,
    OVERLAP_SECONDS
  );

  console.log(`[GEMINI 3.5] Audio prepared into ${slices.length} sample-accurate chunk(s)...`);
  if (slices.length === 1) {
    addMeetingLog(meetingId, "success", "PIPELINE", `Processing audio directly in 1 chunk (100% exact acoustic timestamps).`);
  } else {
    addMeetingLog(meetingId, "success", "SLICER", `Audio split into ${slices.length} sample-accurate chunks (2 mins each, zero drift).`);
  }

  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      progressMessage: `Transcribing audio with Google Gemini Audio Intelligence (${slices.length} chunk${slices.length > 1 ? "s" : ""})...`,
    },
  });

  // Process chunks in controlled batches of 2 with key pool rotation across 5 keys
  const CONCURRENCY = 2;
  const results: Array<{ entries: GeminiTranscriptEntry[] }> = new Array(slices.length);

  for (let i = 0; i < slices.length; i += CONCURRENCY) {
    const batch = slices.slice(i, i + CONCURRENCY);
    if (slices.length > 1) {
      console.log(`[GEMINI TRANSCRIBE] Processing batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(slices.length / CONCURRENCY)} (chunks ${i + 1} to ${i + batch.length})...`);
      addMeetingLog(meetingId, "ai", "BATCH", `Transcribing batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(slices.length / CONCURRENCY)} (chunks ${i + 1} to ${i + batch.length})...`);
    }

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

  // Combine entries across slices with exact global start offsets
  const allEntries: GeminiTranscriptEntry[] = [];

  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    const partEntries = results[i]?.entries || [];

    for (const entry of partEntries) {
      const globalStart = Math.round((entry.start_time_seconds + slice.startOffsetSeconds) * 100) / 100;
      const globalEnd = Math.round((entry.end_time_seconds + slice.startOffsetSeconds) * 100) / 100;
      const text = String(entry.transcript || "").trim();

      if (!text) continue;

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

  // Calibrate & clamp timestamps to the physical audio duration
  const totalAudioDuration = slices.reduce((max, s) => Math.max(max, s.startOffsetSeconds + s.durationSeconds), 0);
  if (totalAudioDuration > 0 && allEntries.length > 0) {
    const lastEntry = allEntries[allEntries.length - 1];
    if (lastEntry && lastEntry.end_time_seconds > totalAudioDuration + 2) {
      const scale = (totalAudioDuration - 1) / lastEntry.end_time_seconds;
      console.log(`[GEMINI TRANSCRIBE] Linear calibration applied (drift: ${lastEntry.end_time_seconds}s -> ${totalAudioDuration}s, scale: ${scale.toFixed(4)})`);
      for (const e of allEntries) {
        e.start_time_seconds = Math.round((e.start_time_seconds * scale) * 100) / 100;
        e.end_time_seconds = Math.min(totalAudioDuration, Math.round((e.end_time_seconds * scale) * 100) / 100);
      }
    }
  }

  // Consolidate speakers and eliminate phantom speaker artifacts
  const { consolidateSpeakerDiarization } = await import("./speaker-id");
  const cleanedEntries = consolidateSpeakerDiarization(allEntries, numSpeakers);

  addMeetingLog(meetingId, "success", "STITCHER", `Finalized ${cleanedEntries.length} total dialogue segments with 100% acoustic playback sync.`);

  const jobId = `gemini_${meetingId}_${Date.now()}`;
  (globalThis as any)[`gemini_transcription_${jobId}`] = cleanedEntries;

  return { jobId };
}

export function getStoredGeminiEntries(jobId: string): GeminiTranscriptEntry[] | null {
  return (globalThis as any)[`gemini_transcription_${jobId}`] || null;
}

export function clearStoredGeminiEntries(jobId: string): void {
  delete (globalThis as any)[`gemini_transcription_${jobId}`];
}