import type { Metadata } from "next";
import AuthListener from "@/components/AuthListener";
import "./globals.css";

export const metadata: Metadata = {
  title: "StreamLingo",
  description: "Turn podcasts into language-learning sessions without breaking immersion.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        <AuthListener />
        {children}
      </body>
    </html>
  );
}
