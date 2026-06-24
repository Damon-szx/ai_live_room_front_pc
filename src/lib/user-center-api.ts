import { apiRequest } from "./api-client";
import type { UserCenterOverview } from "../types/user-center";
import type { UsageRecord, TransactionRecord, SubscriptionInfo, PackageInfo } from "../types/user-center";

export function fetchUserCenterOverview() {
  return apiRequest<UserCenterOverview>("/api/user-center/overview");
}

export function fetchSubscription() {
  return apiRequest<{ subscription: SubscriptionInfo }>("/api/user-center/subscription");
}

export function fetchUsageRecords(limit = 20, offset = 0) {
  return apiRequest<{ items: UsageRecord[]; total: number; limit: number; offset: number }>(
    `/api/user-center/usage-records?limit=${limit}&offset=${offset}`,
  );
}

export function fetchTransactions(limit = 20, offset = 0) {
  return apiRequest<{ items: TransactionRecord[]; total: number; limit: number; offset: number }>(
    `/api/user-center/transactions?limit=${limit}&offset=${offset}`,
  );
}

export function fetchPackages() {
  return apiRequest<{ items: PackageInfo[] }>("/api/user-center/packages");
}
