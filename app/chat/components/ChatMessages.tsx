"use client";

import { useEffect, useRef } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatMessagesProps {
  messages: Message[];
  isStreaming: boolean;
  loading?: boolean;
}

export default function ChatMessages({
  messages,
  isStreaming,
  loading,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // 메시지 로딩 중
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-[#a1a1aa] animate-pulse">메시지 불러오는 중...</p>
      </div>
    );
  }

  // 빈 상태
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-[#fafafa] mb-2">
            무엇을 도와드릴까요?
          </h2>
          <p className="text-sm text-[#a1a1aa]">
            메시지를 입력하면 Gemini가 응답합니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[90%] sm:max-w-[80%] rounded-2xl px-3 sm:px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-[#1a1a2e] text-[#fafafa]"
                  : "bg-[#111] text-[#e4e4e7]"
              }`}
            >
              {/* 스트리밍 중 빈 assistant 메시지면 "생각 중..." 표시 */}
              {isStreaming &&
              msg.role === "assistant" &&
              i === messages.length - 1 &&
              !msg.content ? (
                <span className="text-[#a1a1aa] animate-pulse">생각 중...</span>
              ) : (
                msg.content
              )}
              {/* 스트리밍 중 텍스트가 있으면 커서 표시 */}
              {isStreaming &&
                msg.role === "assistant" &&
                i === messages.length - 1 &&
                msg.content && (
                  <span className="inline-block w-1.5 h-4 bg-[#a1a1aa] ml-0.5 animate-pulse align-text-bottom" />
                )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
