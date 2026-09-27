import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      // El logo admite hasta 1 MB; el resto cubre el formato multipart.
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
