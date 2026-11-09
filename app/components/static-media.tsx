import { VideoOff } from "lucide-react";

/** Stands in for a clip the static site's curated sample leaves out. */
export function MediaUnavailable({ label = "This clip is not part of the online sample." }: { label?: string }) {
  return <div className="staticMediaMissing" role="note"><VideoOff size={20} aria-hidden="true"/><span>{label}</span></div>;
}
