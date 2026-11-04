import type { Metadata } from "next";
import "./globals.css";
import "./worldsync.css";
import "./public-home.css";

export const metadata: Metadata = {
  title: "EmbodiVSI 2027 — Verifiable Self-Improvement for Physical Intelligence",
  description: "EmbodiVSI connects agentic evaluation and multi-agent co-evolution with RoboExam's shared task registry across VLM reasoning, physical foresight, simulation, and real-robot deployment.",
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
