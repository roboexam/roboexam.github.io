import { PublicHome } from "./components/public-home";
import { SiteShell } from "./components/site-shell";

export const dynamic = "force-static";

export default function Page() {
  return <SiteShell active="Overview"><PublicHome/></SiteShell>;
}
