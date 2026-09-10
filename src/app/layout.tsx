import type { Metadata, Viewport } from "next";
import { Halant, Karla, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const halant = Halant({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-halant",
  display: "swap",
});
const karla = Karla({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-karla",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sabha",
  description: "Invitation only.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#F4F3EF",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${halant.variable} ${karla.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
