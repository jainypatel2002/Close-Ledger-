import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";

export default async function HomePage() {
  const context = await getSessionContext();
  if (!context) {
    redirect("/login");
  }
  redirect("/dashboard");
}
