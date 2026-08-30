import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    await requireUser();

    const uploadUrl = req.headers.get("x-upload-url");
    const contentRange = req.headers.get("x-content-range");

    if (!uploadUrl || !contentRange) {
      return NextResponse.json(
        { error: "x-upload-url and x-content-range headers are required." },
        { status: 400 }
      );
    }

    const chunkArrayBuffer = await req.arrayBuffer();

    const gdriveResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Range": contentRange,
        "Content-Length": String(chunkArrayBuffer.byteLength),
        "Content-Type": "application/octet-stream",
      },
      body: chunkArrayBuffer,
    });

    const status = gdriveResponse.status;
    let responseData: Record<string, unknown> = {};

    if (status === 200 || status === 201) {
      responseData = await gdriveResponse.json().catch(() => ({}));
    }

    return NextResponse.json({ status, data: responseData }, { status: 200 });
  } catch (error: any) {
    console.error("[GDRIVE CHUNK PROXY ERROR]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to proxy chunk to Google Drive." },
      { status: 500 }
    );
  }
}