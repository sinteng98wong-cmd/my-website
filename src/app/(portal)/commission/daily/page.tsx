import { redirect } from "next/navigation";

/**
 * Daily Sign-off now lives inside Commission › Doctor Payout as the
 * day-view panel. This route remains only so old bookmarks keep working.
 */
export default function DailySignoffPage() {
  redirect("/commission?tab=locum");
}
