import { redirect } from "next/navigation";

import { landingRoute } from "@/lib/navigation";
import { getSession } from "@/server/auth/session";

export default async function RootPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  redirect(landingRoute(user.permissions));
}
