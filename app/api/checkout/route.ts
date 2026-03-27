import { polar } from "@/lib/polar";
import { createClient } from "@/lib/supabase/server";
import { getSubscription } from "@/lib/supabase/db-server";
import { PLANS, type PlanType } from "@/lib/plans";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "인증 필요" }, { status: 401 });
  }

  const { plan } = (await request.json()) as { plan: PlanType };

  const planConfig = PLANS[plan];
  if (!planConfig || !planConfig.productId) {
    return Response.json({ error: "유효하지 않은 플랜" }, { status: 400 });
  }

  const sub = await getSubscription(user.id);

  // 이미 유료 구독 중이면 → Polar API로 플랜 변경 (Checkout 불필요)
  if (sub.polar_subscription_id && sub.plan !== "free") {
    try {
      await polar.subscriptions.update({
        id: sub.polar_subscription_id,
        subscriptionUpdate: {
          productId: planConfig.productId,
        },
      });
      return Response.json({ updated: true });
    } catch (error) {
      console.error("[Checkout] 구독 업데이트 실패:", error);
      return Response.json(
        { error: "플랜 변경에 실패했습니다." },
        { status: 500 }
      );
    }
  }

  // 신규 결제 → Polar Checkout
  const checkout = await polar.checkouts.create({
    products: [planConfig.productId],
    successUrl: `${request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL}/chat?checkout=success`,
    customerEmail: user.email!,
    metadata: { user_id: user.id },
  });

  return Response.json({ url: checkout.url });
}
