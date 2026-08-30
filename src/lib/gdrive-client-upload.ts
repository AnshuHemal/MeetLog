"use client";

// Google Drive Resumable Upload requires chunks to be multiples of 256 KB.
// 2 MB (2,097,152 bytes = 8 * 256 KB) is optimal: it stays well below
// Next.js / Vercel body limits (avoiding HTTP 413) and avoids browser CORS blocks.
const CHUNK_SIZE = 2 * 1024 * 1024;

export interface DriveUploadResult {
  audioUrl: string;
  fileId: string;
  duration: number;
  provider: "gdrive";
}

export class DriveAuthRequiredError extends Error {
  requiresAuth: boolean;
  authUrl: string;
  constructor(message: string, authUrl: string = "/api/auth/gdrive/auth") {
    super(message);
    this.name = "DriveAuthRequiredError";
    this.requiresAuth = true;
    this.authUrl = authUrl;
  }
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
      if (errJson.requiresAuth) {
        throw new DriveAuthRequiredError(
          errJson.error || "Google Drive authorization is required. Click below to authorize with 1-click.",
          errJson.authUrl || "/api/auth/gdrive/auth"
        );
      }
      throw new Error(errJson.error || `Session initialization failed (HTTP ${sessionRes.status}).`);
    }

    sessionData = await sessionRes.json();
  } catch (initErr: any) {
    if (initErr instanceof DriveAuthRequiredError || initErr.requiresAuth) {
      throw initErr;
    }
    console.error("[GDRIVE SESSION INIT ERROR]", initErr);
    throw new Error(
      initErr.message || `Google Drive upload initialization failed (${fileSizeMb}MB).`
    );
  }

  if (!sessionData.isDriveConfigured || !sessionData.uploadUrl) {
    const driveError = sessionData.error || sessionData.message || "Google Drive authorization required.";
    throw new DriveAuthRequiredError(driveError, sessionData.authUrl || "/api/auth/gdrive/auth");
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
    const contentRange = `bytes ${start}-${end}/${totalSize}`;

    let chunkSuccess = false;
    let lastChunkError = "";

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const proxyResponse = await fetch("/api/upload/gdrive-chunk", {
          method: "POST",
          headers: {
            "x-upload-url": uploadUrl,
            "x-content-range": contentRange,
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
        const responseData = proxyResult.data || {};

        uploadedBytes += chunkLength;
        const progressPercent = Math.min(99, Math.round((uploadedBytes / totalSize) * 100));
        onProgress?.(progressPercent);

        if (status === 200 || status === 201) {
          fileId = responseData.id || "";
          finalUrl = responseData.webContentLink || `https://drive.google.com/uc?id=${fileId}&export=download`;
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
          await new Promise((r) => setTimeout(r, attempt * 1200));
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