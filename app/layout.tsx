import type { Metadata } from "next";
import "./globals.css";
import "./worldsync.css";
import "./public-home.css";

export const metadata: Metadata = {
  title: "EmbodiVSI 2027 — Verifiable Self-Improvement for Physical Intelligence",
  description: "EmbodiVSI connects an open research program with RoboExam: an X-Humanoid-aligned, four-track benchmark for cross-embodiment reasoning, world models, and verified sim-to-real deployment.",
  icons: {
    icon: "/workshop-assets/embodivsi-mark.webp",
    shortcut: "/workshop-assets/embodivsi-mark.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased"
      >
        {children}
      </body>
    </html>
  );
}
