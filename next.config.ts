import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isProduction = process.env.NODE_ENV === "production";
const scriptSrc = isProduction
  ? "script-src 'self' 'unsafe-inline';"
  : "script-src 'self' 'unsafe-eval' 'unsafe-inline';";

function getSupabaseOrigin(): string {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!envUrl) return "https://xmuqsgfxuaaophxnwure.supabase.co";

  try {
    const parsed = new URL(envUrl);
    return parsed.origin;
  } catch {
    return "https://xmuqsgfxuaaophxnwure.supabase.co";
  }
}

const supabaseOrigin = getSupabaseOrigin();
const supabaseWssOrigin = supabaseOrigin.replace(/^https:/, "wss:");
const supabaseHostname = new URL(supabaseOrigin).hostname;
const posthogProxyPath = "/flux";
const legacyPosthogProxyPath = "/ingest";
const posthogApiHost = "https://us.i.posthog.com";
const posthogAssetsHost = "https://us-assets.i.posthog.com";
const appOrigin =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "http://localhost:3000";
const ffmpegTraceIncludes = [
  process.platform === "win32"
    ? "./node_modules/ffmpeg-static/ffmpeg.exe"
    : "./node_modules/ffmpeg-static/ffmpeg",
  "./node_modules/ffmpeg-static/package.json",
];

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; " +
      scriptSrc +
      ` style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: ${supabaseOrigin} https://images.unsplash.com https://api.dicebear.com https://lh3.googleusercontent.com https://avatars.githubusercontent.com https://i.ytimg.com https://img.youtube.com https://books.google.com https://books.googleusercontent.com https://covers.openlibrary.org; media-src 'self' blob: data: ${supabaseOrigin}; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; ` +
      (isProduction ? "upgrade-insecure-requests; " : "") +
      `connect-src 'self' ${supabaseOrigin} ${supabaseWssOrigin};`,
  },
];

const corsHeaders = [
  { key: "Access-Control-Allow-Credentials", value: "true" },
  { key: "Access-Control-Allow-Origin", value: appOrigin },
  { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
  { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
  { key: "Vary", value: "Origin" },
];

function getPostHogProxyRewrites(proxyPath: string) {
  return [
    {
      source: `${proxyPath}/static/:path*`,
      destination: `${posthogAssetsHost}/static/:path*`,
    },
    {
      source: `${proxyPath}/array/:path*`,
      destination: `${posthogAssetsHost}/array/:path*`,
    },
    {
      source: `${proxyPath}/:path*`,
      destination: `${posthogApiHost}/:path*`,
    },
  ];
}

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/admin/content": ffmpegTraceIncludes,
    "/api/admin/content/[id]": ffmpegTraceIncludes,
    "/api/admin/content/bulk": ffmpegTraceIncludes,
    "/api/admin/content/[id]/narration": ffmpegTraceIncludes,
    "/api/admin/narration/process": ffmpegTraceIncludes,
  },
  images: {
    deviceSizes: [640, 768, 1024, 1280],
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    imageSizes: [32, 48, 96, 112, 150, 224, 700],
    localPatterns: [
      { pathname: "/images/**" },
    ],
    qualities: [75],
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHostname,
        pathname: "/storage/v1/object/public/media/**",
      },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "api.dicebear.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "books.google.com" },
      { protocol: "https", hostname: "books.googleusercontent.com" },
      { protocol: "https", hostname: "covers.openlibrary.org" },
    ],
  },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // Apply CORS headers to all API routes
        source: "/api/:path*",
        headers: corsHeaders,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/categories",
        destination: "/browse",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      ...getPostHogProxyRewrites(posthogProxyPath),
      ...getPostHogProxyRewrites(legacyPosthogProxyPath),
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  tunnelRoute: "/error-monitoring",
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  webpack: {
    treeshake: {
      removeDebugLogging: true,
      removeTracing: true,
    },
  },
});
