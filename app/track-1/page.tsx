import DashboardClient from '../dashboard-client';

export const dynamic = "force-static";

export default function Track1Page() {
  return <DashboardClient initialPage="Leaderboards" initialTrack="T1"/>;
}
