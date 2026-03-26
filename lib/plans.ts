export const PLANS = {
  free: { name: "Free", price: 0, limit: 10, productId: null },
  pro: {
    name: "Pro",
    price: 9.99,
    limit: 100,
    productId: process.env.POLAR_PRO_PRODUCT_ID!,
  },
  unlimited: {
    name: "Unlimited",
    price: 29.99,
    limit: Infinity,
    productId: process.env.POLAR_UNLIMITED_PRODUCT_ID!,
  },
} as const;

export type PlanType = keyof typeof PLANS;
