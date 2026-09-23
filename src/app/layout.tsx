import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claude Video — Screen Recording zu KI-Voiceover",
  description:
    "Bildschirm aufnehmen, von der KI analysieren und automatisch mit einer ElevenLabs-Stimme vertonen lassen."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-bg">{children}</body>
    </html>
  );
}
