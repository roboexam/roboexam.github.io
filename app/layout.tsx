import type { Metadata } from "next";
import "./globals.css";
import "./worldsync.css";
import "./public-home.css";

export const metadata: Metadata = {
  title: "RoboExam · Physical AI Benchmark",
  description: "Evaluate embodied reasoning, physical foresight, simulated control, and real-world robot deployment with task-level evidence.",
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
