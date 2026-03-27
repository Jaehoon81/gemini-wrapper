import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/chat";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    // 디버그: 에러 내용을 URL에 포함
    console.error("[Auth Callback] exchangeCodeForSession 실패:", error.message);
    return NextResponse.redirect(
      `${origin}/login?error=auth&message=${encodeURIComponent(error.message)}`
    );
  }

  console.error("[Auth Callback] code 파라미터 없음");
  return NextResponse.redirect(`${origin}/login?error=auth&message=no_code`);
}
