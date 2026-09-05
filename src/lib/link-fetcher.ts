import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";
import os from "os";
import { randomUUID } from "crypto";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { createWriteStream, existsSync, mkdirSync } from "fs";
import { getFfmpegBinary, extractAudioFromVideo, isMediaVideo } from "./media-extractor";
import { uploadBufferToGoogleDrive, downloadGoogleDriveFile, getGoogleDriveFileId } from "./gdrive";

const execFileAsync = promisify(execFile);

/**
/**
 * Resolves or downloads the standalone yt-dlp binary.
 * In production/serverless (Vercel, AWS Lambda), the root filesystem (/var/task)
 * is read-only, so we MUST store downloaded binaries in os.tmpdir() (/tmp).
 * On Linux, we use `yt-dlp_linux` which is a self-contained ELF binary with bundled
 * Python runtime, avoiding any dependency on system `python3`.
 */
export async function ensureYtDlpBinary(): Promise<string> {
  const binaryName =
    os.platform() === "win32"
      ? "yt-dlp.exe"
      : os.platform() === "darwin"
      ? "yt-dlp_macos"
      : "yt-dlp_linux";

  // 1. Check local bin in workspace (e.g. during development)
  try {
    const localBin = join(process.cwd(), "bin", binaryName);
    if (existsSync(localBin)) {
      return localBin;
    }
  } catch {}

  // 2. In serverless (Vercel / Lambda), only os.tmpdir() is writable
  const tmpBinDir = join(os.tmpdir(), "meetlog_bin");
  const tmpExePath = join(tmpBinDir, binaryName);

  if (existsSync(tmpExePath)) {
    return tmpExePath;
  }

  // Ensure /tmp/meetlog_bin directory exists
  if (!existsSync(tmpBinDir)) {
    mkdirSync(tmpBinDir, { recursive: true });
  }

  // Standalone binaries with embedded Python runtime
  const downloadUrl =
    os.platform() === "win32"
      ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
      : os.platform() === "darwin"
      ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"
      : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

  console.log(`[LINK FETCHER] Downloading standalone yt-dlp binary to ${tmpExePath} from ${downloadUrl}...`);
  const res = await axios({
    url: downloadUrl,
    method: "GET",
    responseType: "stream",
    timeout: 60000,
  });

  const writer = createWriteStream(tmpExePath);
  res.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on("finish", () => resolve(true));
    writer.on("error", reject);
  });

  // On linux/mac (Vercel / Lambda), ensure executable permission
  if (os.platform() !== "win32") {
    const { chmod } = await import("fs/promises");
    await chmod(tmpExePath, 0o755);
  }

  console.log(`[LINK FETCHER] Standalone yt-dlp installed successfully at ${tmpExePath}`);
  return tmpExePath;
}

export interface IngestedLinkResult {
  audioUrl: string;
  fileId: string;
  title: string;
  durationSeconds: number;
}

/**
 * Downloads media from any URL (YouTube, Google Drive, or direct link),
 * extracts a pristine 16kHz speech MP3, and uploads it to workspace Google Drive.
 */
