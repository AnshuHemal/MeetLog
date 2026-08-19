import { NextResponse } from "next/server";
import crypto from "crypto";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const timestamp = Math.round(new Date().getTime() / 1000);
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  if (!apiSecret || !apiKey || !cloudName) {
    return NextResponse.json(
      { error: "Cloudinary environment variables are not configured." },
      { status: 500 }
    );
  }

  const paramsToSign = {
    folder: "meetlog_audio",
    timestamp: timestamp.toString(),
  };

  const sortedParamsString = Object.keys(paramsToSign)
    .sort()
    .map((key) => `${key}=${paramsToSign[key as keyof typeof paramsToSign]}`)
    .join("&");

  const stringToSign = sortedParamsString + apiSecret;
  const signature = crypto
    .createHash("sha1")
    .update(stringToSign)
    .digest("hex");

  return NextResponse.json({
    signature,
    timestamp,
    apiKey,
    cloudName,
    folder: paramsToSign.folder,
  });
}
