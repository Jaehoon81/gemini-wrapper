import { createClient } from "@/lib/supabase/server";
import { getSubscription } from "@/lib/supabase/db";
import { polar } from "@/lib/polar";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "인증 필요" }, { status: 401 });
  }

  const sub = await getSubscription(user.id);

  if (!sub.polar_subscription_id) {
    return Response.json({ error: "취소할 구독 없음" }, { status: 400 });
  }

  // Polar SDK: revoke()로 구독 취소 (cancel 메서드 없음)
  await polar.subscriptions.revoke({ id: sub.polar_subscription_id });

  return Response.json({ success: true });
}
