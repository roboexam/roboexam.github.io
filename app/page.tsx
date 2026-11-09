import DashboardClient from "./dashboard-client";

// Prerendered once for GitHub Pages; the dashboard reads ?track= and ?task= in the browser.
export const dynamic = "force-static";

export default function Page() {
  return <DashboardClient/>;
}
