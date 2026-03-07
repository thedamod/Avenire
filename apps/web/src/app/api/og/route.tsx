import { ImageResponse } from "next/og";

export const runtime = "edge";

/**
 * Generate an Open Graph image using the request's `title` query parameter.
 *
 * The image renders a gradient background with a fixed "Avenire" label and a large title text.
 *
 * @param request - Incoming HTTP request; the `title` search parameter is read, trimmed, and truncated to 120 characters. If empty or absent, `"Avenire"` is used.
 * @returns An `ImageResponse` containing a 1200×630 image that displays the "Avenire" label and the resolved title.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawTitle = searchParams.get("title") ?? "Avenire";
  const title = rawTitle.trim().slice(0, 120) || "Avenire";

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "stretch",
          background:
            "linear-gradient(135deg, #f7f5f1 0%, #eef2fb 45%, #dbe8ff 100%)",
          color: "#1f2937",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
          padding: "64px",
          width: "100%",
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Avenire
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
            maxWidth: "92%",
            wordBreak: "break-word",
          }}
        >
          {title}
        </div>
      </div>
    ),
    {
      height: 630,
      width: 1200,
    },
  );
}
