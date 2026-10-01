import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Tệp đính kèm nhu cầu (ảnh/video/PDF) tối đa 20 MB, khớp giới hạn bucket.
    serverActions: { bodySizeLimit: "21mb" },
  },
  poweredByHeader: false,
};

export default nextConfig;
