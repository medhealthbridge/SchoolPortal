import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: "SchoolPortal",
  description:
    "Attendance a teacher can take walking the room with no signal, and the modules a school switches on as it needs them.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#FAFAFA",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
