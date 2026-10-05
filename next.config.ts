import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tệp đính kèm (nhu cầu, xe) tải thẳng lên Storage bằng URL ký, không đi qua Server Action
  // (Vercel giới hạn thân yêu cầu hàm ~4,5 MB) nên không cần nâng bodySizeLimit.
  poweredByHeader: false,
};

export default nextConfig;
