import DashboardClient from "./dashboard-client";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ task?: string | string[] }>;
}) {
  const task = (await searchParams).task;
  const taskLink = typeof task === "string" && /^[A-Za-z0-9_+-]{1,128}$/.test(task);
  return <DashboardClient initialPage={taskLink ? "Datasets" : "Overview"}/>;
}
