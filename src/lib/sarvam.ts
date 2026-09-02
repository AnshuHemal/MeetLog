import axios from "axios";
import { getAvailableKey, reportKeySuccess, reportKeyRateLimit, reportKeyExhausted, getAllPoolKeys } from "@/lib/key-pool";
import { prisma } from "@/lib/prisma";
import { sliceAudioBuffer, AudioSlice } from "@/lib/audio-slicer";

const BASE_URL = "https://api.sarvam.ai/speech-to-text/job/v1";

export const jobKeyCache = new Map<string, string>();

export interface SarvamJobDetails {
  job_id: string;
  job_state: "Accepted" | "Pending" | "Running" | "Completed" | "Failed";
  created_at: string;
  updated_at: string;
  total_files?: number;
  successful_files_count?: number;
  failed_files_count?: number;
  error_message?: string;
  exception_name?: string;
  job_details?: Array<{
    inputs: Array<{ file_name: string; file_id: string }>;
    outputs: Array<{ file_name: string; file_id: string }>;
    state: string;
    error_message: string;
    exception_name: string | null;
  }>;
}

export interface SarvamTranscriptSegment {
  speaker_id: string;
  start_time_seconds: string | number;
  end_time_seconds: string | number;
  transcript: string;
}

export interface SarvamTranscriptResult {
  request_id: string;
  transcript: string;
  diarized_transcript: {
    entries: SarvamTranscriptSegment[];
  };
}

export interface MultiPartJobSliceInfo {
  jobId: string;
  startOffsetSeconds: number;
  durationSeconds: number;
  partIndex: number;
  totalParts: number;
}

export interface MultiPartJobPayload {
  isMultiPart: true;
  parts: MultiPartJobSliceInfo[];
}

export function isMultiPartSarvamJob(idOrJson: string): boolean {
  if (!idOrJson || typeof idOrJson !== "string") return false;
  return idOrJson.trim().startsWith('{"isMultiPart":true');
}

export function parseMultiPartSarvamJob(idOrJson: string): MultiPartJobPayload | null {
  try {
    if (isMultiPartSarvamJob(idOrJson)) {
      return JSON.parse(idOrJson) as MultiPartJobPayload;
    }
  } catch {}
  return null;
}

async function uploadAndStartSingleSlice(
  slice: AudioSlice,
  languageCode: string = "en-IN",
  numSpeakers?: number,
  excludedKeyIds: string[] = []
): Promise<{ jobId: string; keyId: string; apiKey: string }> {
  const maxAttempts = 8;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const keySelection = await getAvailableKey("SARVAM", excludedKeyIds);
    if (!keySelection) {
      throw new Error("No active Sarvam API keys available in the database pool.");
    }

    const { id: keyId, key: apiKey } = keySelection;
    const headers = {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    };

    try {
      console.log(
        `[SARVAM] Starting Part ${slice.partIndex}/${slice.totalParts} with key ${keyId.slice(0, 8)}...`
      );

      const initPayload: any = {
        job_parameters: {
          model: "saaras:v3",
          language_code: "unknown",
          with_diarization: true,
        },
      };

      if (numSpeakers && numSpeakers > 0) {
        initPayload.job_parameters.num_speakers = numSpeakers;
      }

      const initResponse = await axios.post(BASE_URL, initPayload, { headers });
      const jobId = initResponse.data.job_id;
      if (!jobId) throw new Error("Failed to get job_id from Sarvam AI.");

      const fileName = slice.fileName || `part_${slice.partIndex}.mp3`;
      const registerResponse = await axios.post(
        `${BASE_URL}/upload-files`,
        {
          job_id: jobId,
          files: [fileName],
        },
        { headers }
      );

      const presignedUrl = registerResponse.data.upload_urls[fileName]?.file_url;
      if (!presignedUrl) throw new Error(`No presigned upload URL returned for ${fileName}`);

      await axios.put(presignedUrl, slice.buffer, {
        headers: {
          "x-ms-blob-type": "BlockBlob",
          "Content-Type": "audio/mpeg",
        },
      });

      await axios.post(`${BASE_URL}/${jobId}/start`, {}, { headers });
      console.log(`[SARVAM] Part ${slice.partIndex}/${slice.totalParts} job ${jobId} successfully started!`);

      jobKeyCache.set(jobId, apiKey);
      await reportKeySuccess(keyId);

      return { jobId, keyId, apiKey };
    } catch (error: any) {
      const status = error.response?.status;
      const errorMsg = error.response?.data?.error?.message || error.response?.data?.message || error.message;
      console.error(`[SARVAM KEY ERROR] Part ${slice.partIndex} with key ${keyId.slice(0, 8)} failed (${status}):`, errorMsg);

      if (status === 429) {
        await reportKeyRateLimit(keyId, 60, errorMsg);
        excludedKeyIds.push(keyId);
        continue;
      }

      if (status === 402 || status === 403 || status === 401) {
        await reportKeyExhausted(keyId, errorMsg);
        excludedKeyIds.push(keyId);
        continue;
      }

      excludedKeyIds.push(keyId);
    }
  }

  throw new Error(`Failed to start Sarvam job for Part ${slice.partIndex} across available pool keys.`);
}

