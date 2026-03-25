import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: Request) {
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

  const stream = await chat.sendMessageStream({ message: currentMessage });

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
