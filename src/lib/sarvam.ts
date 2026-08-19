import axios from "axios";
import { getAvailableKey, reportKeySuccess, reportKeyRateLimit, reportKeyExhausted } from "@/lib/key-pool";

const BASE_URL = "https://api.sarvam.ai/speech-to-text/job/v1";

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
  const maxAttempts = 5;

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

      await reportKeySuccess(keyId);

      return jobId;
    } catch (error: any) {
      const status = error.response?.status;
      const errorMsg = error.response?.data?.error?.message || error.message;

      console.error(`[SARVAM KEY ERROR] Key ${keyId.slice(0, 8)} failed with status ${status}:`, errorMsg);

      if (status === 429) {
        await reportKeyRateLimit(keyId, 60, errorMsg);
        excludedKeyIds.push(keyId);
        console.warn(`[SARVAM KEY ROTATION] Key ${keyId} rate limited. Rotating to next key in pool...`);
        continue;
      }

      if (status === 402 || status === 403 || status === 401) {
        await reportKeyExhausted(keyId, errorMsg);
        excludedKeyIds.push(keyId);
        console.warn(`[SARVAM KEY ROTATION] Key ${keyId} exhausted/unauthorized. Rotating to next key in pool...`);
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
  const excludedKeyIds: string[] = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    let apiKey = preferredApiKey;
    let keyId: string | undefined;

    if (!apiKey) {
      const keySelection = await getAvailableKey("SARVAM", excludedKeyIds);
      if (keySelection) {
        apiKey = keySelection.key;
        keyId = keySelection.id;
      }
    }

    if (!apiKey) {
      throw new Error("No active Sarvam API key available to check job status.");
    }

    const headers = {
      "api-subscription-key": apiKey,
    };

    try {
      const response = await axios.get(`${BASE_URL}/${jobId}/status`, { headers });
      if (keyId) await reportKeySuccess(keyId);
      return response.data;
    } catch (error: any) {
      const status = error.response?.status;
      if (keyId && (status === 429 || status === 402 || status === 403 || status === 401)) {
        if (status === 429) await reportKeyRateLimit(keyId, 60);
        else await reportKeyExhausted(keyId);
        excludedKeyIds.push(keyId);
        preferredApiKey = undefined;
        continue;
      }
      throw error;
    }
  }

  throw new Error("Failed to retrieve Sarvam job status after key retries.");
}

export async function downloadSarvamJobTranscript(
  jobId: string,
  outputFileName: string,
  preferredApiKey?: string
): Promise<SarvamTranscriptResult> {
  const excludedKeyIds: string[] = [];
  const maxRetries = 7;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let apiKey = preferredApiKey;
    let keyId: string | undefined;

    if (!apiKey) {
      const keySelection = await getAvailableKey("SARVAM", excludedKeyIds);
      if (keySelection) {
        apiKey = keySelection.key;
        keyId = keySelection.id;
      }
    }

    if (!apiKey) {
      throw new Error("No active Sarvam API key available for downloading transcript.");
    }

    const headers = {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    };

    let fileNameToTry = outputFileName;
    if (attempt > 1) {
      try {
        const latestStatus = await getSarvamJobStatus(jobId, apiKey);
        const outputs = latestStatus.job_details?.[0]?.outputs ?? [];
        const jsonOutput = outputs.find((o: any) => o.file_name?.endsWith(".json"));
        if (jsonOutput) {
          fileNameToTry = jsonOutput.file_name;
        }
      } catch (statusErr: any) {
        console.warn(`[download] Status re-check note: ${statusErr.message}`);
      }
    }

    const downloadPayload = {
      job_id: jobId,
      files: [fileNameToTry],
    };

    try {
      const response = await axios.post(`${BASE_URL}/download-files`, downloadPayload, { headers });
      const presignedUrlsMap = response.data.download_urls;
      const downloadUrl = presignedUrlsMap?.[fileNameToTry]?.file_url;

      if (!downloadUrl) {
        if (attempt < maxRetries) {
          const waitMs = Math.min(attempt * 4000, 20000);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        throw new Error(`Failed to find presigned download URL for file: ${fileNameToTry}`);
      }

      const transcriptContentResponse = await axios.get(downloadUrl);
      if (keyId) await reportKeySuccess(keyId);
      return transcriptContentResponse.data;
    } catch (err: any) {
      const status = err.response?.status;
      if (keyId && (status === 429 || status === 402 || status === 403 || status === 401)) {
        if (status === 429) await reportKeyRateLimit(keyId, 60);
        else await reportKeyExhausted(keyId);
        excludedKeyIds.push(keyId);
        preferredApiKey = undefined;
        continue;
      }

      if (attempt < maxRetries) {
        const waitMs = Math.min(attempt * 4000, 20000);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      throw err;
    }
  }

  throw new Error("Exhausted all retries downloading transcript.");
}
