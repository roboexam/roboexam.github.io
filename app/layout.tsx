import type { Metadata } from "next";
import "./globals.css";
import "./worldsync.css";
import "./public-home.css";

export const metadata: Metadata = {
  title: "RoboExam — Benchmarking Embodied Intelligence",
  description: "RoboExam evaluates embodied systems across reasoning, physical prediction, simulation, and real-world robot deployment, with task-level evidence for generalization, recovery, and verified improvement.",
  icons: {
    icon: "/roboexam-mark.png",
    shortcut: "/roboexam-mark.png",
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
