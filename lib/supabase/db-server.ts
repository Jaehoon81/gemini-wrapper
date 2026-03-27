import "server-only";
import { supabaseAdmin } from "./admin";
import { encrypt, hashForLookup, tryDecrypt } from "@/lib/encryption";

// ===== 프로필 (암호화) =====

/** 프로필 저장 (암호화 후 upsert) */
export async function upsertProfile(
  userId: string,
  email: string | null,
  fullName: string | null
): Promise<void> {
  const updateData: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };

  if (email) {
    updateData.email = encrypt(email);
    updateData.email_hash = hashForLookup(email.toLowerCase());
  }
  if (fullName) {
    updateData.full_name = encrypt(fullName);
    updateData.full_name_hash = hashForLookup(fullName.toLowerCase());
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update(updateData)
    .eq("id", userId);

  if (error) throw error;
}

/** 프로필 조회 (복호화 포함) */
export async function getProfile(
  userId: string
): Promise<{ email: string | null; fullName: string | null } | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .single();

  if (error?.code === "PGRST116") return null;
  if (error) throw error;

  return {
    email: data.email ? tryDecrypt(data.email) : null,
    fullName: data.full_name ? tryDecrypt(data.full_name) : null,
  };
}

/** 이메일 해시로 프로필 검색 */
export async function findProfileByEmail(
  email: string
): Promise<string | null> {
  const hash = hashForLookup(email.toLowerCase());
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email_hash", hash)
    .single();

  if (error?.code === "PGRST116") return null;
  if (error) throw error;
  return data.id;
}

/** 활동 로그 기록 (IP 암호화) */
export async function logActivity(
  userId: string,
  action: string,
  ipAddress?: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("user_activity_logs")
    .insert({
      user_id: userId,
      action,
      ip_address: ipAddress ? encrypt(ipAddress) : null,
      metadata: metadata || {},
    });

  if (error) throw error;
}

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
