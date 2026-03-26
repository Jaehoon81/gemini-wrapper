import { createClient } from "@/lib/supabase/server";
import { getSubscription, getUsage } from "@/lib/supabase/db-server";
import { PLANS } from "@/lib/plans";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "인증 필요" }, { status: 401 });
  }

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const sub = await getSubscription(user.id);
  const count = await getUsage(user.id, month);
  const limit = PLANS[sub.plan].limit;

  return Response.json({ count, limit, plan: sub.plan });
}
