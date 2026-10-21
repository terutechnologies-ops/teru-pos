import type { NextConfig } from "next";

import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      // El logo admite hasta 1 MB; el resto cubre el formato multipart.
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders({
          isDev: process.env.NODE_ENV !== "production",
          imageUrls: [process.env.SUPABASE_URL, process.env.APP_URL],
        }),
      },
    ];
  },
};

export default nextConfig;
