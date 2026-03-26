import { polar } from "@/lib/polar";
import { createClient } from "@/lib/supabase/server";
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

  const checkout = await polar.checkouts.create({
    products: [planConfig.productId],
    successUrl: `${request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL}/chat?checkout=success`,
    customerEmail: user.email!,
    metadata: { user_id: user.id },
  });

  return Response.json({ url: checkout.url });
}
