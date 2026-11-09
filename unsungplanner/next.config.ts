import type { NextConfig } from "next";

// Cloudflare Turnstile is optional. When a site key is present the client loads
// its script and the API requires a token, so the CSP has to allow it.
const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

// Next's dev server uses eval and a websocket for HMR; production does not need either.
const isDev = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js hydrates with inline bootstrap scripts, so 'unsafe-inline' is required
  // unless a nonce-based setup is introduced.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${turnstileEnabled ? " https://challenges.cloudflare.com" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Leaflet loads OpenStreetMap map tiles as <img> elements (see TravelMap.tsx).
  // Google profile avatars are loaded from lh3.googleusercontent.com.
  "img-src 'self' data: https://tile.openstreetmap.org https://lh3.googleusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}${turnstileEnabled ? " https://challenges.cloudflare.com" : ""}`,
  `frame-src 'self'${turnstileEnabled ? " https://challenges.cloudflare.com" : ""}`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  /* existing config */
  // cacheComponents/partialPrefetching disabled: no `use cache` usage in the
  // codebase, and the runtime behavior was incomplete on Cloudflare Workers
  // (render hung, vinext compat report: "cacheComponents — behavior incomplete").
  cacheComponents: false,
  partialPrefetching: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
