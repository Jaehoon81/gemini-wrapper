# Polar 구독 서비스 구현 플랜

## Context

Gemini 래퍼 SaaS에 Polar 기반 3-tier 구독 시스템(Free/Pro/Unlimited)을 추가한다.
현재 `chat/page.tsx`의 `remainingCount`가 50으로 하드코딩되어 있으며, 이를 실제 구독 플랜 + 사용량 추적 시스템으로 교체한다.

**범위**: 결제(Polar Checkout + Webhook) → Vercel 배포 → 구독 설계(사용량 추적, UI) → 테스트
**제외**: 암호화(AES-256-GCM) — 추후 구현

---

## 플랜 구성

| | Free | Pro | Unlimited |
|---|---|---|---|
| 가격 | $0 | $9.99/월 | $29.99/월 |
| 월 호출 | 10회 | 100회 | 무제한 |
| 한도 초과 | 차단 (429) | 차단 (429) | — |

## 전체 데이터 흐름

```
유저 → Pricing 페이지 → 플랜 선택
  → POST /api/checkout (서버에서 Polar Checkout 세션 생성, metadata에 user_id 포함)
  → Polar Checkout 페이지로 리다이렉트
  → 결제 완료 → /chat?checkout=success로 리다이렉트

Polar 서버 → POST /api/webhooks/polar (webhook)
  → 서명 검증 (POLAR_WEBHOOK_SECRET)
  → metadata.user_id로 유저 매칭
  → Supabase subscriptions 테이블 upsert

유저 채팅 → POST /api/chat
  → 서버에서 subscriptions/usage 조회
  → 한도 체크 (unlimited 스킵)
  → 통과 시 usage count +1 → Gemini API 호출
  → 초과 시 429 + 업그레이드 URL 반환
```

---

## 구현 순서

### Phase A: 기반 코드 (로컬)

#### Step 1: 패키지 설치
```bash
npm install @polar-sh/sdk
```

#### Step 2: DB 스키마 확장
**파일**: `supabase/init.sql` (수정 — 하단에 추가)

```sql
-- 구독 테이블
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  polar_subscription_id TEXT,
  polar_customer_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'unlimited')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'expired')),
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 사용량 테이블
CREATE TABLE usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  month TEXT NOT NULL,  -- '2026-03' 형식
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, month)
);

-- RLS 정책
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;

-- 유저 본인 레코드만 읽기 가능 (쓰기는 service role에서)
CREATE POLICY "subscriptions_select_own" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "usage_select_own" ON usage
  FOR SELECT USING (auth.uid() = user_id);

-- 회원가입 시 Free 자동 부여 트리거
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

> **주의**: `polar_customer_id` 컬럼 추가 — Customer Portal 생성 시 필요.
> 기존 유저는 트리거 적용 안 됨 → 구독 조회 시 레코드 없으면 free 자동 생성 폴백.

#### Step 3: 라이브러리 코드

**`lib/polar.ts` (생성)** — Polar SDK 클라이언트
```typescript
import { Polar } from "@polar-sh/sdk";

export const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  server: "sandbox",
});
```

**`lib/plans.ts` (생성)** — 플랜 상수
```typescript
export const PLANS = {
  free:      { name: "Free",      price: 0,     limit: 10,       productId: null },
  pro:       { name: "Pro",       price: 9.99,  limit: 100,      productId: process.env.POLAR_PRO_PRODUCT_ID! },
  unlimited: { name: "Unlimited", price: 29.99, limit: Infinity, productId: process.env.POLAR_UNLIMITED_PRODUCT_ID! },
} as const;

export type PlanType = keyof typeof PLANS;
```

**`lib/supabase/admin.ts` (생성)** — Service Role 클라이언트 (webhook/서버 전용, RLS 우회)
```typescript
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

**`lib/supabase/db.ts` (수정)** — 구독/사용량 함수 추가
- `getSubscription(userId)` — subscriptions 조회 (없으면 service role로 free 레코드 자동 생성)
- `getUsage(userId, month)` — 이번 달 사용량 조회
- `incrementUsage(userId, month)` — `ON CONFLICT (user_id, month) DO UPDATE SET count = count + 1` upsert

### Phase B: Pricing + Checkout API (로컬)

