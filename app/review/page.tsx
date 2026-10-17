import Link from "next/link";
import { ReviewCandidateBoard } from "../components/review-candidate-board";
export default function ReviewPage() {
  return <main className="content reviewPage">
    <Link href="/">← 返回 RoboExam</Link>
    <ReviewCandidateBoard />
  </main>;
}
