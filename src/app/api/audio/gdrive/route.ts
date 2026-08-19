import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getGoogleDriveAccessToken } from "@/lib/gdrive";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("fileId");

    if (!fileId) {
      return NextResponse.json({ error: "fileId parameter is required" }, { status: 400 });
    }

    let isAuthorized = false;
    try {
      await requireUser();
      isAuthorized = true;
    } catch (authError) {
      const shareToken = searchParams.get("shareToken");
      if (shareToken) {
        const publicMeeting = await prisma.meeting.findFirst({
          where: {
            shareToken,
            isPublic: true,
          },
          select: { audioUrl: true },
        });

        if (publicMeeting && publicMeeting.audioUrl.includes(fileId)) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized access to this resource." }, { status: 401 });
    }

    const accessToken = await getGoogleDriveAccessToken();
    if (!accessToken) {
      return NextResponse.json({ error: "Google Drive is not configured." }, { status: 500 });
    }

    const rangeHeader = req.headers.get("range");

    const driveHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
    };
    if (rangeHeader) {
      driveHeaders["Range"] = rangeHeader;
    }

    const gdriveResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: driveHeaders,
      }
    );

    if (!gdriveResponse.ok) {
      const errorText = await gdriveResponse.text().catch(() => "");
      console.error("[GDRIVE AUDIO STREAM ERROR]", gdriveResponse.status, errorText);
      return NextResponse.json(
        { error: `Google Drive returned status ${gdriveResponse.status}` },
        { status: gdriveResponse.status }
      );
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", gdriveResponse.headers.get("Content-Type") || "audio/mpeg");
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");

    const etag = gdriveResponse.headers.get("ETag");
    if (etag) {
      responseHeaders.set("ETag", etag);
    }

    const contentRange = gdriveResponse.headers.get("Content-Range");
    if (contentRange) {
      responseHeaders.set("Content-Range", contentRange);
    }

    const contentLength = gdriveResponse.headers.get("Content-Length");
    if (contentLength) {
      responseHeaders.set("Content-Length", contentLength);
    }

    return new Response(gdriveResponse.body, {
      status: gdriveResponse.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("[GDRIVE AUDIO PROXY SYSTEM ERROR]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to proxy stream from Google Drive." },
      { status: 500 }
    );
  }
}