#### Step 4: Checkout API
**`app/api/checkout/route.ts` (생성)** — POST

- 서버 Supabase로 유저 인증 확인
- body: `{ productId }`
- `polar.checkouts.create()` 호출:
  - `productId` 전달
  - `successUrl`: 배포 도메인 또는 현재 origin + `/chat?checkout=success`
  - `customerEmail`: 현재 유저 이메일
  - `metadata`: `{ user_id: user.id }` — **webhook에서 유저 매칭에 필수**
- Checkout URL 반환

> **Polar SDK 참고**: `polar.checkouts.create({ productPriceId?, productId?, successUrl, customerEmail, metadata })`

#### Step 5: Webhook API
**`app/api/webhooks/polar/route.ts` (생성)** — POST

**핵심: Raw Body 처리** (Next.js App Router)
```typescript
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";

export async function POST(request: Request) {
  const body = await request.text(); // raw body 필수!
  const headers = Object.fromEntries(request.headers);

  try {
    const event = validateEvent(body, headers, process.env.POLAR_WEBHOOK_SECRET!);
    // 이벤트 처리...
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return new Response("Invalid signature", { status: 403 });
    }
    throw error;
  }
}
```

**이벤트 핸들링** (supabaseAdmin 사용):

| 이벤트 | 처리 |
|---|---|
| `checkout.completed` | metadata.user_id로 유저 매칭 → subscriptions upsert (plan 판별: product_id 비교, status='active', polar_subscription_id, polar_customer_id, current_period_end) |
| `subscription.active` | status='active' 업데이트 |
| `subscription.updated` | product_id로 plan 변경 반영 |
| `subscription.canceled` | status='canceled', current_period_end 기록 (기간 끝까지 유지) |
| `subscription.revoked` | plan='free', status='active', polar_subscription_id=null (즉시 해지) |

> **canceled vs revoked 차이**:
> - canceled = 결제 기간 끝까지 기존 플랜 유지 후 만료
> - revoked = 즉시 해지, 바로 Free 전환

#### Step 6: 구독/사용량 조회 API

**`app/api/subscription/route.ts` (생성)** — GET
- 서버 Supabase로 유저 확인 → `getSubscription(userId)`
- `{ plan, status, currentPeriodEnd, polarCustomerId }` 반환

**`app/api/usage/route.ts` (생성)** — GET
- 현재 월(YYYY-MM) 사용량 + 플랜 한도 반환
- `{ count, limit, plan }`

**`app/api/subscription/cancel/route.ts` (생성)** — POST
- `polar.subscriptions.revoke({ id: polarSubscriptionId })` 호출
- (실제 DB 변경은 webhook에서 처리)

#### Step 7: Pricing 페이지
**`app/pricing/page.tsx` (생성)**

