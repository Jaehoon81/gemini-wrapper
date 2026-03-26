import { createClient } from "@supabase/supabase-js";

// Service Role 클라이언트 — RLS 우회 (webhook, 서버 API 전용)
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
