import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import axios from "axios";

function isPrivateIpOrHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "0.0.0.0" ||
    lower === "::1" ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    return true;
  }

  // Check private IP ranges
  if (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(lower) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(lower) ||
    /^169\.254\.\d{1,3}\.\d{1,3}$/.test(lower) // AWS/Cloud metadata
  ) {
    return true;
  }

  return false;
}

export async function POST(req: Request) {
  try {
    await requireUser();

    const body = await req.json();
    const rawUrl = String(body?.url || "").trim();

    if (!rawUrl) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        { error: "Only HTTP and HTTPS URLs are supported" },
        { status: 400 }
      );
    }

    if (isPrivateIpOrHost(parsedUrl.hostname)) {
      return NextResponse.json(
        { error: "Access to private or local network hosts is blocked." },
        { status: 403 }
      );
    }

    // 1. YouTube Detection
    const isYouTube =
      parsedUrl.hostname.includes("youtube.com") ||
      parsedUrl.hostname.includes("youtu.be");

    if (isYouTube) {
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
          rawUrl
        )}&format=json`;
        const res = await axios.get(oembedUrl, { timeout: 8000 });
        if (res.data) {
          return NextResponse.json({
            success: true,
            platform: "youtube",
            title: res.data.title || "YouTube Video",
            author: res.data.author_name || "YouTube Creator",
            thumbnailUrl: res.data.thumbnail_url || null,
            platformLabel: "YouTube",
          });
        }
      } catch (ytErr: any) {
        console.warn("[YOUTUBE OEMBED PREVIEW WARNING]", ytErr.message);
        // Fallback for valid YouTube link if oEmbed fails
        return NextResponse.json({
          success: true,
          platform: "youtube",
          title: "YouTube Video",
          author: "YouTube Creator",
          thumbnailUrl: null,
          platformLabel: "YouTube",
        });
      }
    }

    // 2. Google Drive Detection
    const isGoogleDrive = parsedUrl.hostname.includes("drive.google.com");
    if (isGoogleDrive) {
      const fileId =
        rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] ||
        rawUrl.match(/id=([a-zA-Z0-9_-]+)/)?.[1] ||
        "";

      return NextResponse.json({
        success: true,
        platform: "gdrive",
        title: "Google Drive Media Recording",
        author: "Google Drive",
        thumbnailUrl: null,
        fileId: fileId || null,
        platformLabel: "Google Drive",
      });
    }

    // 3. Loom Detection
    const isLoom = parsedUrl.hostname.includes("loom.com");
    if (isLoom) {
      try {
        const oembedUrl = `https://www.loom.com/v1/oembed?url=${encodeURIComponent(
          rawUrl
        )}`;
        const res = await axios.get(oembedUrl, { timeout: 6000 });
        if (res.data) {
          return NextResponse.json({
            success: true,
            platform: "loom",
            title: res.data.title || "Loom Recording",
            author: res.data.author_name || "Loom User",
            thumbnailUrl: res.data.thumbnail_url || null,
            platformLabel: "Loom",
          });
        }
      } catch {
        return NextResponse.json({
          success: true,
          platform: "loom",
          title: "Loom Video Recording",
          author: "Loom",
          thumbnailUrl: null,
          platformLabel: "Loom",
        });
      }
    }

    // 4. Direct Media URL (HEAD request inspection)
    try {
      const headRes = await axios.head(rawUrl, {
        timeout: 8000,
        maxRedirects: 5,
        validateStatus: () => true,
      });

      const contentType = String(headRes.headers["content-type"] || "");
      const rawContentLength = headRes.headers["content-length"];
      const contentLengthStr = typeof rawContentLength === "number" ? String(rawContentLength) : String(rawContentLength || "");
      const pathname = parsedUrl.pathname;
      const cleanFileName = pathname.split("/").pop() || "media_recording";

      const isMedia =
        contentType.includes("audio") ||
        contentType.includes("video") ||
        contentType.includes("octet-stream") ||
        /\.(mp4|webm|mov|mkv|avi|mp3|wav|m4a|aac|flac|ogg)$/i.test(pathname);

      return NextResponse.json({
        success: true,
        platform: "direct",
        title: cleanFileName.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
        author: parsedUrl.hostname,
        contentType,
        sizeBytes: contentLengthStr ? parseInt(contentLengthStr, 10) : undefined,
        isMedia,
        platformLabel: "Web Stream",
      });
    } catch {
      // If HEAD fails, still allow user to submit
      const pathname = parsedUrl.pathname;
      const cleanFileName = pathname.split("/").pop() || "media_recording";
      return NextResponse.json({
        success: true,
        platform: "direct",
        title: cleanFileName.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
        author: parsedUrl.hostname,
        platformLabel: "Direct Link",
      });
    }
  } catch (error: any) {
    console.error("[MEDIA PREVIEW ERROR]", error);
    return NextResponse.json(
      { error: error.message || "Failed to inspect media link." },
      { status: 500 }
    );
  }
}
