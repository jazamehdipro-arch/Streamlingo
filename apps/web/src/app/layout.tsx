import type { Metadata } from "next";
import AuthListener from "@/components/AuthListener";
import AppNav from "@/components/AppNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "StreamLingo — apprends une langue avec de vraies vidéos",
  description:
    "Transforme n'importe quelle vidéo YouTube ou podcast en session d'apprentissage de langue, sans casser l'immersion.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "StreamLingo", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/icon-180.png" },
};

export const viewport = {
  themeColor: "#101014",
  width: "device-width",
  initialScale: 1,
  // Lock zoom: in the installed (standalone) app iOS honours this, preventing
  // accidental pinch / double-tap zoom that left the fullscreen video looking
  // over-zoomed. Safari tabs ignore it, so browser users keep pinch-to-zoom.
  maximumScale: 1,
  userScalable: false,
  // Extend under the notch / home indicator so the installed app renders truly
  // edge-to-edge, including the "Grand écran" video mode.
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        <AuthListener />
        <AppNav />
        {children}
      </body>
    </html>
  );
}
