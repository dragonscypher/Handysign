import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import E2EHarness from "@/components/E2EHarness";
import MinimalTopBar from "@/components/MinimalTopBar";
import "./globals.css";

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SignRepair",
  description:
    "Privacy-first sign evidence and repair prototype with honest uncertainty, on-device landmarks, and local repair memory.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>
        <div className="site-shell">
          <MinimalTopBar />
          {process.env.NEXT_PUBLIC_SIGNREPAIR_E2E === "1" ? <E2EHarness /> : null}
          <main className="site-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
