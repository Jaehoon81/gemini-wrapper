"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";
import { useRouter } from "next/navigation";
import { ArrowLeft, CreditCard, ExternalLink } from "lucide-react";

interface SubData {
  plan: "free" | "pro" | "unlimited";
  status: "active" | "canceled" | "expired";
  currentPeriodEnd: string | null;
  polarCustomerId: string | null;
}

export default function BillingPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
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

  const planNames = { free: "Free", pro: "Pro", unlimited: "Unlimited" };
  const statusLabels = {
    active: "활성",
    canceled: "취소됨 (기간 끝까지 유지)",
    expired: "만료",
  };

  const handleCancel = async () => {
    if (!confirm("구독을 취소하시겠습니까?\n현재 결제 기간이 끝날 때까지 서비스를 이용할 수 있습니다.")) return;
    setCanceling(true);
    try {
      await fetch("/api/subscription/cancel", { method: "POST" });
      setSub((prev) => prev ? { ...prev, status: "canceled" } : prev);
    } catch {} finally {
      setCanceling(false);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
    } catch {} finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      <div className="max-w-xl mx-auto px-4 py-16">
        {/* 뒤로가기 */}
        <button
          onClick={() => router.push("/chat")}
          className="flex items-center gap-1.5 text-sm text-[#a1a1aa] hover:text-white transition-colors mb-8 cursor-pointer"
        >
          <ArrowLeft size={16} />
          채팅으로 돌아가기
        </button>

        <h1 className="text-2xl font-bold mb-8 flex items-center gap-2">
          <CreditCard size={24} />
          Billing
        </h1>

        {/* 현재 플랜 */}
        <div className="rounded-xl border border-[#27272a] p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#a1a1aa]">현재 플랜</span>
            <span className="text-sm font-medium px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10">
              {planNames[sub.plan]}
            </span>
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#a1a1aa]">상태</span>
            <span className="text-sm">{statusLabels[sub.status]}</span>
          </div>
          {sub.currentPeriodEnd && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#a1a1aa]">
                {sub.status === "canceled" ? "서비스 종료일" : "다음 결제일"}
              </span>
              <span className="text-sm">
                {new Date(sub.currentPeriodEnd).toLocaleDateString("ko-KR")}
              </span>
            </div>
          )}
        </div>

        {/* 액션 버튼들 */}
        <div className="space-y-3">
          <a
            href="/pricing"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-white hover:bg-white/[0.05] transition-colors"
          >
            플랜 변경
          </a>

          {sub.polarCustomerId && (
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-[#a1a1aa] hover:bg-white/[0.05] transition-colors cursor-pointer disabled:opacity-50"
            >
              <ExternalLink size={14} />
              {portalLoading ? "이동 중..." : "결제 수단 · 청구서 관리"}
            </button>
          )}

          {sub.plan !== "free" && sub.status === "active" && (
            <button
              onClick={handleCancel}
              disabled={canceling}
              className="flex w-full items-center justify-center rounded-xl border border-red-500/20 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/5 transition-colors cursor-pointer disabled:opacity-50"
            >
              {canceling ? "처리 중..." : "구독 취소"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
