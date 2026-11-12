import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { MotionProvider } from "@/components/ui/motion-provider";

const geistSans = localFont({
  src: "./fonts/geist.ttf",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/geist-mono.ttf",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
  preload: false,
});

const bricolage = localFont({
  src: "./fonts/bricolage-grotesque.ttf",
  variable: "--font-bricolage",
  weight: "600 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "quizza - play live quizzes, together",
  description:
    "An open-source, no-login-needed live quiz platform. Make it, share a code, let the room play. A FOSS Mentimeter alternative.",
  applicationName: "quizza",
  keywords: [
    "quiz",
    "live polls",
    "mentimeter alternative",
    "foss",
    "open source",
  ],
};

export const viewport: Viewport = {
  themeColor: "#7c5cff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
