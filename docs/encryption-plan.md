# AES-256-GCM 유저 정보 암호화 구현 계획

> 작성일: 2026-03-27
> 참고: [바이브코딩으로 SaaS 런칭하기](https://raspy-roll-970.notion.site/SaaS-303f7725c9d981db8796cee24b2d2ba5) — 암호화: 유저 정보 보호 [55:00 ~ 59:00]

## Context

Gemini 래퍼 SaaS에서 DB에 저장되는 유저 개인정보(email, full_name, IP 등)를 앱 레벨 암호화로 보호한다.
DB가 유출되더라도 평문 데이터를 읽을 수 없도록 AES-256-GCM 암호화를 적용하고, 검색이 필요한 필드에는 HMAC-SHA256 해시 인덱스를 추가한다.

---

## 7-1. 암호화 개요

### 암호화 대상

| 테이블 | 컬럼 | 비고 |
|--------|------|------|
| profiles | email | 검색 필요 → 해시 인덱스 컬럼 추가 |
| profiles | full_name | 검색 필요 → 해시 인덱스 컬럼 추가 |
| user_activity_logs | ip_address | 로그성 데이터 |

### 암호화 방식

| 항목 | 내용 |
|------|------|
| 알고리즘 | AES-256-GCM |
| 방식 | 앱 레벨 암호화 (저장 전 암호화, 불러올 때 복호화) |
| IV | 매번 랜덤 생성 (16바이트) |
| 저장 포맷 | `iv:authTag:encryptedData` (hex 인코딩) |
| 암호화 키 | ENCRYPTION_KEY 환경변수 (32바이트 = 64자리 hex) |
| 검색용 해시 | HMAC-SHA256 (HASH_KEY 환경변수) |

### 현재 상태 분석

- `profiles` 테이블 없음 — `auth.users`만 사용 중
- `user_activity_logs` 테이블 없음
- 암호화 관련 코드/키 전무
- email 읽기: auth.users 세션에서 직접 (checkout, chat 페이지 2곳)
- full_name: 사용 안 함

---

## 7-2. 구현 계획

### Phase 1: 암호화 유틸리티 + 키 생성

**Step 1-1: `lib/encryption-core.ts` 신규 생성**

Node.js `crypto` 모듈 사용. 4개 함수:

- `encrypt(plaintext)` → `iv:authTag:encryptedData` (hex)
- `decrypt(ciphertext)` → plaintext
- `hashForLookup(value)` → HMAC-SHA256 hex (검색용 해시)
- `tryDecrypt(ciphertext)` → plaintext | null (graceful degradation)

설계 결정:
- 키를 함수 호출 시마다 `process.env`에서 읽음 (lazy evaluation)
- `tryDecrypt()`로 손상 데이터/키 로테이션 중에도 앱 크래시 방지

**Step 1-2: `lib/encryption.ts` 신규 생성**

```typescript
import "server-only";  // 클라이언트 번들 포함 시 빌드 에러
export { encrypt, decrypt, hashForLookup, tryDecrypt } from "./encryption-core";
```

분리 이유: scripts에서는 `server-only` 없이 `encryption-core.ts`를 직접 import.

**Step 1-3: `scripts/generate-keys.ts` 신규 생성**

`crypto.randomBytes(32).toString("hex")`로 ENCRYPTION_KEY, HASH_KEY 자동 생성.

실행: `npx tsx scripts/generate-keys.ts`

**Step 1-4: 의존성 추가**

- `npm install -D tsx` (스크립트 실행용)
- `package.json` scripts: `"generate-keys"`, `"migrate-encrypt"` 추가

> 검증: 키 생성 스크립트 실행 → `.env.local`에 ENCRYPTION_KEY, HASH_KEY 추가

---

### Phase 2: DB 스키마 변경

**Step 2-1: profiles 테이블 추가** (`supabase/init.sql`)

```sql
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,             -- 암호화된 값
  email_hash TEXT,        -- HMAC-SHA256 (검색용)
  full_name TEXT,         -- 암호화된 값
  full_name_hash TEXT,    -- HMAC-SHA256 (검색용)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_email_hash ON profiles(email_hash);
CREATE INDEX idx_profiles_full_name_hash ON profiles(full_name_hash);
```

**Step 2-2: user_activity_logs 테이블 추가** (`supabase/init.sql`)

```sql
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  ip_address TEXT,        -- 암호화된 값
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Step 2-3: RLS 정책**

- profiles: SELECT만 `auth.uid() = id`. 쓰기는 service_role 전용 (앱 레벨 암호화와 일치)
- user_activity_logs: SELECT만 `auth.uid() = user_id`. 쓰기는 service_role 전용

**Step 2-4: handle_new_user() 트리거 확장**

기존 subscriptions INSERT에 추가로 profiles INSERT:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active');

  INSERT INTO public.profiles (id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

트리거에서는 빈 profiles 행만 생성. 암호화된 email/full_name은 auth callback에서 업데이트.

> 검증: Supabase SQL Editor에서 실행 → 테이블/인덱스/트리거 확인

---

### Phase 3: 데이터 레이어

**Step 3-1: `lib/supabase/db-server.ts` 수정 — 프로필 함수 추가**

- `upsertProfile(userId, email, fullName)` — encrypt 후 supabaseAdmin으로 UPDATE
- `getProfile(userId)` — SELECT 후 tryDecrypt로 복호화
- `findProfileByEmail(email)` — hashForLookup으로 email_hash 검색

**Step 3-2: `lib/supabase/db-server.ts` 수정 — 활동 로그 함수 추가**

- `logActivity(userId, action, ipAddress?, metadata?)` — IP encrypt 후 INSERT

> 검증: 수동 함수 호출 테스트

---

### Phase 4: Auth 플로우 연동

**Step 4-1: `app/auth/callback/route.ts` 수정**

`exchangeCodeForSession` 성공 후:

```typescript
import { upsertProfile, logActivity } from "@/lib/supabase/db-server";

// 암호화된 프로필 저장
await upsertProfile(
  data.user.id,
  data.user.email ?? null,
  data.user.user_metadata?.full_name ?? null
);

// 로그인 활동 로그
await logActivity(data.user.id, "login", request.headers.get("x-forwarded-for"));
```

**변경 불필요 파일:**

| 파일 | 이유 |
|------|------|
| `app/api/checkout/route.ts` | auth.users 세션의 email 사용 — DB 암호화와 무관 |
| `app/chat/page.tsx` | 클라이언트 세션 데이터 — 변경 불필요 |

> 검증: 로그아웃 → 재로그인 → Supabase 대시보드에서 profiles.email이 `iv:authTag:encrypted` 포맷인지 확인

---

### Phase 5: 마이그레이션 스크립트

**`scripts/migrate-encrypt.ts` 신규 생성**

- `auth.admin.listUsers()`로 기존 유저 목록 조회
- 각 유저의 email/full_name을 암호화하여 profiles에 저장
- 이미 암호화된 행은 skip (멱등성 보장)

실행: `npx tsx -r dotenv/config scripts/migrate-encrypt.ts`

> 검증: 모든 유저의 profiles 행에 암호화 데이터 확인

---

### Phase 6: 배포

1. `.env.local`에 ENCRYPTION_KEY, HASH_KEY 추가
2. Vercel 환경변수에 동일 값 추가 (수동)
3. 커밋 & 푸시 → Vercel 자동 배포
4. E2E 확인: 로그인 → 채팅 → Supabase 대시보드

---

## 수정 파일 요약

| 파일 | 유형 | 변경 |
|------|------|------|
| `lib/encryption-core.ts` | 신규 | encrypt, decrypt, hashForLookup, tryDecrypt |
| `lib/encryption.ts` | 신규 | server-only guard + re-export |
| `scripts/generate-keys.ts` | 신규 | 키 생성 CLI |
| `scripts/migrate-encrypt.ts` | 신규 | 기존 유저 배치 암호화 |
| `supabase/init.sql` | 수정 | profiles, user_activity_logs, RLS, 트리거 확장 |
| `lib/supabase/db-server.ts` | 수정 | profile/activity log 함수 추가 |
| `app/auth/callback/route.ts` | 수정 | upsertProfile + logActivity 호출 |
| `package.json` | 수정 | tsx devDep, scripts 추가 |

---

## 7-3. 암호화 확인 + 마무리

1. 키 생성 스크립트 실행 → ENCRYPTION_KEY, HASH_KEY 자동 생성
2. `.env.local`에 키 추가
3. Vercel 환경변수에도 추가
4. Supabase 대시보드에서 비포/애프터 확인:
   - 비포: `user@example.com` (평문)
   - 애프터: `a3f2b1c4d5e6:9f8e7d6c:2b3c4d5e6f7a...` (암호화)
5. 앱에서는 정상적으로 표시됨 (서버사이드 복호화)
6. 커밋: `git commit -m "feat: AES-256-GCM encryption for user data"`

### 주의사항

- 암호화 키는 절대 클라이언트에 노출 금지
- 모든 암호화/복호화는 서버 사이드에서만 수행
- ENCRYPTION_KEY는 한번 정하면 바꾸지 마세요 (바꾸면 이전 데이터 못 읽음)
- `.env.local`과 Vercel 양쪽에 다 넣어야 함
- 키 분실 = 데이터 영구 손실 → 별도 안전한 장소에 백업 권장

---

## SaaS 모범 사례 기반 보강 사항

### 1. 키 로테이션 대비

현재: 단일 키 방식 (충분). 향후 확장을 위해 암호문에 `v1:` prefix를 추가하여 키 버전 관리 가능하도록 설계. `decrypt()`에서 콜론 개수로 v1/v2 자동 감지.

### 2. 복호화 실패 시 graceful degradation

`tryDecrypt()` 함수로 앱 크래시 방지. 복호화 실패 시 null 반환 + 에러 로깅. UI에서 "정보 없음" 처리.

### 3. server-only 보호

`import "server-only"`로 클라이언트 번들에 암호화 코드가 포함되면 빌드 에러 발생. 암호화 키가 절대 브라우저에 노출되지 않음을 보장.

### 4. GDPR/개인정보보호법 대응

- `ON DELETE CASCADE`로 auth.users 삭제 시 profiles, user_activity_logs 자동 삭제 (Right to be forgotten)
- 서버사이드 `getProfile()`로 복호화된 데이터 JSON 내보내기 가능 (Right to portability)

### 5. 백업 안전성

- Supabase 백업에는 암호화된 데이터만 포함 (키는 Vercel 환경변수에 별도 보관)
- DB 유출 시에도 복호화 불가 — 앱 레벨 암호화의 핵심 장점

### 6. 성능 영향

- AES-256-GCM은 하드웨어 가속(AES-NI) 지원 — email/name 수준은 < 0.1ms
- 해시 인덱스로 검색 시 DB 성능 저하 없음

### 7. RLS 호환성

- profiles: SELECT만 본인, 쓰기는 service_role 전용 → 앱 레벨 암호화와 일치
- 기존 테이블(conversations, messages, subscriptions, usage): 영향 없음
- email_hash 검색은 service_role 클라이언트 사용 → RLS 우회

### 8. `server-only` vs scripts 충돌 해결

`encryption-core.ts` (순수 crypto) + `encryption.ts` (server-only guard)로 분리하여, 앱 코드는 `encryption.ts`를, 마이그레이션 스크립트는 `encryption-core.ts`를 import.

---

## 검증 체크리스트

- [ ] `lib/encryption-core.ts` — encrypt, decrypt, hashForLookup, tryDecrypt
- [ ] `lib/encryption.ts` — server-only re-export
- [ ] `scripts/generate-keys.ts` — 키 생성 실행 확인
- [ ] `.env.local`에 ENCRYPTION_KEY, HASH_KEY 추가
- [ ] DB 스키마 — profiles, user_activity_logs 테이블 + 인덱스
- [ ] handle_new_user() 트리거에 profiles INSERT 추가
- [ ] 회원가입/로그인 시 암호화 프로필 저장
- [ ] 프로필 조회 시 복호화 정상 동작
- [ ] user_activity_logs.ip_address 암호화
- [ ] RLS 정책 검토 완료
- [ ] `scripts/migrate-encrypt.ts` — 기존 유저 배치 암호화
- [ ] ENCRYPTION_KEY, HASH_KEY → Vercel 환경변수에 추가
- [ ] Supabase 대시보드에서 암호화된 데이터 확인
- [ ] 앱에서 정상 작동 확인 (서버사이드 복호화)
