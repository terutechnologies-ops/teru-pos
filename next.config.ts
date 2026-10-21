import type { NextConfig } from "next";

import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  // El motor de Prisma no se traza solo (el cliente vive en
  // src/generated/prisma y Next lo empaqueta): sin esto, en Vercel las
  // consultas fallan con "could not locate the Query Engine". Ver src/lib/db.ts.
  outputFileTracingIncludes: {
    "/**": ["./src/generated/prisma/*.node"],
  },
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
