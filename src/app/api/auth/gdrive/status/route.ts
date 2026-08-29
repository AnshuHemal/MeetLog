import { NextResponse } from "next/server";
import { getGoogleDriveAccessTokenDetails } from "@/lib/gdrive";
import axios from "axios";

export async function GET() {
  try {
    const tokenResult = await getGoogleDriveAccessTokenDetails();

    if (!tokenResult.accessToken) {
      return NextResponse.json({
        isAuthorized: false,
        requiresAuth: true,
        authUrl: tokenResult.authUrl || "/api/auth/gdrive/auth",
        error: tokenResult.error || "Google Drive is not authorized.",
      });
    }

    let userEmail = "Authorized User";
    try {
      const driveTest = await axios.get("https://www.googleapis.com/drive/v3/about?fields=user", {
        headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
        timeout: 5000,
      });
      userEmail = driveTest.data.user?.emailAddress || userEmail;
    } catch {}

    return NextResponse.json({
      isAuthorized: true,
      email: userEmail,
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || null,
    });
  } catch (error: any) {
    return NextResponse.json({
      isAuthorized: false,
      requiresAuth: true,
      authUrl: "/api/auth/gdrive/auth",
      error: error.message,
    });
  }
}
