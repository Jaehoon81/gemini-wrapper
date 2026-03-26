import { createClient } from "./client";

// ===== TYPES =====

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
