import DashboardClient from "../dashboard-client";
import { SiteShell } from "../components/site-shell";

export const dynamic = "force-static";

export default function LeaderboardsPage() {
  return <SiteShell active="Leaderboards"><DashboardClient/></SiteShell>;
}
