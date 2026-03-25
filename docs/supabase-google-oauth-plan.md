# Supabase Google OAuth 구현 계획

## 개요
gemini-wrapper 프로젝트에 Supabase 기반 Google OAuth 로그인을 구현한다.

## 요구사항
1. 로그인 페이지에 Google 로그인 버튼
2. AuthContext로 전역 로그인 상태 관리
3. 미로그인 시 대시보드 접근 차단 (리다이렉트)
4. 로그아웃 기능

## 기술 스택
- Next.js 16.2.1 (App Router)
- React 19.2.4
- Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
- Tailwind CSS v4

## 핵심 설계 결정
- **라우트 보호**: Next.js 16의 `proxy.ts` 사용 (`middleware.ts`는 deprecated)
- **전역 상태**: AuthContext 클라이언트 컴포넌트 — React 19의 `<Context value={}>` 문법
- **Supabase 클라이언트**: `@supabase/ssr`의 `createBrowserClient` / `createServerClient`

## Supabase 프로젝트 정보
- 조직: Jaehoon81's Org
- 프로젝트: gemini-wrapper
- Reference ID: `your-project-ref`
- Region: Northeast Asia (Seoul)

## 구현 순서

### Step 1: 패키지 설치 + 환경변수 설정
```bash
npm install @supabase/supabase-js @supabase/ssr
```

`.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

### Step 2: Supabase 클라이언트 유틸리티
- `lib/supabase/client.ts` — 브라우저용 (`createBrowserClient`)
- `lib/supabase/server.ts` — 서버용 (`createServerClient` + `cookies()`)

### Step 3: proxy.ts (프로젝트 루트)
Next.js 16에서는 `middleware.ts` 대신 `proxy.ts`를 사용한다.
- 모든 요청에서 Supabase 세션 refresh
- `/chat` 접근 시 미인증 → `/login` 리다이렉트
- `/login` 접근 시 인증됨 → `/chat` 리다이렉트
- `export function proxy()` (Named export)

### Step 4: OAuth 콜백 핸들러
- `app/auth/callback/route.ts`
- Authorization code → session 교환 후 `/chat`으로 리다이렉트

### Step 5: AuthProvider (전역 상태 관리)
- `app/components/AuthProvider.tsx`
- `onAuthStateChange` 구독, `user` / `loading` 상태 제공
- `useAuth()` 훅 export

### Step 6: Root Layout 수정
- `app/layout.tsx` — AuthProvider로 children 감싸기

### Step 7: 로그인 페이지
- `app/login/page.tsx`
- Google 로그인 버튼, 다크 테마 (랜딩 페이지와 통일)

### Step 8: 채팅 페이지 (보호된 페이지 뼈대)
- `app/chat/page.tsx`
- 사용자 정보 표시 + 로그아웃 버튼

## 수정/생성 파일 목록

| 파일 | 작업 |
|------|------|
| `.env.local` | 신규 |
| `lib/supabase/client.ts` | 신규 |
| `lib/supabase/server.ts` | 신규 |
| `proxy.ts` | 신규 |
| `app/auth/callback/route.ts` | 신규 |
| `app/components/AuthProvider.tsx` | 신규 |
| `app/layout.tsx` | 수정 (AuthProvider 추가) |
| `app/login/page.tsx` | 신규 |
| `app/chat/page.tsx` | 신규 |

## 검증 방법
1. `npm run dev` 실행
2. `/chat` 접근 → `/login`으로 리다이렉트 확인
3. Google 로그인 버튼 클릭 → Google OAuth 흐름 → `/chat` 도착 확인
4. `/chat`에서 사용자 이메일 표시 + 로그아웃 버튼 동작 확인
5. 로그아웃 후 `/chat` 접근 → `/login` 리다이렉트 확인

## 사전 조건 (수동 설정 필요)
1. **Supabase 대시보드**: Authentication > Providers > Google에서 OAuth Provider 활성화 (Google Cloud Console의 Client ID/Secret 필요)
2. **Supabase 대시보드**: Authentication > URL Configuration에서 Redirect URL 추가: `http://localhost:3000/auth/callback`
3. **Google Cloud Console**: OAuth 2.0 Client ID 생성, Authorized redirect URI에 `https://your-project-ref.supabase.co/auth/v1/callback` 추가
