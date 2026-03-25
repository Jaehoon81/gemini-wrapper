"use client";

import { useState, useCallback, useRef } from "react";
import { useAuth } from "../components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Sidebar from "./components/Sidebar";
import ChatMessages from "./components/ChatMessages";
import ChatInput from "./components/ChatInput";

// ===== TYPES =====

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  date: string;
  messages: Message[];
}

// ===== PAGE =====

export default function ChatPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [remainingCount, setRemainingCount] = useState(50);
  const [showLimitModal, setShowLimitModal] = useState(false);

  // stale closure 방지용 ref
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const messages = activeConv?.messages ?? [];

  // 새 대화 생성
  const handleNewChat = useCallback(() => {
    const id = crypto.randomUUID();
    setConversations((prev) => [
      { id, title: "새 대화", date: "방금", messages: [] },
      ...prev,
    ]);
    setActiveConvId(id);
  }, []);

  // 메시지 전송 + Gemini 스트리밍 응답
  const handleSend = useCallback(
    async (content: string) => {
      // 잔여 횟수 체크
      if (remainingCount <= 0) {
        setShowLimitModal(true);
        return;
      }

      let convId = activeConvId;

      // 활성 대화가 없으면 자동 생성
      if (!convId) {
        convId = crypto.randomUUID();
        const title =
          content.length > 20 ? content.slice(0, 20) + "..." : content;
        setConversations((prev) => [
          { id: convId!, title, date: "방금", messages: [] },
          ...prev,
        ]);
        setActiveConvId(convId);
      }

      const userMsg: Message = { role: "user", content };
      const assistantMsg: Message = { role: "assistant", content: "" };

      // 현재 대화의 기존 메시지를 ref에서 읽어서 API 전송용으로 준비
      const currentConv = conversationsRef.current.find(
        (c) => c.id === convId
      );
      const allMessages = [...(currentConv?.messages ?? []), userMsg];

      // UI에 사용자 메시지 + 빈 assistant 메시지 추가
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== convId) return c;
          return {
            ...c,
            title:
              c.messages.length === 0
                ? content.length > 20
                  ? content.slice(0, 20) + "..."
                  : content
                : c.title,
            messages: [...c.messages, userMsg, assistantMsg],
          };
        })
      );

      setIsStreaming(true);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: allMessages }),
        });

        if (!response.ok || !response.body) {
          throw new Error("API 응답 오류");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });

          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== convId) return c;
              const msgs = [...c.messages];
              const last = msgs[msgs.length - 1];
              if (last?.role === "assistant") {
                msgs[msgs.length - 1] = {
                  ...last,
                  content: last.content + text,
                };
              }
              return { ...c, messages: msgs };
            })
          );
        }

        // 응답 성공 시 1회 차감
        setRemainingCount((prev) => Math.max(0, prev - 1));
      } catch (error) {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            const msgs = [...c.messages];
            const last = msgs[msgs.length - 1];
            if (last?.role === "assistant") {
              msgs[msgs.length - 1] = {
                ...last,
                content:
                  last.content || "응답을 가져오지 못했습니다. 다시 시도해주세요.",
              };
            }
            return { ...c, messages: msgs };
          })
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [activeConvId, remainingCount]
  );

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
      <header className="flex items-center justify-between border-b border-[#3f3f46] px-6 py-3">
        <span className="text-sm tracking-[0.06em] uppercase text-[#a1a1aa]">
          Gemini Wrapper
        </span>
        <div className="flex items-center gap-4">
          <span className="text-xs text-[#a1a1aa] border border-[#27272a] rounded-md px-2.5 py-1">
            {remainingCount}회 남음
          </span>
          <span className="text-sm text-[#a1a1aa]">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-[#27272a] bg-[#111] px-4 py-1.5 text-xs font-medium transition-colors hover:bg-[#1a1a1a] cursor-pointer"
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* 사용 횟수 초과 팝업 */}
      {showLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[#1e1f20] border border-[#3f3f46] p-6 text-center shadow-xl">
            <div className="text-3xl mb-3">⚡</div>
            <h3 className="text-lg font-semibold text-[#fafafa] mb-2">
              사용 횟수를 모두 소진했습니다
            </h3>
            <p className="text-sm text-[#a1a1aa] mb-5 leading-relaxed">
              무료 사용 횟수가 모두 소진되었습니다.<br />
              비용 등급을 조정해보세요.
            </p>
            <button
              onClick={() => setShowLimitModal(false)}
              className="rounded-lg bg-[#fafafa] px-6 py-2 text-sm font-medium text-[#0a0a0a] transition-colors hover:bg-[#e4e4e7] cursor-pointer"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* 본문: 사이드바 + 메인 */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          conversations={conversations}
          activeId={activeConvId}
          onSelect={setActiveConvId}
          onNewChat={handleNewChat}
        />
        <main className="flex flex-1 flex-col overflow-hidden">
          <ChatMessages messages={messages} isStreaming={isStreaming} />
          <ChatInput
            onSubmit={handleSend}
            disabled={isStreaming}
            placeholder="메시지를 입력하세요..."
          />
        </main>
      </div>
    </div>
  );
}
