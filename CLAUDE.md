# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # 개발 서버 (Next.js 16)
npm run build        # 프로덕션 빌드
npm run lint         # ESLint
npm run generate-keys    # AES/HMAC 키 생성 (scripts/generate-keys.ts)
npm run migrate-encrypt  # 기존 데이터 암호화 마이그레이션 (scripts/migrate-encrypt.ts)
```

## Architecture

Next.js 16 + React 19 SaaS 앱. Google Gemini API를 래핑하여 인증, 구독 관리, 대화 기록을 제공한다.

### Tech Stack
- **AI**: `@google/genai` (gemini-2.5-flash), 스트리밍 응답
- **Auth & DB**: Supabase (OAuth, RLS, RPC)
- **Billing**: Polar SDK (webhook 기반 구독 관리)
- **Encryption**: AES-256-GCM 앱 레벨 암호화 (이메일, 이름, IP)

### Key Flows

1. **인증**: OAuth → `app/auth/callback/route.ts` → 암호화된 프로필 upsert → `/chat` 리다이렉트
2. **채팅**: `POST /api/chat` → 인증 확인 → 사용량 체크 → Gemini 스트리밍 → 사용량 증가 (RPC)
3. **구독**: Polar 결제 → `POST /api/webhooks/polar` → 서명 검증 → DB 구독 업데이트
4. **플랜**: free(10/월), pro(100/월), unlimited(무제한) — `lib/plans.ts`

### Supabase Client 3종

| 클라이언트 | 파일 | RLS | 용도 |
|---|---|---|---|
| Browser | `lib/supabase/client.ts` | O | 클라이언트 컴포넌트 (대화 목록, 메시지) |
| Server | `lib/supabase/server.ts` | O | Route Handler (쿠키 세션) |
| Admin | `lib/supabase/admin.ts` | X | Webhook, 서버 전용 작업 |

### DB Functions

- **클라이언트 DB** (`lib/supabase/db.ts`): 대화/메시지 CRUD (soft delete)
- **서버 DB** (`lib/supabase/db-server.ts`): 프로필(암호화), 구독, 사용량, 활동 로그

### Encryption (`lib/encryption-core.ts`)

- `encrypt()` / `decrypt()`: AES-256-GCM, 저장 형식 `iv:authTag:encryptedData` (hex)
- `hashForLookup()`: HMAC-SHA256로 암호화된 필드 검색용 인덱스 생성
- 환경변수: `ENCRYPTION_KEY` (AES), `HASH_KEY` (HMAC) — 각 64자 hex

### Context Providers

- `AuthProvider`: 인증 상태 (user, loading) — `supabase.auth.getUser()` + `onAuthStateChange`
- `SubscriptionProvider`: 구독/사용량 상태 — `/api/subscription` + `/api/usage` fetch

### Responsive Design

- **랜딩 페이지** (`app/page.tsx`): 인라인 `<style>`에 `@media (max-width: 640px)` 미디어 쿼리로 모바일 대응
- **채팅 페이지** (`app/chat/page.tsx`): 모바일에서 사이드바는 햄버거 버튼으로 슬라이드 오버레이 (`md:` 브레이크포인트 기준), 헤더 요소(브랜드명, 이메일) 모바일 숨김
- **채팅 사이드바** (`app/chat/components/Sidebar.tsx`): 모바일 전용 브랜드+이메일 영역 포함, 부모가 너비 제어
- **로그인/빌링/프라이싱**: Tailwind 반응형 유틸리티로 기본 대응 완료

### DB Tables (inferred)

conversations, messages, profiles (암호화), subscriptions, usage (월별 카운트), user_activity_logs (IP 암호화)
