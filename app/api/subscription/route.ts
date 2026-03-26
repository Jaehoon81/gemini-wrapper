import { createClient } from "@/lib/supabase/server";
import { getSubscription } from "@/lib/supabase/db-server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "인증 필요" }, { status: 401 });
  }

  const sub = await getSubscription(user.id);

  return Response.json({
    plan: sub.plan,
    status: sub.status,
    currentPeriodEnd: sub.current_period_end,
    polarCustomerId: sub.polar_customer_id,
  });
}
