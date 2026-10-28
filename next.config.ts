import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Application CSP. Email HTML never renders in this context: it is served by
 * /api/messages/:id/body with its own script-free, network-free policy and
 * displayed in a sandboxed iframe.
 */
const appCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "manifest-src 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const sharedHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["pg", "sanitize-html", "mailparser", "smtp-server"],
  async headers() {
    return [
      {
        // Everything except the email document and attachment routes, which
        // send their own stricter CSP and must be frameable by the app.
        source: "/((?!api/messages/[^/]+/body|api/messages/[^/]+/attachments).*)",
        headers: [
          ...sharedHeaders,
          { key: "Content-Security-Policy", value: appCsp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/api/messages/:id/:rest*",
        headers: sharedHeaders,
      },
    ];
  },
};

export default nextConfig;
