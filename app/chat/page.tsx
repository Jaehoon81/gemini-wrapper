"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "../components/AuthProvider";
import { useSubscription } from "../components/SubscriptionProvider";
import { createClient } from "@/lib/supabase/client";
import {
  fetchConversations,
  fetchMessages,
  createConversation,
  saveMessage,
  deleteConversation,
} from "@/lib/supabase/db";
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
  const { plan, usage, refreshUsage } = useSubscription();
  const router = useRouter();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // stale closure 방지용 ref
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const messages = activeConv?.messages ?? [];

  // 사용량 계산
  const isUnlimited = plan === "unlimited";
  const remaining = isUnlimited ? Infinity : usage.limit - usage.count;
  const usagePercent = isUnlimited ? 0 : Math.round((usage.count / usage.limit) * 100);

  // 초기 대화 목록 로드
  useEffect(() => {
    if (!user) return;
    fetchConversations(user.id).then((data) => {
      setConversations(
        data.map((c) => ({
          id: c.id,
          title: c.title,
          date: new Date(c.created_at).toLocaleDateString("ko-KR"),
          messages: [],
        }))
      );
    });
  }, [user]);

  // 대화 선택 시 메시지 로드
  const handleSelect = useCallback(
    async (id: string) => {
      setActiveConvId(id);

      const conv = conversationsRef.current.find((c) => c.id === id);
      if (conv && conv.messages.length > 0) return;

      setLoadingMessages(true);
      try {
        const data = await fetchMessages(id);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  messages: data.map((m) => ({
                    role: m.role,
                    content: m.content,
                  })),
                }
              : c
          )
        );
      } finally {
        setLoadingMessages(false);
      }
    },
    []
  );

  // 새 대화 생성
  const handleNewChat = useCallback(() => {
    setActiveConvId(null);
  }, []);

  // 대화 삭제 확인 팝업 열기
  const handleDeleteRequest = useCallback((id: string) => {
    setDeleteTargetId(id);
  }, []);

  // 대화 삭제 확정 (소프트 삭제)
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTargetId) return;
    await deleteConversation(deleteTargetId);
    setConversations((prev) => prev.filter((c) => c.id !== deleteTargetId));
    if (activeConvId === deleteTargetId) setActiveConvId(null);
    setDeleteTargetId(null);
  }, [deleteTargetId, activeConvId]);

  // 메시지 전송 + Gemini 스트리밍 응답
  const handleSend = useCallback(
    async (content: string) => {
      // 잔여 횟수 체크
      if (!isUnlimited && remaining <= 0) {
        setShowLimitModal(true);
        return;
      }

      let convId = activeConvId;
      const title =
        content.length > 20 ? content.slice(0, 20) + "..." : content;

      const userMsg: Message = { role: "user", content };
      const assistantMsg: Message = { role: "assistant", content: "" };

      // 활성 대화가 없으면 DB에 새 대화 생성
      if (!convId) {
        convId = crypto.randomUUID();
        try {
          await createConversation(convId, user!.id, title);
        } catch (e) {
          console.error("[DB] 대화 생성 실패:", e);
        }
        setConversations((prev) => [
          { id: convId!, title, date: "방금", messages: [] },
          ...prev,
        ]);
        setActiveConvId(convId);
      }

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
              c.messages.length === 0 ? title : c.title,
            messages: [...c.messages, userMsg, assistantMsg],
          };
        })
      );

      setIsStreaming(true);

      // DB에 사용자 메시지 저장 (비동기, 스트리밍 차단하지 않음)
      saveMessage(convId, "user", content).catch((e) =>
        console.error("[DB] 사용자 메시지 저장 실패:", e)
      );

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: allMessages }),
        });

        if (!response.ok || !response.body) {
          let errMsg = "API 응답 오류";
          try {
            const body = await response.json();
            if (body.error) errMsg = body.error;
            // 한도 초과 시 모달 표시
            if (response.status === 429) {
              setShowLimitModal(true);
            }
          } catch {}
          throw new Error(errMsg);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          fullResponse += text;

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

        // 스트리밍 완료 후 assistant 메시지 DB 저장
        saveMessage(convId, "assistant", fullResponse).catch((e) =>
          console.error("[DB] assistant 메시지 저장 실패:", e)
        );

        // 사용량 클라이언트 갱신
        refreshUsage();
      } catch (error) {
        console.error("[Chat] 응답 오류:", error);
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            const msgs = [...c.messages];
            const last = msgs[msgs.length - 1];
            if (last?.role === "assistant") {
              msgs[msgs.length - 1] = {
                ...last,
                content:
                  last.content ||
                  (error instanceof Error ? error.message : "응답을 가져오지 못했습니다. 다시 시도해주세요."),
              };
            }
            return { ...c, messages: msgs };
          })
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [activeConvId, isUnlimited, remaining, user, refreshUsage]
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
          {/* 사용량 표시 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#a1a1aa] border border-[#27272a] rounded-md px-2.5 py-1">
              {isUnlimited
                ? "무제한"
                : `${usage.count}/${usage.limit}회 사용`}
            </span>
            {/* 프로그레스바 */}
            {!isUnlimited && (
              <div className="w-16 h-1.5 bg-[#27272a] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    usagePercent >= 100
                      ? "bg-red-500"
                      : usagePercent >= 80
                        ? "bg-yellow-500"
                        : "bg-white/40"
                  }`}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
            )}
          </div>
          <span className="text-sm text-[#a1a1aa]">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-[#27272a] bg-[#111] px-4 py-1.5 text-xs font-medium transition-colors hover:bg-[#1a1a1a] cursor-pointer"
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* 80% 경고 배너 */}
      {!isUnlimited && usagePercent >= 80 && usagePercent < 100 && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-6 py-2 text-center">
          <span className="text-xs text-yellow-400">
            이번 달 사용량의 {usagePercent}%를 사용했습니다.{" "}
            <a href="/pricing" className="underline hover:text-yellow-300">
              플랜 업그레이드
            </a>
          </span>
        </div>
      )}

      {/* 사용 횟수 초과 팝업 */}
      {showLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[#1e1f20] border border-[#3f3f46] p-6 text-center shadow-xl">
            <div className="text-3xl mb-3">⚡</div>
            <h3 className="text-lg font-semibold text-[#fafafa] mb-2">
              사용 횟수를 모두 소진했습니다
            </h3>
            <p className="text-sm text-[#a1a1aa] mb-5 leading-relaxed">
              이번 달 {plan === "free" ? "무료" : plan.toUpperCase()} 플랜의
              사용 횟수({usage.limit}회)를 모두 사용했습니다.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowLimitModal(false)}
                className="rounded-lg border border-[#3f3f46] px-6 py-2 text-sm font-medium text-[#a1a1aa] transition-colors hover:bg-[#27272a] cursor-pointer"
              >
                닫기
              </button>
              <a
                href="/pricing"
                className="rounded-lg bg-[#fafafa] px-6 py-2 text-sm font-medium text-[#0a0a0a] transition-colors hover:bg-[#e4e4e7]"
              >
                플랜 업그레이드
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 대화 삭제 확인 팝업 */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[#1e1f20] border border-[#3f3f46] p-6 text-center shadow-xl">
            <div className="text-3xl mb-3">🗑️</div>
            <h3 className="text-lg font-semibold text-[#fafafa] mb-2">
              대화를 삭제하시겠습니까?
            </h3>
            <p className="text-sm text-[#a1a1aa] mb-5 leading-relaxed">
              삭제된 대화는 목록에서 사라집니다.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setDeleteTargetId(null)}
                className="rounded-lg border border-[#3f3f46] px-6 py-2 text-sm font-medium text-[#a1a1aa] transition-colors hover:bg-[#27272a] cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="rounded-lg bg-[#fafafa] px-6 py-2 text-sm font-medium text-[#0a0a0a] transition-colors hover:bg-[#e4e4e7] cursor-pointer"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 본문: 사이드바 + 메인 */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          conversations={conversations}
          activeId={activeConvId}
          onSelect={handleSelect}
          onNewChat={handleNewChat}
          onDelete={handleDeleteRequest}
        />
        <main className="flex flex-1 flex-col overflow-hidden">
          <ChatMessages
            messages={messages}
            isStreaming={isStreaming}
            loading={loadingMessages}
          />
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
