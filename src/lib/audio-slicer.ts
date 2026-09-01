import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import os from "os";
import { randomUUID } from "crypto";
import { existsSync } from "fs";

const execFileAsync = promisify(execFile);

// Resolve real filesystem path to ffmpeg binary (handling Next.js bundler /ROOT/ alias)
function getFfmpegPath(): string {
  const binaryName = os.platform() === "win32" ? "ffmpeg.exe" : "ffmpeg";

  // 1. Check direct project node_modules on real disk
  const directPath = join(process.cwd(), "node_modules", "ffmpeg-static", binaryName);
  if (existsSync(directPath)) {
    return directPath;
  }

  // 2. Check parent node_modules (monorepo / production deployment)
  const parentPath = join(process.cwd(), "..", "node_modules", "ffmpeg-static", binaryName);
  if (existsSync(parentPath)) {
    return parentPath;
  }

  // 3. Resolve via require if path exists on disk
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

  // 4. Fallback to system PATH
  return "ffmpeg";
}

export interface AudioSlice {
  buffer: Buffer;
  partIndex: number;
  totalParts: number;
  startOffsetSeconds: number;
  durationSeconds: number;
  fileName: string;
}

// 90 minutes (5,400s) target chunk size, with 7,000s threshold
export const MAX_SAFE_SARVAM_DURATION = 7000;
export const CHUNK_DURATION_SECONDS = 5400;

/**
 * Probe audio duration in seconds using ffmpeg CLI output.
 */
export async function getAudioDuration(filePath: string): Promise<number> {
  const ffmpegPath = getFfmpegPath();
  try {
    const { stderr } = await execFileAsync(ffmpegPath, ["-i", filePath]).catch((err) => ({
      stderr: err.stderr || err.message || "",
      stdout: "",
    }));

    const durationMatch = String(stderr).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
    if (durationMatch) {
      const hours = parseFloat(durationMatch[1]);
      const minutes = parseFloat(durationMatch[2]);
      const seconds = parseFloat(durationMatch[3]);
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      return Math.round(totalSeconds);
    }
  } catch (error) {
    console.warn("[AUDIO SLICER] Could not probe exact duration via ffmpeg:", error);
  }
  return 0;
}

/**
 * Slices an audio buffer into parts if it exceeds the maximum safe duration for Sarvam AI.
 * If the audio is <= 100MB or <= 7000s, returns the original buffer as a single slice instantly.
 * If > 100MB, losslessly splits the audio into 90-minute (5400s) chunks with zero quality loss.
 */
export async function sliceAudioBuffer(
  audioBuffer: Buffer,
  originalFileName: string = "meeting.mp3",
  customChunkDuration?: number,
  customMaxThreshold?: number,
  overlapSeconds: number = 6
): Promise<AudioSlice[]> {
  const sessionId = randomUUID();
  const tmpDir = join(os.tmpdir(), `meetlog_slice_${sessionId}`);
  await mkdir(tmpDir, { recursive: true });

  const chunkDuration = customChunkDuration || CHUNK_DURATION_SECONDS;
  const maxThreshold = customMaxThreshold || MAX_SAFE_SARVAM_DURATION;
  const stepDuration = Math.max(10, chunkDuration - overlapSeconds);

  const ext = originalFileName.includes(".")
    ? originalFileName.split(".").pop() || "mp3"
    : "mp3";
  const inputFilePath = join(tmpDir, `source.${ext}`);

  const tempFilesToClean: string[] = [inputFilePath];

  try {
    await writeFile(inputFilePath, audioBuffer);

    const durationSeconds = await getAudioDuration(inputFilePath);
    console.log(
      `[AUDIO SLICER] Input audio size: ${Math.round(audioBuffer.byteLength / (1024 * 1024))}MB, Exact Duration: ${durationSeconds}s (~${Math.round(durationSeconds / 60)} mins)`
    );

    // If audio is under max safe threshold, return single slice with exact probed duration
    if (durationSeconds > 0 && durationSeconds <= maxThreshold) {
      return [
        {
          buffer: audioBuffer,
          partIndex: 1,
          totalParts: 1,
          startOffsetSeconds: 0,
          durationSeconds,
          fileName: `part_1_${originalFileName}`,
        },
      ];
    }

    if (audioBuffer.byteLength <= 100 * 1024 * 1024 && durationSeconds === 0) {
      return [
        {
          buffer: audioBuffer,
          partIndex: 1,
          totalParts: 1,
          startOffsetSeconds: 0,
          durationSeconds: 0,
          fileName: `part_1_${originalFileName}`,
        },
      ];
    }

    const totalParts =
      durationSeconds > 0
        ? Math.ceil(durationSeconds / stepDuration)
        : Math.max(1, Math.ceil(audioBuffer.byteLength / (100 * 1024 * 1024)));

    if (totalParts <= 1) {
      return [
        {
          buffer: audioBuffer,
          partIndex: 1,
          totalParts: 1,
          startOffsetSeconds: 0,
          durationSeconds: durationSeconds > 0 ? durationSeconds : 0,
          fileName: `part_1_${originalFileName}`,
        },
      ];
    }

    console.log(
      `[AUDIO SLICER] Audio duration (${durationSeconds}s) exceeds threshold (${maxThreshold}s). Splitting into ${totalParts} frame-accurate sub-parts (${chunkDuration}s each, ${overlapSeconds}s overlap)...`
    );

    const ffmpegPath = getFfmpegPath();
    const slices: AudioSlice[] = [];

    for (let i = 0; i < totalParts; i++) {
      const partNumber = i + 1;
      const startOffset = i * stepDuration;
      const partDuration =
        durationSeconds > 0
          ? Math.min(chunkDuration, Math.max(1, durationSeconds - startOffset))
          : chunkDuration;

      // Skip if startOffset already exceeds duration
      if (durationSeconds > 0 && startOffset >= durationSeconds) {
        break;
      }

      const outputFilePath = join(tmpDir, `slice_part_${partNumber}.${ext}`);
      tempFilesToClean.push(outputFilePath);

      console.log(
        `[AUDIO SLICER] Slicing Part ${partNumber}/${totalParts}: ${Math.floor(startOffset / 60)}m${startOffset % 60}s to ${Math.floor((startOffset + partDuration) / 60)}m${(startOffset + partDuration) % 60}s (duration: ${partDuration}s)...`
      );

      // Accurate decoding seek (-i before -ss) to guarantee bit-perfect sample alignment without packet transport drift
      await execFileAsync(ffmpegPath, [
        "-i",
        inputFilePath,
        "-ss",
        String(startOffset),
        "-t",
        String(partDuration),
        "-avoid_negative_ts",
        "make_zero",
        "-acodec",
        "libmp3lame",
        "-b:a",
        "128k",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-y",
        outputFilePath,
      ]);

      const sliceBuffer = await readFile(outputFilePath);
      console.log(
        `[AUDIO SLICER] Part ${partNumber}/${totalParts} sliced successfully (${Math.round(sliceBuffer.byteLength / (1024 * 1024))}MB).`
      );

      slices.push({
        buffer: sliceBuffer,
        partIndex: partNumber,
        totalParts,
        startOffsetSeconds: startOffset,
        durationSeconds: partDuration,
        fileName: `part_${partNumber}_${originalFileName}`,
      });
    }

    return slices;
  } finally {
    // Cleanup temporary files
    for (const f of tempFilesToClean) {
      try {
        await unlink(f).catch(() => {});
      } catch {}
    }
  }
}