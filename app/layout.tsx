import type { Metadata } from "next";
import "./globals.css";
import "./worldsync.css";
import "./public-home.css";

export const metadata: Metadata = {
  title: "EmbodiVSI 2027 — Verifiable Self-Improvement for Physical Intelligence",
  description: "EmbodiVSI is a 2027 workshop initiative on how evaluators and embodied agents improve together, combining an open research program with the four-track RoboExam challenge.",
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
