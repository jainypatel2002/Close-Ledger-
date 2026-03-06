import { redirect } from "next/navigation";

export default async function LegacyAnalyticsRedirectPage() {
  redirect("/reports/monthly" as never);
}
