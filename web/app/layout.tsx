/**
 * Root layout: fonts and the page ground.
 *
 * Inter through next/font, which self-hosts the file and emits it as a CSS
 * variable - no network request to Google on first paint, and no layout shift
 * when it lands. tailwind.config.ts reads that variable, so `font-sans` is
 * Inter everywhere without a single component naming the typeface.
 */

import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "justforyou",
  description: "Find local businesses across Canada.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="en-CA" className={inter.variable}>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
