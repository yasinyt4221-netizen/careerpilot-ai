import type { NextConfig } from "next";

const exportSite = process.env.STATIC_EXPORT === "true";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(exportSite ? { output: "export" as const, trailingSlash: true, basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "", images: { unoptimized: true } } : {}),
};
export default nextConfig;
