import DashboardClient from "../dashboard-client";

export const dynamic = "force-static";

export default function DatasetsPage() {
  return <DashboardClient initialPage="Datasets"/>;
}
