"use client";

const CHUNK_SIZE = 6 * 1024 * 1024;

interface SignatureResponse {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
}

export interface CloudinaryUploadResult {
  audioUrl: string;
  duration: number;
}

function generateUploadId(): string {
  return `meetlog-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function fetchUploadSignature(): Promise<SignatureResponse> {
  const response = await fetch("/api/upload/signature");

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Failed to get upload signature.");
  }

  return response.json();
}

async function uploadChunk(
  blob: Blob,
  fileName: string,
  sig: SignatureResponse,
  options: {
    start: number;
    end: number;
    total: number;
    uploadId: string;
    chunked: boolean;
  },
): Promise<Record<string, unknown>> {
  const formData = new FormData();
  formData.append("file", blob, fileName);
  formData.append("api_key", sig.apiKey);
  formData.append("timestamp", String(sig.timestamp));
  formData.append("signature", sig.signature);
  formData.append("folder", sig.folder);

  const headers: Record<string, string> = {};
  if (options.chunked) {
    headers["Content-Range"] = `bytes ${options.start}-${options.end}/${options.total}`;
    headers["X-Unique-Upload-Id"] = options.uploadId;
  }

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${sig.cloudName}/video/upload`,
    { method: "POST", headers, body: formData },
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      (data as { error?: { message?: string } }).error?.message ||
      `Cloudinary upload failed (${response.status}).`;
    throw new Error(message);
  }

  return data as Record<string, unknown>;
}

export async function uploadAudioToCloudinary(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<CloudinaryUploadResult> {
  const sig = await fetchUploadSignature();
  const uploadId = generateUploadId();
  const totalSize = file.size;
  const useChunkedUpload = totalSize > CHUNK_SIZE;

  let lastResponse: Record<string, unknown> | null = null;

  if (!useChunkedUpload) {
    onProgress?.(0);
    lastResponse = await uploadChunk(file, file.name, sig, {
      start: 0,
      end: totalSize - 1,
      total: totalSize,
      uploadId,
      chunked: false,
    });
    onProgress?.(100);
  } else {
    for (let start = 0; start < totalSize; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE - 1, totalSize - 1);
      const chunk = file.slice(start, end + 1);

      lastResponse = await uploadChunk(chunk, file.name, sig, {
        start,
        end,
        total: totalSize,
        uploadId,
        chunked: true,
      });

      onProgress?.(Math.min(99, Math.round(((end + 1) / totalSize) * 100)));
    }
    onProgress?.(100);
  }

  const audioUrl = lastResponse?.secure_url;
  if (typeof audioUrl !== "string" || !audioUrl.trim()) {
    throw new Error("Upload completed but Cloudinary did not return a file URL.");
  }

  const duration =
    typeof lastResponse?.duration === "number" ? lastResponse.duration : 0;

  return { audioUrl, duration };
}
