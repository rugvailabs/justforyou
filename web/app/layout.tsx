import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "JustDial CA",
  description: "Describe a problem, get matched with a provider.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