- 3개 플랜 카드: Free / Pro(추천 뱃지, 강조 border) / Unlimited
- 현재 플랜 → "현재 플랜" 뱃지
- 업그레이드 가능 플랜 → "업그레이드" 버튼
- 버튼 클릭 → `/api/checkout` POST → 반환된 Checkout URL로 리다이렉트
- 다크 테마 (#0a0a0a, #fafafa, #27272a), 기존 UI 스타일 유지
- 미로그인 시 "/login"으로 안내

### Phase C: Vercel 배포 (webhook 테스트를 위해 필수)

> **커밋/푸시는 유저가 직접 진행**

#### Step 8: Vercel 배포

1. [vercel.com](https://vercel.com) → GitHub 로그인 → "New Project" → 레포 Import
2. **환경변수 입력:**
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   GEMINI_API_KEY=...
   POLAR_ACCESS_TOKEN=...
   POLAR_PRO_PRODUCT_ID=...
   POLAR_UNLIMITED_PRODUCT_ID=...
   ```
   (`POLAR_WEBHOOK_SECRET`은 아직 안 넣음)
3. Deploy 클릭 → 배포 URL 확인

#### Step 9: 배포 후 필수 설정

- **Supabase**: Authentication → URL Configuration → 배포 도메인 추가
- **Google Cloud Console**: OAuth 승인된 리디렉션 URI에 배포 도메인 추가
- **Polar Dashboard**: Webhooks → 엔드포인트 등록
  - URL: `https://{배포도메인}/api/webhooks/polar`
  - 이벤트: checkout.completed, subscription.active, subscription.updated, subscription.canceled, subscription.revoked
  - → **Webhook Secret 발급** → `.env.local` + Vercel 환경변수에 추가
- **Vercel**: 환경변수에 `POLAR_WEBHOOK_SECRET` 추가 → 재배포

### Phase D: 구독 설계 (배포 후)

#### Step 10: 채팅 API에 사용량 체크 추가
**`app/api/chat/route.ts` (수정)**

- 서버 Supabase로 유저 인증 확인 (`createClient` from `lib/supabase/server.ts`)
- `getSubscription(userId)` → plan 조회
- `getUsage(userId, currentMonth)` → count 조회
- plan !== 'unlimited' && count >= limit → 429 반환: `{ error: "한도 초과", upgradeUrl: "/pricing" }`
- 통과 시 `incrementUsage(userId, currentMonth)` 후 기존 Gemini 스트리밍 실행

#### Step 11: SubscriptionProvider (Context)
**`app/components/SubscriptionProvider.tsx` (생성)**

- `AuthProvider.tsx`와 동일한 Context 패턴
- 로그인 상태에서 `/api/subscription` + `/api/usage` fetch
- 제공값: `{ plan, status, usage: { count, limit }, loading, refreshUsage() }`
- `refreshUsage()`: 채팅 성공 후 count를 클라이언트에서 +1

**`app/layout.tsx` (수정)** — `AuthProvider` 안에 `SubscriptionProvider` 추가

#### Step 12: 채팅 페이지 사용량 UI 연동
**`app/chat/page.tsx` (수정)**

- `remainingCount` 하드코딩(50) 제거 → `useSubscription()` Context 사용
- 헤더 "N회 남음" → `limit - count` 표시 (unlimited이면 "무제한")
- 프로그레스바 추가: "이번 달 7/10회 사용"
- 80% 도달 시 노란색 경고 배너
- 100% 도달 시 업그레이드 CTA 모달 (기존 `showLimitModal` 활용, `/pricing` 링크 추가)
- `handleSend` 성공 후 `refreshUsage()` 호출

#### Step 13: Billing 페이지 + 사이드바 메뉴
**`app/billing/page.tsx` (생성)**

- 현재 구독 플랜/상태/다음 결제일 표시
- Polar Customer Portal 링크 버튼 (`polar.customerSessions.create({ customerId })` → `customerPortalUrl`)
- "플랜 변경" → `/pricing` 이동
- 구독 취소 버튼 (canceled 상태면 "기간 끝까지 유지됨" 표시)

**`app/chat/components/Sidebar.tsx` (수정)**
- 하단에 Billing 메뉴 추가 (`lucide-react`의 `CreditCard` 아이콘)
- 클릭 시 `/billing`으로 이동

#### Step 14: 미들웨어 업데이트
**`proxy.ts` (수정)**

- `/billing` 경로도 인증 필요 (기존 `/chat` 체크에 추가)
- `/api/webhooks/polar`는 인증 체크 제외 (Polar 서버에서 호출하므로)
- `/pricing`은 미인증 허용

### Phase E: 테스트

> **커밋/푸시/재배포는 유저가 직접 진행**

#### Step 15: E2E 테스트 (배포 도메인에서)

| # | 케이스 | 확인 포인트 |
|---|--------|------------|
| 1 | 회원가입 → Free 자동 부여 | subscriptions에 plan='free' 레코드 생성 |
| 2 | Free 유저 채팅 10회 사용 | 프로그레스바 정확한 수치 (10/10) |
| 3 | 11회째 채팅 시도 | 429 에러 + 업그레이드 모달 표시 |
| 4 | Pricing → Pro 업그레이드 클릭 | Polar Checkout 리다이렉트 정상 동작 |
| 5 | Sandbox 카드로 결제 완료 | webhook → subscriptions plan='pro' 확인 |
| 6 | Pro 전환 후 사용량 리셋 확인 | 프로그레스바 0/100회 |
| 7 | 80% 도달 (80/100회) | 경고 배너 표시 |
| 8 | Billing 페이지 | 현재 플랜/상태/결제일 정상 표시 |
| 9 | 구독 취소 | canceled 상태, "기간 끝까지 유지" 표시 |

---

## 환경변수 전체 목록

```bash
# 기존
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...

# 이미 설정됨
POLAR_PRO_PRODUCT_ID=<your-pro-product-id>
POLAR_UNLIMITED_PRODUCT_ID=<your-unlimited-product-id>
POLAR_ACCESS_TOKEN=<your-polar-access-token>

# 추가 필요 (Polar 대시보드에서 webhook 등록 후)
POLAR_WEBHOOK_SECRET=...
```

---

## 파일 변경 목록

| 파일 | 작업 | Phase |
|------|------|-------|
| `supabase/init.sql` | 수정 — subscriptions, usage 테이블 + 트리거 | A |
| `lib/polar.ts` | 생성 — Polar SDK 클라이언트 | A |
| `lib/plans.ts` | 생성 — 플랜 상수 | A |
| `lib/supabase/admin.ts` | 생성 — Service Role 클라이언트 | A |
| `lib/supabase/db.ts` | 수정 — 구독/사용량 DB 함수 추가 | A |
| `app/api/checkout/route.ts` | 생성 — Polar Checkout 세션 | B |
| `app/api/webhooks/polar/route.ts` | 생성 — Webhook 수신/처리 | B |
| `app/api/subscription/route.ts` | 생성 — 구독 조회 | B |
| `app/api/subscription/cancel/route.ts` | 생성 — 구독 취소 | B |
| `app/api/usage/route.ts` | 생성 — 사용량 조회 | B |
| `app/pricing/page.tsx` | 생성 — Pricing UI | B |
| `app/api/chat/route.ts` | 수정 — 사용량 체크 추가 | D |
| `app/components/SubscriptionProvider.tsx` | 생성 — 구독 Context | D |
| `app/layout.tsx` | 수정 — SubscriptionProvider 추가 | D |
| `app/chat/page.tsx` | 수정 — 실제 사용량 UI 연동 | D |
| `app/billing/page.tsx` | 생성 — Billing 페이지 | D |
| `app/chat/components/Sidebar.tsx` | 수정 — Billing 메뉴 추가 | D |
| `proxy.ts` | 수정 — /billing 인증, webhook 제외 | D |

---

## 독자 검토: 보강 사항

Notion 가이드 대비 아래 항목을 보강했다:

### 1. Polar Customer ID 저장
Notion 가이드에는 없지만, **Customer Portal 생성에 `polar_customer_id`가 필수**. `subscriptions` 테이블에 `polar_customer_id` 컬럼을 추가하고, `checkout.completed` webhook에서 저장한다.

### 2. Webhook Raw Body 처리
Next.js App Router에서 webhook 서명 검증 시 **반드시 `request.text()`로 raw body를 읽어야** 한다. `request.json()`을 먼저 호출하면 서명 검증이 실패한다.

### 3. metadata를 통한 유저 매칭
Checkout 생성 시 `metadata: { user_id }` 를 전달하고, `checkout.completed` webhook에서 이 값으로 우리 DB 유저와 매칭한다. 이것이 없으면 이메일 기반 매칭만 가능하여 불안정하다.

### 4. 기존 유저 Free 플랜 폴백
트리거는 신규 가입자에만 동작하므로, `getSubscription()` 함수에서 레코드가 없으면 service role로 free 레코드를 자동 생성하는 폴백 로직을 추가한다.

### 5. canceled 구독 만료 처리
`subscription.canceled` 시 `current_period_end`를 기록하지만, 실제 만료 시점에 free로 전환하는 로직이 필요하다. Cron job 없이 **구독 조회 시 `current_period_end < now()` && `status === 'canceled'`이면 free로 전환**하는 방식으로 처리한다.

### 6. Polar SDK 서버 설정
Sandbox 환경에서 개발하므로 `server: "sandbox"` 설정이 필수. 프로덕션 전환 시 이 값을 변경하거나 환경변수화해야 한다.

### 7. RLS 정책 분리
`subscriptions`와 `usage` 테이블은 SELECT만 유저에게 허용하고, INSERT/UPDATE는 service role(webhook, 서버 API)에서만 수행한다. Notion 가이드의 `FOR ALL` 정책은 보안상 부적절하므로 `FOR SELECT`로 제한했다.