export async function startSarvamTranscriptionJob(
  audioUrl: string,
  languageCode: string = "en-IN",
  numSpeakers?: number
): Promise<string> {
  // Step 1: Download the full audio buffer
  console.log(`[SARVAM TRANSCRIPTION] Downloading audio from ${audioUrl.slice(0, 40)}...`);
  let audioBuffer: Buffer;
  if (audioUrl.includes("drive.google.com")) {
    const { downloadGoogleDriveFile } = await import("./gdrive");
    audioBuffer = await downloadGoogleDriveFile(audioUrl);
  } else {
    const audioRes = await axios.get(audioUrl, { responseType: "arraybuffer" });
    audioBuffer = Buffer.from(audioRes.data);
  }

  // If video container, extract pristine speech audio first
  const { isMediaVideo, extractAudioFromVideo } = await import("./media-extractor");
  if (isMediaVideo(audioUrl, audioBuffer)) {
    console.log(`[SARVAM TRANSCRIPTION] Video detected! Extracting speech audio with FFmpeg...`);
    const extracted = await extractAudioFromVideo(audioBuffer, audioUrl);
    audioBuffer = extracted.audioBuffer;
  }

  // Step 2: Slice audio if longer than 2 hours (7000s threshold)
  const slices = await sliceAudioBuffer(audioBuffer, "meeting.mp3");

  // Single Part (<2 hours)
  if (slices.length === 1) {
    const result = await uploadAndStartSingleSlice(slices[0], languageCode, numSpeakers);
    return result.jobId;
  }

  // Multi-Part (>2 hours)
  console.log(
    `[SARVAM TRANSCRIPTION] Dispatching ${slices.length} parallel chunk jobs for long meeting...`
  );

  const excludedKeyIds: string[] = [];
  const partResults: MultiPartJobSliceInfo[] = [];

  for (const slice of slices) {
    const result = await uploadAndStartSingleSlice(slice, languageCode, numSpeakers, excludedKeyIds);
    partResults.push({
      jobId: result.jobId,
      startOffsetSeconds: slice.startOffsetSeconds,
      durationSeconds: slice.durationSeconds,
      partIndex: slice.partIndex,
      totalParts: slice.totalParts,
    });
  }

  const multiPartPayload: MultiPartJobPayload = {
    isMultiPart: true,
    parts: partResults,
  };

  return JSON.stringify(multiPartPayload);
}

