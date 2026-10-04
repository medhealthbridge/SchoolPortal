import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

/**
 * One family across its whole width axis: expanded for headlines, normal for
 * text, condensed for the column heads of a form. A record book sets its
 * labels narrow so they fit the column, and so do we.
 */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "SchoolPortal",
  description:
    "The class record, kept for the whole school. Attendance that works without signal, and the modules a school switches on as it needs them.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#2F557F",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
