/** Product identity. Change the name here to rebrand the whole site. */
export const site = {
  name: "Tempemail",
  tagline: "Disposable email, done properly.",
  description:
    "Create a temporary email address in seconds. Receive real emails instantly in your browser, keep your personal inbox private, and let everything delete itself automatically.",
} as const;

/** Public base URL (also used at build time for metadata and the sitemap). */
export function siteUrl(): string {
  const value = process.env.APP_URL ?? "http://localhost:3000";
  return value.replace(/\/+$/, "");
}

export const mainNav = [
  { href: "/", label: "Home" },
  { href: "/app", label: "Temporary Email" },
  { href: "/features", label: "Features" },
  { href: "/faq", label: "FAQ" },
  { href: "/api-docs", label: "API Documentation" },
] as const;

export const footerNav = {
  Product: [
    { href: "/app", label: "Temporary inbox" },
    { href: "/features", label: "Features" },
    { href: "/pricing", label: "Plans" },
    { href: "/faq", label: "FAQ" },
  ],
  Developers: [
    { href: "/api-docs", label: "API documentation" },
    { href: "/api-docs#authentication", label: "Authentication" },
    { href: "/api-docs#realtime", label: "Real-time events" },
    { href: "/api-docs#errors", label: "Errors & limits" },
  ],
  Company: [
    { href: "/contact", label: "Contact" },
    { href: "/privacy", label: "Privacy policy" },
    { href: "/terms", label: "Terms of service" },
    { href: "/login", label: "Sign in" },
  ],
} as const;
