import axios from "axios";

function cleanEnv(val?: string): string {
  if (!val) return "";
  return val.trim().replace(/^["']|["']$/g, "");
}

function extractFolderId(val?: string): string {
  const cleaned = cleanEnv(val);
  if (!cleaned) return "";
  const match = cleaned.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : cleaned;
}

const GOOGLE_CLIENT_ID = cleanEnv(process.env.GOOGLE_CLIENT_ID);
const GOOGLE_CLIENT_SECRET = cleanEnv(process.env.GOOGLE_CLIENT_SECRET);
const GOOGLE_REFRESH_TOKEN = cleanEnv(process.env.GOOGLE_REFRESH_TOKEN);
const GOOGLE_DRIVE_FOLDER_ID = extractFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID);

export interface ResumableSessionResult {
  uploadUrl: string;
  fileId?: string;
  isDriveConfigured: boolean;
  error?: string;
}

export interface DriveTokenResult {
  accessToken: string | null;
  error?: string;
}

export async function getGoogleDriveAccessTokenDetails(): Promise<DriveTokenResult> {
  const clientId = cleanEnv(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = cleanEnv(process.env.GOOGLE_CLIENT_SECRET);
  const refreshToken = cleanEnv(process.env.GOOGLE_REFRESH_TOKEN);

  if (!clientId || !clientSecret || !refreshToken) {
    const missing = [
      !clientId && "GOOGLE_CLIENT_ID",
      !clientSecret && "GOOGLE_CLIENT_SECRET",
      !refreshToken && "GOOGLE_REFRESH_TOKEN",
    ].filter(Boolean);
    const msg = `Missing Google Drive credentials in .env: ${missing.join(", ")}`;
    console.warn(`[GDRIVE] ${msg}`);
    return { accessToken: null, error: msg };
  }

  try {
    const response = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const token = response.data?.access_token || null;
    return { accessToken: token };
  } catch (error: any) {
    const errData = error?.response?.data;
    const errCode = errData?.error || error.message;
    const errDesc = errData?.error_description ? ` (${errData.error_description})` : "";
    const fullMsg = `Google OAuth failed: ${errCode}${errDesc}. Run 'npm run gdrive:token' to refresh your token.`;
    console.error("[GDRIVE] Failed to fetch OAuth access token:", fullMsg);
    return { accessToken: null, error: fullMsg };
  }
}

export async function getGoogleDriveAccessToken(): Promise<string | null> {
  const result = await getGoogleDriveAccessTokenDetails();
  return result.accessToken;
}

export async function createDriveResumableSession(options: {
  fileName: string;
  mimeType: string;
  fileSize: number;
}): Promise<ResumableSessionResult> {
  const tokenResult = await getGoogleDriveAccessTokenDetails();

  if (!tokenResult.accessToken) {
    return {
      uploadUrl: "",
      isDriveConfigured: false,
      error: tokenResult.error || "Could not authenticate with Google Drive OAuth.",
    };
  }

  const accessToken = tokenResult.accessToken;
  const folderId = extractFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID);

  try {
    const metadata: Record<string, any> = {
      name: options.fileName,
      mimeType: options.mimeType,
    };

    if (folderId) {
      metadata.parents = [folderId];
    }

    const response = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": options.mimeType,
          "X-Upload-Content-Length": String(options.fileSize),
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Google Drive API returned HTTP ${response.status}: ${errText || response.statusText}`);
    }

    const uploadUrl = response.headers.get("Location");
    if (!uploadUrl) {
      throw new Error("Google Drive did not return a Location header for resumable upload.");
    }

    return {
      uploadUrl,
      isDriveConfigured: true,
    };
  } catch (error: any) {
    console.error("[GDRIVE] Resumable session creation error:", error?.message);
    return {
      uploadUrl: "",
      isDriveConfigured: false,
      error: error?.message || "Failed to initialize Google Drive resumable session.",
    };
  }
}

export function getGoogleDriveFileId(urlOrId: string): string {
  const cleaned = urlOrId.trim();
  if (!cleaned.includes("drive.google.com")) {
    return cleaned;
  }

  try {
    const urlObj = new URL(cleaned);
    const id = urlObj.searchParams.get("id");
    if (id) return id;
  } catch (e) {}

  const dMatch = cleaned.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch) return dMatch[1];

  const folderMatch = cleaned.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];

  return cleaned;
}

export async function downloadGoogleDriveFile(urlOrId: string): Promise<Buffer> {
  const fileId = getGoogleDriveFileId(urlOrId);
  const accessToken = await getGoogleDriveAccessToken();
  if (!accessToken) {
    throw new Error("Google Drive access token could not be generated. Check credentials.");
  }

  console.log(`[GDRIVE] Downloading file ${fileId} from Google Drive Alt Media endpoint...`);
  const response = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    responseType: "arraybuffer",
  });

  return Buffer.from(response.data);
}

export async function deleteGoogleDriveFile(urlOrId: string): Promise<boolean> {
  const fileId = getGoogleDriveFileId(urlOrId);
  if (!fileId) return false;

  const accessToken = await getGoogleDriveAccessToken();
  if (!accessToken) {
    throw new Error("Google Drive access token could not be generated. Check credentials.");
  }

  console.log(`[GDRIVE] Deleting file ${fileId} from Google Drive...`);
  try {
    await axios.delete(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return true;
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.warn(`[GDRIVE] File ${fileId} not found on Google Drive (already deleted).`);
      return true;
    }
    console.error(`[GDRIVE] Failed to delete file ${fileId}:`, error.response?.data || error.message);
    throw error;
  }
}
