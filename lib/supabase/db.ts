import { createClient } from "./client";
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

export interface DbUsage {
  id: string;
  user_id: string;
  month: string;
  count: number;
  updated_at: string;
}

export interface DbConversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  is_deleted: boolean;
}

export interface DbMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

// ===== 대화 =====

/** 유저의 대화 목록 조회 (삭제되지 않은 것만) */
export async function fetchConversations(userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, created_at")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as Pick<DbConversation, "id" | "title" | "created_at">[];
}

/** 새 대화 생성 */
export async function createConversation(
  id: string,
  userId: string,
  title: string
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("conversations")
    .insert({ id, user_id: userId, title });

  if (error) throw error;
}

/** 대화 제목 업데이트 */
export async function updateConversationTitle(id: string, title: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ title })
    .eq("id", id);

  if (error) throw error;
}

/** 대화 소프트 삭제 */
export async function deleteConversation(id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ is_deleted: true })
    .eq("id", id);

  if (error) throw error;
}

// ===== 메시지 =====

/** 특정 대화의 메시지 조회 */
export async function fetchMessages(conversationId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as Pick<DbMessage, "id" | "role" | "content" | "created_at">[];
}

/** 메시지 저장 */
export async function saveMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role, content });

  if (error) throw error;
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
  if (error?.code === "PGRST116") return 0; // 레코드 없으면 0
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
