import DashboardClient from "./dashboard-client";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ task?: string | string[]; track?: string | string[] }>;
}) {
  const params = await searchParams;
  const task = params.task;
  const taskLink = typeof task === "string" && /^[A-Za-z0-9_+-]{1,128}$/.test(task);
  const track2Link = !taskLink && params.track === "T2";
  return <DashboardClient initialPage={taskLink ? "Datasets" : track2Link ? "Leaderboards" : "Overview"} initialTrack={track2Link ? "T2" : "T1"}/>;
}
