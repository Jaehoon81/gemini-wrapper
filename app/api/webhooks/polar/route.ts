import {
  validateEvent,
  WebhookVerificationError,
} from "@polar-sh/sdk/webhooks";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PLANS, type PlanType } from "@/lib/plans";

// product_id로 플랜 판별
function getPlanByProductId(productId: string): PlanType {
  for (const [key, plan] of Object.entries(PLANS)) {
    if (plan.productId === productId) return key as PlanType;
  }
  return "free";
}

export async function POST(request: Request) {
  const body = await request.text();
  const headers = Object.fromEntries(request.headers);

  let event;
  try {
    event = validateEvent(body, headers, process.env.POLAR_WEBHOOK_SECRET!);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return new Response("서명 검증 실패", { status: 403 });
    }
    throw error;
  }

  switch (event.type) {
    // 결제 완료 → 구독 생성/갱신
    case "order.paid": {
      const order = event.data;
      const userId = (order.metadata as Record<string, string>)?.user_id;
      if (!userId) break;

      const productId = order.productId;
      const plan = productId ? getPlanByProductId(productId) : "free";
      const subscription = order.subscription;

      await supabaseAdmin.from("subscriptions").upsert(
        {
          user_id: userId,
          polar_subscription_id: subscription?.id || null,
          polar_customer_id: order.customerId || null,
          plan,
          status: "active",
          current_period_end: subscription?.currentPeriodEnd || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      break;
    }

    // 구독 활성화
    case "subscription.active": {
      const sub = event.data;
      await supabaseAdmin
        .from("subscriptions")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("polar_subscription_id", sub.id);
      break;
    }

    // 구독 업데이트 (플랜 변경 등)
    case "subscription.updated": {
      const sub = event.data;
      const plan = getPlanByProductId(sub.productId);
      await supabaseAdmin
        .from("subscriptions")
        .update({
          plan,
          current_period_end: sub.currentPeriodEnd || null,
          updated_at: new Date().toISOString(),
        })
        .eq("polar_subscription_id", sub.id);
      break;
    }

    // 구독 취소 (기간 끝까지 유지)
    case "subscription.canceled": {
      const sub = event.data;
      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: "canceled",
          current_period_end: sub.currentPeriodEnd || null,
          updated_at: new Date().toISOString(),
        })
        .eq("polar_subscription_id", sub.id);
      break;
    }

    // 즉시 해지 → Free 전환
    case "subscription.revoked": {
      const sub = event.data;
      await supabaseAdmin
        .from("subscriptions")
        .update({
          plan: "free",
          status: "active",
          polar_subscription_id: null,
          current_period_end: null,
          updated_at: new Date().toISOString(),
        })
        .eq("polar_subscription_id", sub.id);
      break;
    }
  }

  return new Response("OK", { status: 200 });
}
