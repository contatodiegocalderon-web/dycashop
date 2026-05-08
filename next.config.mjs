import fs from "node:fs";
import path from "node:path";

/** @type {import('next').NextConfig} */
const isProdDeploy =
  process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

if (isProdDeploy) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  });
}

// #region agent log
function debugLog(runId, hypothesisId, location, message, data) {
  fetch("http://127.0.0.1:7446/ingest/24af6af5-b59d-45ad-acbf-6e5e9842079c", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "ede246",
    },
    body: JSON.stringify({
      sessionId: "ede246",
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion

const nextConfig = {
  experimental: {
    /** Evita empacotar googleapis/sharp no webpack do App Router (chunks quebrados / module not found no dev). */
    serverComponentsExternalPackages: [
      "googleapis",
      "google-auth-library",
      "heic-convert",
      "heic-decode",
      "libheif-js",
      "sharp",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "drive.google.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
    unoptimized: false,
  },
  async headers() {
    const runId = `build-${Date.now()}`;
    const root = process.cwd();
    const adminCfg = path.join(root, "src", "app", "admin", "configuracao", "page.tsx");
    const apiCosts = path.join(
      root,
      "src",
      "app",
      "api",
      "admin",
      "category-costs",
      "route.ts"
    );
    const apiReorder = path.join(
      root,
      "src",
      "app",
      "api",
      "admin",
      "category-reorder",
      "route.ts"
    );
    // #region agent log
    debugLog(runId, "H1", "next.config.mjs:headers", "build headers entry", {
      cwd: root,
      nodeEnv: process.env.NODE_ENV ?? null,
    });
    // #endregion
    // #region agent log
    debugLog(runId, "H1", "next.config.mjs:headers", "route file existence", {
      adminConfiguracaoExists: fs.existsSync(adminCfg),
      apiCategoryCostsExists: fs.existsSync(apiCosts),
      apiCategoryReorderExists: fs.existsSync(apiReorder),
    });
    // #endregion
    // #region agent log
    debugLog(runId, "H2", "next.config.mjs:headers", "directory listing snapshot", {
      adminDir: fs.readdirSync(path.join(root, "src", "app", "admin")),
      apiAdminDir: fs.readdirSync(path.join(root, "src", "app", "api", "admin")),
    });
    // #endregion
    // #region agent log
    debugLog(runId, "H3", "next.config.mjs:headers", "route file stat", {
      adminCfgMtimeMs: fs.existsSync(adminCfg) ? fs.statSync(adminCfg).mtimeMs : null,
      apiCostsMtimeMs: fs.existsSync(apiCosts) ? fs.statSync(apiCosts).mtimeMs : null,
      apiReorderMtimeMs: fs.existsSync(apiReorder) ? fs.statSync(apiReorder).mtimeMs : null,
    });
    // #endregion

    return [
      {
        source: "/admin/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
