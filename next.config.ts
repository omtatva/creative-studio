import type { NextConfig } from "next";

/**
 * Next.js configuration.
 * Kept minimal and explicit so future flags (images, redirects,
 * experimental features) are easy to discover and extend.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
