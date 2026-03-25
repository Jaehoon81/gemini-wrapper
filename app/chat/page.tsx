"use client";

import { useAuth } from "../components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function ChatPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0a0a0a] text-[#a1a1aa]">
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0a0a0a] text-[#fafafa]">
      {/* 헤더 */}
      <header className="flex items-center justify-between border-b border-[#27272a] px-6 py-4">
        <span className="text-sm tracking-[0.06em] uppercase text-[#a1a1aa]">
          Gemini Wrapper
        </span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#a1a1aa]">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-[#27272a] bg-[#111] px-4 py-1.5 text-xs font-medium transition-colors hover:bg-[#1a1a1a] cursor-pointer"
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* 메인 영역 */}
      <main className="flex flex-1 items-center justify-center">
        <div className="text-center text-[#a1a1aa]">
          <p className="text-lg font-medium text-[#fafafa]">채팅 페이지</p>
          <p className="mt-2 text-sm">구현 예정</p>
        </div>
      </main>
    </div>
  );
}
