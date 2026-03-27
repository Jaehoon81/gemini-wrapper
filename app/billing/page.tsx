"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { useSubscription } from "../components/SubscriptionProvider";

interface SubData {
  plan: "free" | "pro" | "unlimited";
  status: "active" | "canceled" | "expired";
  currentPeriodEnd: string | null;
  polarCustomerId: string | null;
}

const PLAN_PRICES = { free: "$0", pro: "$9.99", unlimited: "$29.99" };
const PLAN_NAMES = { free: "Free", pro: "Pro", unlimited: "Unlimited" };

export default function BillingPage() {
  const { user, loading: authLoading } = useAuth();
  const { usage } = useSubscription();
  const [sub, setSub] = useState<SubData | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch("/api/subscription")
      .then((r) => r.json())
      .then(setSub)
      .catch(() => {});
  }, [user]);

  if (authLoading || !sub) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-[#a1a1aa]">
        <p>로딩 중...</p>
      </div>
    );
  }

  const isUnlimited = sub.plan === "unlimited";
  const usagePercent = isUnlimited
    ? 0
    : Math.round((usage.count / usage.limit) * 100);

  const handleCancel = async () => {
    if (
      !confirm(
        "구독을 취소하시겠습니까?\n현재 결제 기간이 끝날 때까지 서비스를 이용할 수 있습니다."
      )
    )
      return;
    setCanceling(true);
    try {
      await fetch("/api/subscription/cancel", { method: "POST" });
      setSub((prev) => (prev ? { ...prev, status: "canceled" } : prev));
    } catch {
    } finally {
      setCanceling(false);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
    } catch {
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      <div className="max-w-xl mx-auto px-4 py-16">
        {/* 헤더 */}
        <h1 className="text-2xl font-bold mb-1">Billing</h1>
        <p className="text-sm text-[#a1a1aa] mb-8">
          구독 및 결제 정보를 관리합니다
        </p>

        {/* 현재 플랜 카드 */}
        <div className="rounded-xl border border-[#27272a] p-5 mb-4">
          <span className="text-xs text-[#a1a1aa]">현재 플랜</span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-2xl font-bold">
              {PLAN_NAMES[sub.plan]}
            </span>
            <div className="text-right">
              <span className="text-xl font-semibold">
                {PLAN_PRICES[sub.plan]}
              </span>
              {sub.plan !== "free" && (
                <span className="text-sm text-[#a1a1aa]">/월</span>
              )}
            </div>
          </div>
          <div className="mt-2">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded ${
                sub.status === "active"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : sub.status === "canceled"
                    ? "bg-yellow-500/15 text-yellow-400"
                    : "bg-red-500/15 text-red-400"
              }`}
            >
              {sub.status === "active"
                ? "활성"
                : sub.status === "canceled"
                  ? "취소됨"
                  : "만료"}
            </span>
          </div>
        </div>

        {/* 사용량 카드 */}
        <div className="rounded-xl border border-[#27272a] p-5 mb-6">
          <span className="text-xs text-[#a1a1aa]">이번 달 사용량</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-bold">{usage.count}</span>
            <span className="text-sm text-[#a1a1aa]">
              / {isUnlimited ? "무제한" : `${usage.limit}회`}
            </span>
          </div>
          {/* 프로그레스바 */}
          {!isUnlimited && (
            <div className="w-full h-2 bg-[#27272a] rounded-full overflow-hidden mt-3">
              <div
                className={`h-full rounded-full transition-all ${
                  usagePercent >= 100
                    ? "bg-red-500"
                    : usagePercent >= 80
                      ? "bg-yellow-500"
                      : "bg-white/30"
                }`}
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              />
            </div>
          )}
          {sub.currentPeriodEnd && (
            <p className="text-xs text-[#71717a] mt-3">
              {sub.status === "canceled" ? "서비스 종료일" : "다음 결제일"}:{" "}
              {new Date(sub.currentPeriodEnd).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          )}
        </div>

        {/* 액션 버튼들 */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <a
            href="/pricing"
            className="flex items-center justify-center rounded-xl border border-[#27272a] py-3 text-sm font-medium text-white hover:bg-white/[0.03] transition-colors"
          >
            플랜 변경
          </a>
          {sub.polarCustomerId ? (
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="flex items-center justify-center rounded-xl border border-[#27272a] py-3 text-sm font-medium text-[#a1a1aa] hover:bg-white/[0.03] transition-colors cursor-pointer disabled:opacity-50"
            >
              {portalLoading ? "이동 중..." : "결제 수단 · 청구서 관리"}
            </button>
          ) : (
            <button
              disabled
              className="flex items-center justify-center rounded-xl border border-[#27272a] py-3 text-sm font-medium text-[#52525b] cursor-default"
            >
              결제 수단 · 청구서 관리
            </button>
          )}
        </div>

        {/* 구독 취소 카드 */}
        {sub.plan !== "free" && sub.status === "active" && (
          <div className="rounded-xl border border-[#27272a] p-5">
            <h3 className="text-sm font-medium mb-1">구독 취소</h3>
            <p className="text-xs text-[#71717a] mb-4">
              취소하면 현재 결제 기간이 끝난 후 Free 플랜으로 전환됩니다.
            </p>
            <button
              onClick={handleCancel}
              disabled={canceling}
              className="rounded-lg border border-red-500/30 px-4 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/5 transition-colors cursor-pointer disabled:opacity-50"
            >
              {canceling ? "처리 중..." : "구독 취소"}
            </button>
          </div>
        )}

        {sub.status === "canceled" && (
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-5">
            <h3 className="text-sm font-medium text-yellow-400 mb-1">
              구독이 취소되었습니다
            </h3>
            <p className="text-xs text-[#a1a1aa]">
              {sub.currentPeriodEnd
                ? `${new Date(sub.currentPeriodEnd).toLocaleDateString("ko-KR")}까지 현재 플랜을 이용할 수 있습니다.`
                : "결제 기간이 끝나면 Free 플랜으로 전환됩니다."}
            </p>
          </div>
        )}

        {/* 하단 링크 */}
        <div className="mt-8">
          <a
            href="/chat"
            className="text-sm text-[#a1a1aa] hover:text-white transition-colors"
          >
            ← 채팅으로 돌아가기
          </a>
        </div>
      </div>
    </div>
  );
}
