"use client";

import { uploadAudioToCloudinary } from "@/lib/cloudinary-client-upload";

const CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_FALLBACK_SIZE = 95 * 1024 * 1024;

export interface DriveUploadResult {
  audioUrl: string;
  fileId?: string;
  duration: number;
  provider: "gdrive" | "cloudinary";
}

export async function uploadAudioToGoogleDrive(
  file: File,
  onProgress?: (percent: number) => void
): Promise<DriveUploadResult> {
  const fileSizeMb = Math.round(file.size / (1024 * 1024));

  let sessionData: any;
  try {
    const sessionRes = await fetch("/api/upload/gdrive-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "audio/mpeg",
      }),
    });

    if (!sessionRes.ok) {
      const errJson = await sessionRes.json().catch(() => ({}));
      throw new Error(errJson.error || `Session initialization failed (HTTP ${sessionRes.status}).`);
    }

    sessionData = await sessionRes.json();
  } catch (initErr: any) {
    console.error("[GDRIVE SESSION INIT ERROR]", initErr);
    if (file.size > MAX_FALLBACK_SIZE) {
      throw new Error(
        `Google Drive upload initialization failed: ${initErr.message}. For large files (${fileSizeMb}MB), please ensure Google Drive OAuth is authorized. Run 'npm run gdrive:token' in terminal to refresh credentials.`
      );
    }
    throw initErr;
  }

  if (!sessionData.isDriveConfigured || !sessionData.uploadUrl) {
    const driveError = sessionData.error || sessionData.message || "Google Drive is not authenticated.";

    if (file.size > MAX_FALLBACK_SIZE) {
      throw new Error(
        `Google Drive is required for this ${fileSizeMb}MB file: ${driveError}\n\nPlease run 'npm run gdrive:token' in your project terminal to generate a fresh Google Drive refresh token.`
      );
    }

    console.warn(`[STORAGE FALLBACK] Google Drive unavailable (${driveError}). Attempting Cloudinary fallback for smaller file (${fileSizeMb}MB)...`);
    const result = await uploadAudioToCloudinary(file, onProgress);
    return {
      audioUrl: result.audioUrl,
      duration: result.duration,
      provider: "cloudinary",
    };
  }

  const uploadUrl = sessionData.uploadUrl;
  const totalSize = file.size;
  let uploadedBytes = 0;
  let fileId = "";
  let finalUrl = "";

  onProgress?.(0);

  for (let start = 0; start < totalSize; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, totalSize - 1);
    const chunk = file.slice(start, end + 1);
    const chunkLength = end - start + 1;

    let chunkSuccess = false;
    let lastChunkError = "";

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const proxyResponse = await fetch("/api/upload/gdrive-chunk", {
          method: "POST",
          headers: {
            "x-upload-url": uploadUrl,
            "x-content-range": `bytes ${start}-${end}/${totalSize}`,
            "Content-Type": "application/octet-stream",
          },
          body: chunk,
        });

        if (!proxyResponse.ok) {
          const errJson = await proxyResponse.json().catch(() => ({}));
          throw new Error(errJson.error || `Chunk proxy error (${proxyResponse.status})`);
        }

        const proxyResult = await proxyResponse.json();
        const status = proxyResult.status;

        uploadedBytes += chunkLength;
        const progressPercent = Math.min(99, Math.round((uploadedBytes / totalSize) * 100));
        onProgress?.(progressPercent);

        if (status === 200 || status === 201) {
          const json = proxyResult.data || {};
          fileId = json.id || "";
          finalUrl = json.webContentLink || `https://drive.google.com/uc?id=${fileId}&export=download`;
          chunkSuccess = true;
          break;
        }

        if (status === 308) {
          chunkSuccess = true;
          break;
        }

        throw new Error(`Unexpected Google Drive response status: ${status}`);
      } catch (err: any) {
        lastChunkError = err.message || "Network transfer error";
        console.warn(`[GDRIVE CHUNK RETRY] Chunk ${start}-${end} attempt ${attempt} failed: ${lastChunkError}`);
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, attempt * 1500));
        }
      }
    }

    if (!chunkSuccess) {
      throw new Error(`Google Drive upload failed at byte ${start}/${totalSize}: ${lastChunkError}`);
    }

    if (finalUrl || fileId) {
      break;
    }
  }

  onProgress?.(100);

  const exactDuration = await getAudioDurationFromFile(file);

  return {
    audioUrl: finalUrl || `https://drive.google.com/uc?id=${fileId}&export=download`,
    fileId,
    duration: exactDuration > 0 ? exactDuration : 0,
    provider: "gdrive",
  };
}

export function getAudioDurationFromFile(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      const objectUrl = URL.createObjectURL(file);
      audio.src = objectUrl;

      const cleanup = () => {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {}
      };

      audio.onloadedmetadata = () => {
        cleanup();
        if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity && audio.duration > 0) {
          resolve(Math.round(audio.duration));
        } else {
          resolve(0);
        }
      };

      audio.onerror = () => {
        cleanup();
        resolve(0);
      };

      setTimeout(() => {
        cleanup();
        resolve(0);
      }, 3000);
    } catch {
      resolve(0);
    }
  });
}
