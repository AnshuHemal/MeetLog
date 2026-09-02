import axios from "axios";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "./prisma";

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

export interface ResumableSessionResult {
  uploadUrl: string;
  fileId?: string;
  isDriveConfigured: boolean;
  requiresAuth?: boolean;
  authUrl?: string;
  error?: string;
}

export interface DriveTokenResult {
  accessToken: string | null;
  requiresAuth?: boolean;
  authUrl?: string;
  email?: string;
  error?: string;
}

// In-memory token cache to prevent spamming Google OAuth endpoint
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Updates a key-value pair in .env file automatically
 */
export function updateEnvFile(key: string, value: string) {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return;
    let content = fs.readFileSync(envPath, "utf-8");

    if (content.match(new RegExp(`^${key}=.*$`, "m"))) {
      content = content.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
    } else {
      content += `\n${key}=${value}\n`;
    }

    fs.writeFileSync(envPath, content, "utf-8");
    process.env[key] = value;
    console.log(`[GDRIVE] Automatically synchronized ${key} in .env`);
  } catch (err: any) {
    console.error("[GDRIVE] Failed to write to .env file:", err.message);
  }
}

/**
 * Generates an access token using a Google Cloud Service Account (Zero OAuth, Zero Expiry)
 */
async function getServiceAccountAccessToken(): Promise<string | null> {
  const clientEmail = cleanEnv(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKeyRaw = cleanEnv(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);

  if (!clientEmail || !privateKeyRaw) {
    return null;
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const claimSet = {
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    };

    const encodeBase64Url = (obj: any) =>
      Buffer.from(JSON.stringify(obj))
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

    const unsignedToken = `${encodeBase64Url(header)}.${encodeBase64Url(claimSet)}`;

    const sign = crypto.createSign("RSA-SHA256");
    sign.update(unsignedToken);
    sign.end();

    const formattedKey = privateKeyRaw.replace(/\\n/g, "\n");
    const signature = sign
      .sign(formattedKey, "base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    const jwt = `${unsignedToken}.${signature}`;

    const res = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 10000,
      }
    );

    const accessToken = res.data?.access_token || null;
    if (accessToken) {
      cachedAccessToken = accessToken;
      tokenExpiresAt = Date.now() + 3500 * 1000;
      return accessToken;
    }
  } catch (err: any) {
    console.error("[GDRIVE SERVICE ACCOUNT ERROR]", err.response?.data || err.message);
  }

  return null;
}

/**
 * Generates the standard Google OAuth URL for Drive permissions
 */
export function getGoogleDriveAuthUrl(redirectUri?: string, state?: string): string {
  const clientId = cleanEnv(process.env.GOOGLE_CLIENT_ID);
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured in .env");
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const targetRedirectUri = redirectUri || `${baseUrl}/api/auth/gdrive/callback`;

  const SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/userinfo.email",
  ].join(" ");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", targetRedirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  if (state) {
    authUrl.searchParams.set("state", state);
  }

  return authUrl.toString();
}

/**
 * Exchanges authorization code from OAuth callback for tokens, saves refresh token
 */
