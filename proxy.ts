import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 세션 refresh (중요: getUser()를 호출해야 쿠키가 갱신됨)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Webhook은 인증 체크 제외 (Polar 서버에서 호출)
  if (request.nextUrl.pathname.startsWith("/api/webhooks/")) {
    return supabaseResponse;
  }

  // 미인증 사용자 → /login 리다이렉트
  const pathname = request.nextUrl.pathname;
  if (!user && (pathname.startsWith("/chat") || pathname.startsWith("/billing"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 인증된 사용자가 /login 접근 시 → /chat 리다이렉트
  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
