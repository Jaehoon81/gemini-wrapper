"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";

interface SubscriptionContextValue {
  plan: "free" | "pro" | "unlimited";
  status: "active" | "canceled" | "expired";
  usage: { count: number; limit: number };
  loading: boolean;
  refreshUsage: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  plan: "free",
  status: "active",
  usage: { count: 0, limit: 10 },
  loading: true,
  refreshUsage: () => {},
});

export const useSubscription = () => useContext(SubscriptionContext);

export default function SubscriptionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [plan, setPlan] = useState<"free" | "pro" | "unlimited">("free");
  const [status, setStatus] = useState<"active" | "canceled" | "expired">("active");
  const [usage, setUsage] = useState({ count: 0, limit: 10 });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const [subRes, usageRes] = await Promise.all([
        fetch("/api/subscription"),
        fetch("/api/usage"),
      ]);
      const subData = await subRes.json();
      const usageData = await usageRes.json();

      setPlan(subData.plan || "free");
      setStatus(subData.status || "active");
      setUsage({
        count: usageData.count || 0,
        limit: usageData.limit ?? 10,
      });
    } catch {
      // 에러 시 기본값 유지
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 채팅 성공 후 클라이언트에서 count +1
  const refreshUsage = useCallback(() => {
    setUsage((prev) => ({ ...prev, count: prev.count + 1 }));
  }, []);

  return (
    <SubscriptionContext value={{ plan, status, usage, loading, refreshUsage }}>
      {children}
    </SubscriptionContext>
  );
}
