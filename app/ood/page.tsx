import DashboardClient from "../dashboard-client";
import { redirect } from "next/navigation";

export const dynamic = "force-static";

export default function Page() {
  if (process.env.GITHUB_PAGES !== "true") redirect("/");
  return <DashboardClient initialPage="Leaderboards" />;
}
