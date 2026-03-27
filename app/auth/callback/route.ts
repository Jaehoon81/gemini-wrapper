import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { upsertProfile, logActivity } from "@/lib/supabase/db-server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/chat";

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // 암호화된 프로필 저장
      await upsertProfile(
        data.user.id,
        data.user.email ?? null,
        data.user.user_metadata?.full_name ?? null
      );

      // 로그인 활동 로그 (IP 암호화)
      await logActivity(
        data.user.id,
        "login",
        request.headers.get("x-forwarded-for")
      );

      return NextResponse.redirect(`${origin}${next}`);
    }
    // 디버그: 에러 내용을 URL에 포함
    const msg = error?.message ?? "unknown_error";
    console.error("[Auth Callback] exchangeCodeForSession 실패:", msg);
    return NextResponse.redirect(
      `${origin}/login?error=auth&message=${encodeURIComponent(msg)}`
    );
  }

  console.error("[Auth Callback] code 파라미터 없음");
  return NextResponse.redirect(`${origin}/login?error=auth&message=no_code`);
}
