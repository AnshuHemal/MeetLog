import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import os from "os";
import { randomUUID } from "crypto";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let tmpFilePath: string | null = null;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeFileName = file.name.replace(/[^a-z0-9.\-_]/gi, "_");
    tmpFilePath = join(os.tmpdir(), `meetlog_${randomUUID()}_${safeFileName}`);
    await writeFile(tmpFilePath, buffer);

    const result = (await cloudinary.uploader.upload_large(tmpFilePath, {
      folder: "meetlog_audio",
      resource_type: "video",
      chunk_size: 6_000_000,
    })) as any;

    return NextResponse.json({
      audioUrl: result.secure_url,
      duration: result.duration ?? 0,
    });

  } catch (error: any) {
    console.error("[upload/audio] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Upload failed." },
      { status: 500 }
    );
  } finally {
    if (tmpFilePath) {
      await unlink(tmpFilePath).catch(() => {});
    }
  }
}
