import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { createDriveResumableSession } from "@/lib/gdrive";

export async function POST(req: Request) {
  try {
    await requireUser();

    const body = await req.json();
    const { fileName, fileSize, mimeType } = body;

    if (!fileName || !fileSize) {
      return NextResponse.json(
        { error: "fileName and fileSize are required." },
        { status: 400 }
      );
    }

    const session = await createDriveResumableSession({
      fileName: fileName || `MeetLog-Recording-${Date.now()}.mp3`,
      fileSize: Number(fileSize),
      mimeType: mimeType || "audio/mpeg",
    });

    if (!session.isDriveConfigured) {
      return NextResponse.json({
        isDriveConfigured: false,
        error: session.error || "Google Drive OAuth is not authenticated.",
        message: session.error || "Google Drive OAuth credentials not configured.",
      });
    }

    return NextResponse.json({
      isDriveConfigured: true,
      uploadUrl: session.uploadUrl,
    });
  } catch (error: any) {
    console.error("[GDRIVE API SESSION ERROR]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to initialize Google Drive upload session." },
      { status: 500 }
    );
  }
}
