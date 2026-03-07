import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { metadataBase } from "@/lib/page-metadata";
import "./globals.css";

const fonde = localFont({
  src: "./fonde.ttf",
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase,
  title: "Avenire — Think. Not just answers. Reasoning.",
  description:
    "An interactive AI reasoning and research workspace. Break down complex ideas, learn interactively, and build genuine understanding.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/branding/avenire-logo-full.png",
  },
  openGraph: {
    images: ["/api/og?title=Avenire"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/api/og?title=Avenire"],
  },
};

export const viewport: Viewport = {
  themeColor: "#94acd1",
};

/**
 * Provides the application's root HTML layout, applying global font and theme settings and including service worker registration.
 *
 * @param children - Content to render inside the document body
 * @returns The top-level HTML element containing the application body and children
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className="light" lang="en">
      <body
        className={`${fonde.variable} font-sans antialiased`}
        style={{
          "--font-sans":
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        } as React.CSSProperties}
      >
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
