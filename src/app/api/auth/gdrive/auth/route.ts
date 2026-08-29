import { NextResponse } from "next/server";
import { getGoogleDriveAuthUrl } from "@/lib/gdrive";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const redirectUri = searchParams.get("redirectUri") || undefined;
    const state = searchParams.get("state") || searchParams.get("workspace") || undefined;
    const isJson = searchParams.get("json") === "1";

    const authUrl = getGoogleDriveAuthUrl(redirectUri, state);

    if (isJson) {
      return NextResponse.json({ url: authUrl });
    }

    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    console.error("[GDRIVE AUTH INIT ERROR]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to initialize Google Drive authorization." },
      { status: 500 }
    );
  }
}