export async function getSarvamJobStatus(
  jobId: string,
  preferredApiKey?: string
): Promise<SarvamJobDetails> {
  // Handle Multi-Part (>2 Hours) JSON Jobs
  if (isMultiPartSarvamJob(jobId)) {
    const multiPart = parseMultiPartSarvamJob(jobId);
    if (multiPart && multiPart.parts.length > 0) {
      const partDetailsList: SarvamJobDetails[] = [];
      for (const part of multiPart.parts) {
        const details = await getSarvamJobStatus(part.jobId);
        partDetailsList.push(details);
      }

      // If any sub-part failed
      const failedPart = partDetailsList.find((d) => d.job_state === "Failed");
      if (failedPart) {
        return {
          job_id: jobId,
          job_state: "Failed",
          created_at: partDetailsList[0]?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          error_message: failedPart.error_message || "One of the audio parts failed transcription.",
        };
      }

      // If all sub-parts completed
      const allCompleted = partDetailsList.every((d) => d.job_state === "Completed");
      if (allCompleted) {
        const aggregatedJobDetails = partDetailsList.flatMap((d) => d.job_details || []);
        return {
          job_id: jobId,
          job_state: "Completed",
          created_at: partDetailsList[0]?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          job_details: aggregatedJobDetails,
        };
      }

      // Otherwise Running / Pending
      const anyRunning = partDetailsList.some((d) => d.job_state === "Running");
      return {
        job_id: jobId,
        job_state: anyRunning ? "Running" : "Pending",
        created_at: partDetailsList[0]?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
  }

  const cachedKey = preferredApiKey || jobKeyCache.get(jobId);
  const excludedKeyIds: string[] = [];

  if (cachedKey) {
    try {
      const response = await axios.get(`${BASE_URL}/${jobId}/status`, {
        headers: { "api-subscription-key": cachedKey },
        timeout: 10000,
      });
      return response.data;
    } catch (err: any) {
      console.warn(`[SARVAM STATUS] Cached key failed for job ${jobId} (${err.response?.status || err.message}). Rotating pool keys...`);
    }
  }

  const allKeys = await prisma.apiKeyPool.findMany({
    where: { provider: "SARVAM", status: "ACTIVE" },
    orderBy: { lastUsedAt: "desc" },
  });

  const keyList: Array<{ id?: string; key: string }> = allKeys.map(k => ({ id: k.id, key: k.key }));
  if (process.env.SARVAM_API_KEY) {
    keyList.push({ id: "env-SARVAM", key: process.env.SARVAM_API_KEY });
  }

  for (const item of keyList) {
    if (excludedKeyIds.includes(item.key)) continue;

    try {
      const response = await axios.get(`${BASE_URL}/${jobId}/status`, {
        headers: { "api-subscription-key": item.key },
        timeout: 10000,
      });

      jobKeyCache.set(jobId, item.key);
      if (item.id && !item.id.startsWith("env-")) {
        await reportKeySuccess(item.id);
      }
      return response.data;
    } catch (error: any) {
      const status = error.response?.status;
      excludedKeyIds.push(item.key);

      // Only mark rate limit if 429. Do NOT mark 401/403 as EXHAUSTED here because 
      // Sarvam returns 403/404 if a key doesn't own this specific foreign jobId.
      if (item.id && status === 429) {
        await reportKeyRateLimit(item.id, 60);
      }
    }
  }

  throw new Error(`Failed to retrieve Sarvam job status for ${jobId} after rotating all keys.`);
}

export async function downloadSarvamJobTranscript(
  jobId: string,
  outputFileName: string,
  preferredApiKey?: string
): Promise<SarvamTranscriptResult> {
  const cachedKey = preferredApiKey || jobKeyCache.get(jobId);
  const excludedKeys: string[] = [];

  const allKeys = await prisma.apiKeyPool.findMany({
    where: { provider: "SARVAM", status: "ACTIVE" },
    orderBy: { lastUsedAt: "desc" },
  });

  const candidates: string[] = [];
  if (cachedKey) candidates.push(cachedKey);
  for (const k of allKeys) {
    if (!candidates.includes(k.key)) candidates.push(k.key);
  }
  if (process.env.SARVAM_API_KEY && !candidates.includes(process.env.SARVAM_API_KEY)) {
    candidates.push(process.env.SARVAM_API_KEY);
  }

  for (const apiKey of candidates) {
    if (excludedKeys.includes(apiKey)) continue;

    const headers = {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    };

    let fileNameToTry = outputFileName;

    const downloadPayload = {
      job_id: jobId,
      files: [fileNameToTry],
    };

    try {
      console.log(`[SARVAM DOWNLOAD] Attempting download for job ${jobId} with key ${apiKey.slice(0, 8)}...`);
      const response = await axios.post(`${BASE_URL}/download-files`, downloadPayload, { headers, timeout: 15000 });
      const presignedUrlsMap = response.data.download_urls;
      const downloadUrl = presignedUrlsMap?.[fileNameToTry]?.file_url;

      if (!downloadUrl) {
        console.warn(`[SARVAM DOWNLOAD] No presigned URL in map for ${fileNameToTry}`);
        continue;
      }

      const transcriptContentResponse = await axios.get(downloadUrl, { timeout: 30000 });
      jobKeyCache.set(jobId, apiKey);
      console.log(`[SARVAM DOWNLOAD] Successfully downloaded transcript for job ${jobId}!`);
      return transcriptContentResponse.data;
    } catch (err: any) {
      const status = err.response?.status;
      const errMsg = err.response?.data?.message || err.response?.data?.error?.message || err.message;
      console.warn(`[SARVAM DOWNLOAD] Key ${apiKey.slice(0, 8)} failed with status ${status}: ${errMsg}`);

      excludedKeys.push(apiKey);
      continue;
    }
  }

  throw new Error(`Failed to download transcript for job ${jobId} across all available API keys in pool.`);
}
