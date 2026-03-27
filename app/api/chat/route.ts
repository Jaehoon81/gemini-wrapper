import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/lib/supabase/server";
import {
  getSubscription,
  getUsage,
  incrementUsage,
} from "@/lib/supabase/db-server";
import { PLANS } from "@/lib/plans";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: Request) {
  // 유저 인증 확인
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "인증 필요" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 사용량 체크
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const sub = await getSubscription(user.id);
  const plan = PLANS[sub.plan];

  if (sub.plan !== "unlimited") {
    const count = await getUsage(user.id, month);
    if (count >= plan.limit) {
      return new Response(
        JSON.stringify({
          error: "이번 달 사용 한도를 초과했습니다.",
          upgradeUrl: "/pricing",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  const { messages } = (await request.json()) as { messages: ChatMessage[] };

  // 히스토리와 현재 메시지 분리
  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const currentMessage = messages[messages.length - 1].content;

  const chat = ai.chats.create({
    model: "gemini-2.5-flash",
    history: history as never,
  });

  let stream;
  try {
    stream = await chat.sendMessageStream({ message: currentMessage });
  } catch (error: unknown) {
    const status = (error as { status?: number }).status ?? 500;
    const msg =
      status === 429
        ? "API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요."
        : "Gemini API 오류가 발생했습니다.";
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 사용량 증가 (스트리밍 시작 시점에 카운트)
  incrementUsage(user.id, month).catch((e) =>
    console.error("[Usage] 사용량 증가 실패:", e)
  );

  // ReadableStream으로 스트리밍 응답 반환
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk.text) {
            controller.enqueue(encoder.encode(chunk.text));
          }
        }
      } catch (error) {
        const errMsg =
          error instanceof Error ? error.message : "알 수 없는 오류";
        controller.enqueue(encoder.encode(`\n[오류: ${errMsg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
