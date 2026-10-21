import "../raw-review.css";
import { RawReviewBoard } from "../components/raw-review-board";
export default function ReviewPage() {
  return <main className="content reviewPage">
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Current vinext client navigation fails; full document navigation is required. */}
    <a href="/">← 返回 RoboExam</a>
    <RawReviewBoard />
  </main>;
}
