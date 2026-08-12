import type { Metadata } from "next";
import "./globals.css";
import { Roboto_Condensed, IBM_Plex_Sans, Martian_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

const display = Roboto_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-roboto-condensed",
});
const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-sans",
});
const mono = Martian_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-martian-mono",
});

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Modular",
  description: "Edit your resumes with ease",
  openGraph: {
    title: "Modular",
    description: "Edit your resumes with ease",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Modular",
    description: "Edit your resumes with ease",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased",
        "font-sans",
        display.variable,
        body.variable,
        mono.variable
      )}
    >
      <body className="flex h-dvh flex-col overflow-hidden">{children}</body>
    </html>
  );
}
