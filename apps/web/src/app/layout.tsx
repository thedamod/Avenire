import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import "./globals.css";

export const metadata: Metadata = {
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
    images: ["/branding/avenire-logo-full.png"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/branding/avenire-logo-full.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#94acd1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className="light" lang="en">
      <body className={"font-sans antialiased"}>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
