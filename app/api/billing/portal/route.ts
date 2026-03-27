import { createClient } from "@/lib/supabase/server";
import { getSubscription } from "@/lib/supabase/db-server";
import { polar } from "@/lib/polar";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "인증 필요" }, { status: 401 });
  }

  const sub = await getSubscription(user.id);

  if (!sub.polar_customer_id) {
    return Response.json({ error: "Polar 고객 정보 없음" }, { status: 400 });
  }

  const session = await polar.customerSessions.create({
    customerId: sub.polar_customer_id,
  });

  return Response.json({ url: session.customerPortalUrl });
}