export async function exchangeGoogleDriveAuthCode(
  code: string,
  redirectUri?: string
): Promise<{ success: boolean; email?: string; error?: string }> {
  const clientId = cleanEnv(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = cleanEnv(process.env.GOOGLE_CLIENT_SECRET);

  if (!clientId || !clientSecret) {
    return { success: false, error: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in .env" };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const targetRedirectUri = redirectUri || `${baseUrl}/api/auth/gdrive/callback`;

  try {
    const response = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: targetRedirectUri,
        grant_type: "authorization_code",
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const { refresh_token, access_token, expires_in } = response.data;

    if (access_token) {
      cachedAccessToken = access_token;
      tokenExpiresAt = Date.now() + ((expires_in || 3600) * 1000);
    }

    if (refresh_token) {
      updateEnvFile("GOOGLE_REFRESH_TOKEN", refresh_token);
    }

    let userEmail = "Google Drive User";
    try {
      const driveTest = await axios.get("https://www.googleapis.com/drive/v3/about?fields=user", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      userEmail = driveTest.data.user?.emailAddress || userEmail;
    } catch {}

    return { success: true, email: userEmail };
  } catch (err: any) {
    console.error("[GDRIVE] Failed OAuth token exchange:", err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.error_description || err.response?.data?.error || err.message,
    };
  }
}

/**
 * Automatically resolves and fetches a valid Google Drive Access Token
 * Checks cache -> Service Account -> OAuth Refresh Token -> Database fallback
 */
export async function getGoogleDriveAccessTokenDetails(): Promise<DriveTokenResult> {
  // 1. Check in-memory cache
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return { accessToken: cachedAccessToken };
  }

  // 2. Check Service Account credentials first (Zero OAuth, Zero Expiry)
  const serviceAccountToken = await getServiceAccountAccessToken();
  if (serviceAccountToken) {
    return { accessToken: serviceAccountToken };
  }

  const clientId = cleanEnv(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = cleanEnv(process.env.GOOGLE_CLIENT_SECRET);
  let refreshToken = cleanEnv(process.env.GOOGLE_REFRESH_TOKEN);

  // 3. Database Fallback: if not in .env, check if a connected Google Account has a refresh token
  if (!refreshToken) {
    try {
      const googleAccount = await prisma.account.findFirst({
        where: {
          providerId: "google",
          refreshToken: { not: null },
        },
        orderBy: { updatedAt: "desc" },
      });

      if (googleAccount?.refreshToken) {
        refreshToken = googleAccount.refreshToken;
        updateEnvFile("GOOGLE_REFRESH_TOKEN", refreshToken);
        console.log("[GDRIVE] Retrieved Google refresh token from user database account.");
      }
    } catch (dbErr: any) {
      console.warn("[GDRIVE] DB account check failed:", dbErr.message);
    }
  }

  if (!clientId || !clientSecret) {
    return {
      accessToken: null,
      requiresAuth: true,
      authUrl: "/api/auth/gdrive/auth",
      error: "Google OAuth Client ID or Client Secret not configured in .env",
    };
  }

  if (!refreshToken) {
    return {
      accessToken: null,
      requiresAuth: true,
      authUrl: "/api/auth/gdrive/auth",
      error: "Google Drive authorization is required. Please set up your permanent refresh token.",
    };
  }

  // 4. Exchange refresh token with Google
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
        timeout: 15000,
      }
    );

    const newAccessToken = response.data?.access_token || null;
    const expiresIn = response.data?.expires_in || 3600;
    const newRefreshToken = response.data?.refresh_token;

    if (newAccessToken) {
      cachedAccessToken = newAccessToken;
      tokenExpiresAt = Date.now() + (expiresIn * 1000);

      if (newRefreshToken && newRefreshToken !== refreshToken) {
        updateEnvFile("GOOGLE_REFRESH_TOKEN", newRefreshToken);
      }

      return { accessToken: newAccessToken };
    }

    return {
      accessToken: null,
      requiresAuth: true,
      authUrl: "/api/auth/gdrive/auth",
      error: "Failed to obtain access token from Google.",
    };
  } catch (error: any) {
    const errData = error?.response?.data;
    const errCode = errData?.error || error.message;
    const errDesc = errData?.error_description ? ` (${errData.error_description})` : "";
    const isInvalidGrant = errCode === "invalid_grant" || String(errDesc).toLowerCase().includes("expired") || String(errDesc).toLowerCase().includes("revoked");

    console.error(`[GDRIVE] Failed to fetch OAuth access token: ${errCode}${errDesc}`);

    return {
      accessToken: null,
      requiresAuth: isInvalidGrant,
      authUrl: "/api/auth/gdrive/auth",
      error: isInvalidGrant
        ? "Google Drive authorization has expired. Your Google Cloud OAuth Consent Screen is currently in 'Testing' mode (which expires after 7 days). Set it to 'Production' in Google Cloud Console and re-authorize once to make it permanent forever."
        : `Google Drive OAuth error: ${errCode}${errDesc}`,
    };
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
      requiresAuth: tokenResult.requiresAuth,
      authUrl: tokenResult.authUrl || "/api/auth/gdrive/auth",
      error: tokenResult.error || "Could not authenticate with Google Drive storage.",
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
    throw new Error("Google Drive access token could not be generated. Please re-authorize Google Drive.");
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
    throw new Error("Google Drive access token could not be generated.");
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

export async function uploadBufferToGoogleDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string = "audio/mpeg"
): Promise<{ audioUrl: string; fileId: string }> {
  const accessToken = await getGoogleDriveAccessToken();
  if (!accessToken) {
    throw new Error("Google Drive access token could not be generated. Please re-authorize Google Drive.");
  }

  const folderId = extractFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID);
  const metadata: Record<string, any> = {
    name: fileName,
    mimeType,
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartBody = Buffer.concat([
    Buffer.from(
      delimiter +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${mimeType}\r\n\r\n`
    ),
    buffer,
    Buffer.from(closeDelimiter),
  ]);

  const response = await axios.post(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    multipartBody,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 120000,
    }
  );

  const fileId = response.data?.id;
  if (!fileId) {
    throw new Error("Google Drive upload failed to return a valid file ID.");
  }

  return {
    fileId,
    audioUrl: `https://drive.google.com/file/d/${fileId}/view`,
  };
}