import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone build для Docker — минимальный образ без node_modules
  output: "standalone",
  // Опционально: если backend на другом домене и нужен прокси
  // async rewrites() {
  //   return [
  //     { source: "/api/:path*", destination: `${process.env.API_PROXY_URL}/api/:path*` },
  //   ];
  // },
};

export default nextConfig;
