"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useAuth } from "../components/AuthProvider";

type PlanKey = "free" | "pro" | "unlimited";

const PLAN_CARDS: {
  key: PlanKey;
  name: string;
  price: string;
  description: string;
  features: string[];
  highlighted: boolean;
  hasPaid: boolean;
}[] = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    description: "시작하기 좋은 무료 플랜",
    features: [
      "월 10회 AI 채팅",
      "Gemini 2.5 Flash 모델",
      "대화 히스토리 저장",
      "기본 고객 지원",
    ],
    highlighted: false,
    hasPaid: false,
  },
  {
    key: "pro",
    name: "Pro",
    price: "$9.99",
    description: "더 많은 대화가 필요한 분에게",
    features: [
      "월 100회 AI 채팅",
      "Gemini 2.5 Flash 모델",
      "대화 히스토리 저장",
      "우선 고객 지원",
      "사용량 대시보드",
    ],
    highlighted: true,
    hasPaid: true,
  },
  {
    key: "unlimited",
    name: "Unlimited",
    price: "$29.99",
    description: "제한 없이 자유롭게",
    features: [
      "무제한 AI 채팅",
      "Gemini 2.5 Flash 모델",
      "대화 히스토리 저장",
      "최우선 고객 지원",
      "사용량 대시보드",
      "향후 프리미엄 기능 우선 접근",
    ],
    highlighted: false,
    hasPaid: true,
  },
];

const PLAN_ORDER: PlanKey[] = ["free", "pro", "unlimited"];

export default function PricingPage() {
  const { user } = useAuth();
  const [currentPlan, setCurrentPlan] = useState<PlanKey | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch("/api/subscription")
      .then((r) => r.json())
      .then((data) => setCurrentPlan(data.plan))
      .catch(() => setCurrentPlan("free"));
  }, [user]);

  const handleUpgrade = async (planKey: PlanKey) => {
    if (!user) {
      window.location.href = "/login";
      return;
    }

    setLoadingPlan(planKey);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planKey }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      alert("결제 페이지로 이동하지 못했습니다.");
    } finally {
      setLoadingPlan(null);
    }
  };

  const canUpgrade = (planKey: PlanKey) => {
    if (!currentPlan) return false;
    return PLAN_ORDER.indexOf(planKey) > PLAN_ORDER.indexOf(currentPlan);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      <div className="max-w-5xl mx-auto px-4 py-16">
        {/* 헤더 */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Plans and Pricing
          </h1>
          <p className="text-[#a1a1aa] text-lg">
            필요에 맞는 플랜을 선택하세요
          </p>
        </div>

        {/* 플랜 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLAN_CARDS.map((plan) => {
            const isCurrent = currentPlan === plan.key;
            const isUpgradable = canUpgrade(plan.key);
            const isLoading = loadingPlan === plan.key;

            return (
              <div
                key={plan.key}
                className={`relative rounded-2xl border p-6 transition-all duration-300 ${
                  plan.highlighted
                    ? "border-white/15 bg-white/[0.03] scale-[1.02] shadow-xl"
                    : "border-[#27272a] hover:border-white/10"
                }`}
              >
                {/* 추천 뱃지 */}
                {plan.highlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <div className="relative">
                      <div className="absolute inset-0 bg-white/10 rounded-full blur-[2px]" />
                      <div className="relative px-4 py-1.5 bg-white/[0.05] backdrop-blur-sm rounded-full border border-white/10">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-1 h-1 rounded-full bg-white/60 animate-pulse" />
                          <span className="text-xs font-medium text-white/80">
                            추천
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 플랜 정보 */}
                <div className="mb-6">
                  <h3 className="text-xl font-medium mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    {plan.hasPaid && (
                      <span className="text-sm text-[#a1a1aa]">/월</span>
                    )}
                  </div>
                  <p className="text-sm text-[#a1a1aa] mt-3">
                    {plan.description}
                  </p>
                </div>

                {/* 기능 목록 */}
                <div className="space-y-3 mb-6">
                  {plan.features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 text-white/30 flex-shrink-0" />
                      <span className="text-sm text-[#d4d4d8]">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* CTA 버튼 */}
                {isCurrent ? (
                  <button
                    disabled
                    className="w-full py-2.5 px-4 rounded-xl text-sm font-medium border border-white/10 text-[#a1a1aa] cursor-default"
                  >
                    현재 플랜
                  </button>
                ) : isUpgradable && plan.hasPaid ? (
                  <button
                    onClick={() => handleUpgrade(plan.key)}
                    disabled={isLoading}
                    className={`w-full py-2.5 px-4 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                      plan.highlighted
                        ? "bg-white text-black hover:bg-white/90"
                        : "border border-white/10 text-white hover:bg-white/[0.05]"
                    } disabled:opacity-50`}
                  >
                    {isLoading ? "이동 중..." : "업그레이드"}
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full py-2.5 px-4 rounded-xl text-sm font-medium border border-white/10 text-[#71717a] cursor-default"
                  >
                    {plan.key === "free" ? "무료" : "업그레이드"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* 하단 링크 */}
        <div className="text-center mt-10">
          {user ? (
            <a
              href="/chat"
              className="text-sm text-[#a1a1aa] hover:text-white transition-colors"
            >
              ← 채팅으로 돌아가기
            </a>
          ) : (
            <a
              href="/login"
              className="text-sm text-[#a1a1aa] hover:text-white transition-colors"
            >
              로그인하고 시작하기 →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
