import "server-only";
import { supabaseAdmin } from "./admin";

// ===== TYPES =====

export interface DbSubscription {
  id: string;
  user_id: string;
  polar_subscription_id: string | null;
  polar_customer_id: string | null;
  plan: "free" | "pro" | "unlimited";
  status: "active" | "canceled" | "expired";
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

// ===== 구독 =====

/** 유저 구독 조회 (없으면 free 자동 생성) */
export async function getSubscription(
  userId: string
): Promise<DbSubscription> {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (data) return data as DbSubscription;

  // 레코드 없으면 free 자동 생성 (기존 유저 폴백)
  if (error?.code === "PGRST116") {
    const { data: created, error: insertError } = await supabaseAdmin
      .from("subscriptions")
      .insert({ user_id: userId, plan: "free", status: "active" })
      .select()
      .single();

    if (insertError) throw insertError;
    return created as DbSubscription;
  }

  throw error;
}

// ===== 사용량 =====

/** 이번 달 사용량 조회 */
export async function getUsage(
  userId: string,
  month: string
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("usage")
    .select("count")
    .eq("user_id", userId)
    .eq("month", month)
    .single();

  if (data) return data.count;
  if (error?.code === "PGRST116") return 0;
  throw error;
}

/** 사용량 +1 (atomic upsert via RPC) */
export async function incrementUsage(
  userId: string,
  month: string
): Promise<void> {
  const { error } = await supabaseAdmin.rpc("increment_usage", {
    p_user_id: userId,
    p_month: month,
  });

  if (error) throw error;
}
