import axios from "axios";
import { getAvailableKey, reportKeySuccess, reportKeyRateLimit, reportKeyExhausted, getAllPoolKeys } from "@/lib/key-pool";
import { prisma } from "@/lib/prisma";

const BASE_URL = "https://api.sarvam.ai/speech-to-text/job/v1";

export const jobKeyCache = new Map<string, string>();

export interface SarvamJobDetails {
  job_id: string;
  job_state: "Accepted" | "Pending" | "Running" | "Completed" | "Failed";
  created_at: string;
  updated_at: string;
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

export async function startSarvamTranscriptionJob(
  audioUrl: string,
  languageCode: string = "en-IN",
  numSpeakers?: number
): Promise<string> {
  const excludedKeyIds: string[] = [];
  const maxAttempts = 10;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const keySelection = await getAvailableKey("SARVAM", excludedKeyIds);

    if (!keySelection) {
      throw new Error(
        "No active Sarvam API keys available in the database pool or environment variables. Please add active keys in Settings > API Keys."
      );
    }

    const { id: keyId, key: apiKey } = keySelection;
    const headers = {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    };

    try {
      console.log(`[SARVAM] Attempt ${attempt}: Initiating STT job with key ${keyId.slice(0, 8)}...`);

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

      if (!jobId) {
        throw new Error("Failed to get job_id from Sarvam AI initiation endpoint.");
      }

      console.log(`[SARVAM] STT Job ${jobId} initiated. Step 2: Registering file upload...`);

      const fileName = "meeting.mp3";
      const registerResponse = await axios.post(
        `${BASE_URL}/upload-files`,
        {
          job_id: jobId,
          files: [fileName],
        },
        { headers }
      );

      const presignedUrl = registerResponse.data.upload_urls[fileName].file_url;
      console.log(`[SARVAM] STT Job ${jobId} registered file. Step 3: Transferring audio...`);

      let audioBuffer: Buffer;
      if (audioUrl.includes("drive.google.com")) {
        const { downloadGoogleDriveFile } = await import("./gdrive");
        audioBuffer = await downloadGoogleDriveFile(audioUrl);
      } else {
        const audioRes = await axios.get(audioUrl, { responseType: "arraybuffer" });
        audioBuffer = Buffer.from(audioRes.data);
      }

      await axios.put(presignedUrl, audioBuffer, {
        headers: {
          "x-ms-blob-type": "BlockBlob",
          "Content-Type": "audio/mpeg",
        },
      });
      console.log(`[SARVAM] STT Job ${jobId} uploaded binary (${audioBuffer.byteLength} bytes). Step 4: Starting job...`);

      await axios.post(`${BASE_URL}/${jobId}/start`, {}, { headers });
      console.log(`[SARVAM] STT Job ${jobId} successfully started processing.`);

      jobKeyCache.set(jobId, apiKey);
      await reportKeySuccess(keyId);

      return jobId;
    } catch (error: any) {
      const status = error.response?.status;
      const errorMsg = error.response?.data?.error?.message || error.response?.data?.message || error.message;

      console.error(`[SARVAM KEY ERROR] Key ${keyId.slice(0, 8)} failed with status ${status}:`, errorMsg);

      if (status === 429) {
        await reportKeyRateLimit(keyId, 60, errorMsg);
        excludedKeyIds.push(keyId);
        console.warn(`[SARVAM KEY ROTATION] Key ${keyId} rate limited. Rotating to next key in pool...`);
        continue;
      }

      if (status === 402 || status === 403 || status === 401 || (status === 400 && String(errorMsg).toLowerCase().includes("credit"))) {
        await reportKeyExhausted(keyId, errorMsg);
        excludedKeyIds.push(keyId);
        console.warn(`[SARVAM KEY ROTATION] Key ${keyId} exhausted (${errorMsg}). Rotating to next key in pool...`);
        continue;
      }

      if (status === 400 || status >= 500) {
        excludedKeyIds.push(keyId);
        console.warn(`[SARVAM KEY ROTATION] Key ${keyId} failed with ${status}. Rotating to next key...`);
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to initiate Sarvam transcription job after rotating through all available pool keys.");
}

export async function getSarvamJobStatus(
  jobId: string,
  preferredApiKey?: string
): Promise<SarvamJobDetails> {
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

      if (item.id && (status === 402 || status === 403 || status === 401)) {
        await reportKeyExhausted(item.id, `Status ${status}`);
      } else if (item.id && status === 429) {
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
