import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import os from "os";
import { randomUUID } from "crypto";
import { existsSync } from "fs";

const execFileAsync = promisify(execFile);

// Resolve real filesystem path to ffmpeg binary (handling Next.js bundler /ROOT/ alias)
export function getFfmpegBinary(): string {
  const binaryName = os.platform() === "win32" ? "ffmpeg.exe" : "ffmpeg";

  const directPath = join(process.cwd(), "node_modules", "ffmpeg-static", binaryName);
  if (existsSync(directPath)) return directPath;

  const parentPath = join(process.cwd(), "..", "node_modules", "ffmpeg-static", binaryName);
  if (existsSync(parentPath)) return parentPath;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    let staticPath = require("ffmpeg-static");
    if (typeof staticPath === "object" && staticPath?.default) {
      staticPath = staticPath.default;
    }
    if (typeof staticPath === "string" && existsSync(staticPath)) {
      return staticPath;
    }
  } catch {}

  return "ffmpeg";
}

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "webm",
  "mov",
  "mkv",
  "avi",
  "flv",
  "m4v",
  "wmv",
  "3gp",
  "ts",
  "ogv",
]);

/**
 * Checks if a file is a video by inspecting file extension and magic bytes
 */
export function isMediaVideo(fileNameOrUrl: string, buffer?: Buffer): boolean {
  if (fileNameOrUrl) {
    const clean = fileNameOrUrl.split("?")[0].toLowerCase();
    const ext = clean.includes(".") ? clean.split(".").pop() || "" : "";
    if (VIDEO_EXTENSIONS.has(ext)) {
      return true;
    }
  }

  if (buffer && buffer.length >= 12) {
    // Check WebM / Matroska magic bytes (0x1A 0x45 0xDF 0xA3)
    if (
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    ) {
      return true;
    }

    // Check MP4 / MOV / M4V / 3GP ('ftyp' marker at offset 4)
    const ftyp = buffer.subarray(4, 8).toString("ascii");
    if (ftyp === "ftyp" || ftyp === "moov") {
      const majorBrand = buffer.subarray(8, 12).toString("ascii").toLowerCase();
      // If brand is strictly audio M4A, we treat it as audio
      if (majorBrand === "m4a " || majorBrand === "m4b ") {
        return false;
      }
      return true;
    }

    // Check AVI ('RIFF....AVI ')
    if (
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "AVI "
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Probes whether the media file contains a valid audio stream
 */
async function hasAudioStream(filePath: string, ffmpegPath: string): Promise<boolean> {
  try {
    const { stderr } = await execFileAsync(ffmpegPath, ["-i", filePath]).catch((err) => ({
      stderr: err.stderr || err.message || "",
      stdout: "",
    }));

    // Check if output mentions an audio stream
    return /Stream #\d+:\d+.*Audio:/i.test(stderr);
  } catch {
    return true; // Fallback to allowing conversion attempt
  }
}

/**
 * Extracts a high-fidelity 16kHz mono speech MP3 from any video file
 */
export async function extractAudioFromVideo(
  videoBuffer: Buffer,
  originalFileName: string = "meeting_video.mp4"
): Promise<{
  audioBuffer: Buffer;
  extractedFileName: string;
  durationSeconds: number;
}> {
  const ffmpegPath = getFfmpegBinary();
  const sessionId = randomUUID();
  const tmpDir = join(os.tmpdir(), `meetlog_v2a_${sessionId}`);
  await mkdir(tmpDir, { recursive: true });

  const clean = originalFileName.split("?")[0];
  const ext = clean.includes(".") ? clean.split(".").pop() || "mp4" : "mp4";
  const inputFilePath = join(tmpDir, `input_video.${ext}`);
  const outputFilePath = join(tmpDir, `extracted_audio.mp3`);

  try {
    console.log(
      `[MEDIA EXTRACTOR] Writing ${(videoBuffer.length / (1024 * 1024)).toFixed(1)}MB video to temporary storage for audio extraction...`
    );
    await writeFile(inputFilePath, videoBuffer);

    // Verify audio stream exists
    const hasAudio = await hasAudioStream(inputFilePath, ffmpegPath);
    if (!hasAudio) {
      throw new Error(
        "The uploaded video file does not contain an audio track. Please upload a video with spoken dialogue."
      );
    }

    console.log(`[MEDIA EXTRACTOR] Extracting 16kHz mono speech track with FFmpeg...`);
    const startTime = Date.now();

    // -vn: Strip all video packets
    // -acodec libmp3lame: Standard clean MP3 encoding
    // -ar 16000: 16kHz optimal speech recognition sample rate
    // -ac 1: Mono channel (cuts file size in half without vocal quality loss)
    // -avoid_negative_ts make_zero: Sample-accurate timecode zero alignment
    await execFileAsync(ffmpegPath, [
      "-i",
      inputFilePath,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-b:a",
      "128k",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-avoid_negative_ts",
      "make_zero",
      "-y",
      outputFilePath,
    ]);

    const audioBuffer = await readFile(outputFilePath);
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(
      `[MEDIA EXTRACTOR] Audio extraction completed in ${elapsedSec}s! Extracted size: ${(
        audioBuffer.length / (1024 * 1024)
      ).toFixed(1)}MB (down from ${(videoBuffer.length / (1024 * 1024)).toFixed(1)}MB).`
    );

    return {
      audioBuffer,
      extractedFileName: `${clean.replace(/\.[^/.]+$/, "")}_audio.mp3`,
      durationSeconds: 0,
    };
  } finally {
    await unlink(inputFilePath).catch(() => {});
    await unlink(outputFilePath).catch(() => {});
  }
}
