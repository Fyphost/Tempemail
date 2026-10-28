import { ImageResponse } from "next/og";

import { site } from "@/lib/site";

export const alt = `${site.name} — Free temporary email address`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px",
        background: "linear-gradient(180deg, #ffffff 0%, #eff6ff 100%)",
        color: "#0f172a",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "18px",
            background: "#2563eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            fontSize: "34px",
            fontWeight: 700,
          }}
        >
          @
        </div>
        <div style={{ fontSize: "36px", fontWeight: 700 }}>{site.name}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ fontSize: "76px", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-2px" }}>
          Your Inbox. Your Privacy.
        </div>
        <div
          style={{
            fontSize: "76px",
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-2px",
            color: "#2563eb",
          }}
        >
          Zero Hassle.
        </div>
      </div>
      <div style={{ display: "flex", gap: "16px", fontSize: "26px", color: "#64748b" }}>
        Disposable addresses · Real-time inbox · Automatic deletion
      </div>
    </div>,
    size,
  );
}
