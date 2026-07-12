import { redirect } from "next/navigation";

/**
 * Stage Templates is retired — case stages and their weightage are now defined
 * in Settings → Payout Rules (the single source of truth). Plans build their
 * stages from the matching payout scheme, so the stages a doctor/counter
 * completes carry the correct weightage. This route redirects old bookmarks.
 */
export default function StageTemplatesPage() {
  redirect("/config/payout-rules");
}
