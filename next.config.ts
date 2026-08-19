import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase the server-side body size limit for the Google Drive chunk proxy route.
  // Each chunk is 8MB; the default limit is 4MB which causes 413 errors.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
