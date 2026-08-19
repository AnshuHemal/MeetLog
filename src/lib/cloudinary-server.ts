import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export interface CloudinaryAssetRef {
  publicId: string;
  resourceType: "video" | "image" | "raw";
}

export function parseCloudinaryAssetUrl(url: string): CloudinaryAssetRef | null {
  if (!url.includes("cloudinary.com")) return null;

  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const uploadIdx = segments.indexOf("upload");
    if (uploadIdx < 1) return null;

    const resourceType = segments[uploadIdx - 1] as CloudinaryAssetRef["resourceType"];
    if (!["video", "image", "raw"].includes(resourceType)) return null;

    let i = uploadIdx + 1;

    while (i < segments.length) {
      const segment = segments[i];
      if (/^v\d+$/.test(segment)) {
        i++;
        break;
      }
      if (segment.includes(",") || segment.includes("=")) {
        i++;
        continue;
      }
      break;
    }

    const publicIdWithExt = segments.slice(i).join("/");
    if (!publicIdWithExt) return null;

    const publicId = publicIdWithExt.replace(/\.[^/.]+$/, "");
    return { publicId, resourceType };
  } catch {
    return null;
  }
}

export async function deleteCloudinaryAssetByUrl(
  audioUrl: string,
): Promise<{ deleted: boolean; skipped: boolean }> {
  const asset = parseCloudinaryAssetUrl(audioUrl);
  if (!asset) {
    return { deleted: false, skipped: true };
  }

  try {
    const result = await cloudinary.uploader.destroy(asset.publicId, {
      resource_type: asset.resourceType,
      invalidate: true,
    });

    const ok = result.result === "ok" || result.result === "not found";
    return { deleted: ok, skipped: false };
  } catch (error) {
    console.error("[cloudinary] Failed to delete asset:", asset.publicId, error);
    throw error;
  }
}
