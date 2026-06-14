import type { NextConfig } from "next";

const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";

const csp = [
  "default-src 'self'",
  `connect-src 'self' ${supabaseOrigin} wss://${supabaseOrigin.replace(/^https?:\/\//, "")}`,
  "img-src 'self' data: blob: https:",
  "media-src 'self' data:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allow uploading product images. The default Server Action body
      // size limit is 1MB, which is smaller than most phone-camera photos
      // and caused "an unexpected response was received from the server"
      // errors before the action code even ran.
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
