import type { Metadata } from "next";
import "./globals.css";
import "./overview.css";
import "./explainability.css";
import "./track-correlation.css";
import "./pearson-matrix.css";
import "./leaderboard.css";
import "./dataset-explorer.css";
import "./review-candidates.css";
import "./raw-review.css";
import "./real-datasets.css";
import "./progress.css";
import "./metric-detail.css";
import "./l1-minimal.css";
import "./l1-results.css";
import "./l1-metric-explainers.css";
import "./l1-candidate-audit.css";
import "./worldsync.css";
import "./baseline-plan.css";
import "./dataset-archive.css";
import "./t1-results.css";
import "./t1-benchmark.css";
import "./dataset-hub.css";

export const metadata: Metadata = {
  title: "RoboExam · Planned CVPR 2027 Workshop",
  description: "A comprehensive benchmark of Physical AI capabilities across embodied reasoning, world prediction, simulated control, and real-robot deployment.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
