export type AuthUser = {
  id: string;
  phone: string;
  nickname: string;
  avatarUrl: string;
};

export type PackageInfo = {
  id: string;
  code: string;
  name: string;
  description: string;
  features: string[];
  totalMinutes: number;
  priceCents: number;
  priceYuan: number;
  billingCycle: string;
  levelLabel: string;
};

export type SubscriptionInfo = {
  id: string;
  status: string;
  statusLabel: string;
  totalMinutes: number;
  usedMinutes: number;
  remainingMinutes: number;
  consumedPercent: number;
  startedAt: string;
  expiresAt: string;
  nextBillingAt: string;
  package: PackageInfo;
};

export type UsageRecord = {
  id: string;
  roomName: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  status: string;
  statusLabel: string;
};

export type TransactionRecord = {
  id: string;
  orderNo: string;
  title: string;
  amountCents: number;
  amountYuan: number;
  status: string;
  statusLabel: string;
  transactionType: string;
  paidAt: string;
  createdAt: string;
};

export type UserCenterOverview = {
  user: AuthUser;
  subscription: SubscriptionInfo;
  usagePreview: UsageRecord[];
  transactionPreview: TransactionRecord[];
  serverRegion: string;
  latencyMs: number;
};