export async function ingestMediaLink(
  rawUrl: string,
  preferredTitle?: string,
  onLog?: (category: string, message: string) => void
): Promise<IngestedLinkResult> {
  const url = rawUrl.trim();
  const sessionId = randomUUID();
  const tmpDir = join(os.tmpdir(), `meetlog_link_${sessionId}`);
  await mkdir(tmpDir, { recursive: true });

  const log = (cat: string, msg: string) => {
    console.log(`[LINK INGESTION] [${cat}] ${msg}`);
    if (onLog) onLog(cat, msg);
  };

  log("validate", "Validating remote media address...");

  const isYouTube =
    url.includes("youtube.com") ||
    url.includes("youtu.be");

  const isGoogleDrive = url.includes("drive.google.com");

  let audioBuffer: Buffer;
  let detectedTitle = preferredTitle || "";
  let durationSeconds = 0;

  try {
    // ─── 1. YouTube Media Ingestion (Video to Audio Conversion) ───────────────
    if (isYouTube) {
      log("youtube", "Parsing YouTube video identifier & metadata...");

      let videoId = "";
      const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
      if (ytMatch) {
        videoId = ytMatch[1];
      }

      // Fetch metadata via official oEmbed (<100ms)
      if (videoId) {
        try {
          const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
          const oembedRes = await axios.get(oembedUrl, { timeout: 5000 });
          if (!detectedTitle && oembedRes.data?.title) {
            detectedTitle = oembedRes.data.title;
          }
        } catch (oeErr: any) {
          console.warn("[LINK FETCHER] YouTube oEmbed warning:", oeErr.message);
        }
      }

      log("youtube", "Extracting YouTube audio stream via high-speed extractor...");
      const ytDlpPath = await ensureYtDlpBinary();
      const ffmpegPath = getFfmpegBinary();

      const outputTemplate = join(tmpDir, `youtube_audio.%(ext)s`);
      const targetMp3 = join(tmpDir, `youtube_audio.mp3`);

      // Support YouTube cookies or proxy for cloud/Vercel bypass
      let cookiePath: string | null = null;
      if (process.env.YOUTUBE_COOKIES) {
        try {
          cookiePath = join(os.tmpdir(), "meetlog_yt_cookies.txt");
          const cookieContent = process.env.YOUTUBE_COOKIES.trim().replace(/\\n/g, "\n");
          await writeFile(cookiePath, cookieContent, "utf-8");
          log("cookies", "Loaded YouTube authentication cookies from environment.");
        } catch (e: any) {
          console.warn("[LINK FETCHER] Could not write YOUTUBE_COOKIES:", e.message);
        }
      }

      const clientArgs = [
        "--no-playlist",
        "--extractor-args",
        "youtube:player_client=ios,mweb,web_creator,default",
        ...(process.execPath ? ["--js-runtimes", `node:${process.execPath}`] : []),
        ...(cookiePath ? ["--cookies", cookiePath] : []),
        ...(process.env.YOUTUBE_PROXY ? ["--proxy", process.env.YOUTUBE_PROXY] : []),
      ];

      // Query metadata if not detected yet
      if (!detectedTitle || durationSeconds === 0) {
        try {
          const { stdout: metaOut } = await execFileAsync(ytDlpPath, [
            "--dump-json",
            ...clientArgs,
            url,
          ]);
          const parsed = JSON.parse(metaOut);
          if (!detectedTitle && parsed.title) detectedTitle = parsed.title;
          if (parsed.duration) durationSeconds = Math.round(Number(parsed.duration));
        } catch (metaErr: any) {
          console.warn("[LINK FETCHER] Metadata extraction non-fatal:", metaErr.message);
        }
      }

      log("extract", "Transcoding YouTube audio stream into 16kHz speech standard via FFmpeg...");
      try {
        await execFileAsync(ytDlpPath, [
          "-x",
          "--audio-format",
          "mp3",
          "--audio-quality",
          "128K",
          "--postprocessor-args",
          "ExtractAudio:-b:a 128k -ar 16000 -ac 1",
          "--ffmpeg-location",
          ffmpegPath,
          ...clientArgs,
          "-o",
          outputTemplate,
          url,
        ]);
      } catch (ytErr: any) {
        const fullErr = (ytErr.stderr || ytErr.message || "").toString();
        if (
          fullErr.includes("Sign in to confirm you're not a bot") ||
          fullErr.includes("Sign in to confirm you’re not a bot")
        ) {
          throw new Error(
            "YouTube blocked cloud datacenter stream extraction for this video. " +
            "To enable YouTube links on Vercel, configure YOUTUBE_COOKIES in Vercel settings, or download the audio file and upload it directly via 'Upload File'."
          );
        }
        throw ytErr;
      }

      if (!existsSync(targetMp3)) {
        throw new Error("YouTube audio extraction failed: output file not created.");
      }

      audioBuffer = await readFile(targetMp3);
    }

    // ─── 2. Google Drive Media Ingestion ──────────────────────────────────────
    else if (isGoogleDrive) {
      log("gdrive", "Retrieving Google Drive shared recording...");
      const rawBuffer = await downloadGoogleDriveFile(url);

      if (isMediaVideo(url, rawBuffer)) {
        log("extract", "Extracting 16kHz speech audio from Google Drive video recording...");
        const extracted = await extractAudioFromVideo(rawBuffer, "gdrive_media.mp4");
        audioBuffer = extracted.audioBuffer;
      } else {
        audioBuffer = rawBuffer;
      }

      if (!detectedTitle) {
        detectedTitle = `Google Drive Recording ${new Date().toLocaleDateString()}`;
      }
    }

    // ─── 3. Direct Audio / Video URL Ingestion ────────────────────────────────
    else {
      log("download", `Connecting to direct media stream (${url.slice(0, 45)})...`);

      // If Dropbox link, ensure raw download query
      let downloadUrl = url;
      if (downloadUrl.includes("dropbox.com") && downloadUrl.includes("dl=0")) {
        downloadUrl = downloadUrl.replace("dl=0", "raw=1");
      }

      const res = await axios.get(downloadUrl, {
        responseType: "arraybuffer",
        timeout: 300000, // 5 min timeout
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      const rawBuffer = Buffer.from(res.data);
      log("download", `Downloaded ${(rawBuffer.length / (1024 * 1024)).toFixed(1)}MB media stream.`);

      if (isMediaVideo(url, rawBuffer)) {
        log("extract", "Transcoding video stream into 16kHz speech audio via FFmpeg...");
        const extracted = await extractAudioFromVideo(rawBuffer, url);
        audioBuffer = extracted.audioBuffer;
      } else {
        audioBuffer = rawBuffer;
      }

      if (!detectedTitle) {
        const cleanName = url.split("?")[0].split("/").pop() || "Media Recording";
        detectedTitle = cleanName.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      }
    }

    // ─── 4. Upload Extracted Speech MP3 to Google Drive Storage ───────────────
    log("storage", `Saving ${(audioBuffer.length / (1024 * 1024)).toFixed(1)}MB speech audio into workspace cloud storage...`);
    const cleanFileName = `MeetLog-${(detectedTitle || "Recording").replace(/[^a-zA-Z0-9]/g, "_")}-${Date.now()}.mp3`;
    const driveUpload = await uploadBufferToGoogleDrive(
      audioBuffer,
      cleanFileName,
      "audio/mpeg",
      (percent) => {
        log("storage", `Cloud storage upload progress: ${percent}%`);
      }
    );

    log("success", "Speech audio stored in cloud storage! Meeting ready for transcription.");

    return {
      audioUrl: driveUpload.audioUrl,
      fileId: driveUpload.fileId,
      title: detectedTitle || "Media Recording",
      durationSeconds,
    };
  } finally {
    // Clean up temporary files
    const { rm } = await import("fs/promises");
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
