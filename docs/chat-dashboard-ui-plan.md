# 채팅 대시보드 UI 구현 계획

## Context
`/chat` 페이지를 뼈대에서 완전한 대시보드 UI로 업그레이드한다. 사용자가 제공한 ChatInput 컴포넌트(글래스모피즘, 글로우 이펙트)를 활용하여 다크 테마 미니멀 디자인으로 구성.

## 레이아웃 구조
```
┌──────────────────────────────────────────────┐
│ 헤더: [Gemini Wrapper]  [50회 남음] [email] [로그아웃] │
├──────────┬───────────────────────────────────┤
│ Sidebar  │  ChatMessages (환영 메시지)        │
│ (w-64)   │  (flex-1, 스크롤)                 │
│ 새 대화   │                                   │
│ 대화목록  ├───────────────────────────────────┤
│          │  ChatInput (글래스모피즘 입력창)     │
└──────────┴───────────────────────────────────┘
```

## 구현 순서

### Step 1: lucide-react 설치
```bash
npm install lucide-react
```

### Step 2: ChatInput 컴포넌트 — `app/chat/components/ChatInput.tsx`
- 제공된 코드에서 `import ... from "figma:react"` 제거
- `"use client"` 추가
- `textColor` 기본값: `"#0A1217"` → `"#fafafa"` (다크 테마)
- 나머지 로직/이펙트 그대로 유지

### Step 3: Sidebar — `app/chat/components/Sidebar.tsx`
- 새 대화 버튼 (Plus 아이콘)
- 더미 대화 목록 (3개), 선택 하이라이트
- w-64 고정, border-r border-[#27272a]

### Step 4: ChatMessages — `app/chat/components/ChatMessages.tsx`
- 빈 상태: 중앙 환영 메시지
- 메시지 있을 때: user(우측)/assistant(좌측) 정렬
- flex-1 overflow-y-auto, max-w-3xl mx-auto

### Step 5: chat/page.tsx 재작성
- 헤더에 잔여 횟수 추가 (이메일 왼쪽)
- Sidebar + main(ChatMessages + ChatInput) 조합
- 기존 useAuth/로그아웃 로직 유지

## 수정/생성 파일
| 파일 | 작업 |
|------|------|
| `app/chat/components/ChatInput.tsx` | 신규 |
| `app/chat/components/Sidebar.tsx` | 신규 |
| `app/chat/components/ChatMessages.tsx` | 신규 |
| `app/chat/page.tsx` | 수정 |

## 검증
- `npm run dev` → `/chat` 접속
- 사이드바 + 빈 채팅 화면 + ChatInput 렌더링 확인
- 글로우/글래스모피즘 이펙트 동작 확인
- 로그아웃 버튼 동작 확인
