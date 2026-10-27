import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "StencilForge — 3D-printable spray stencils",
  description:
    "Turn vector text and shapes into 3D-printable stencils for spray painting, with smart bridges, floating islands and print-ready exports.",
};

export const viewport: Viewport = {
  themeColor: "#0a0b0d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
