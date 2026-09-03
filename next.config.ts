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
  // Security-hardening audit, Section 35. Deliberately conservative —
  // no Content-Security-Policy here yet: this app's actual set of
  // external script/connect origins (Firebase SDKs, AI providers
  // called server-side only, any future third-party embed) hasn't
  // been enumerated and tested against a CSP, and a wrong policy can
  // silently break functionality in production with no visible error.
  // Add one only after auditing every external resource the client
  // bundle actually loads. Firebase App Hosting terminates HTTPS in
  // front of this app, so HSTS is safe to declare unconditionally.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
