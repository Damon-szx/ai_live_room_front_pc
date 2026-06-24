import { useEffect, useState } from "react";
import { fetchUserCenterOverview } from "../../lib/user-center-api";
import { ApiError } from "../../lib/api-client";
import type { UserCenterOverview } from "../../types/user-center";

function ProgressRing({ percent }: { percent: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative h-28 w-28">
      <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth="8" fill="none" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="#4fd1c5"
          strokeWidth="8"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-xl font-bold text-white">{percent}%</div>
        <div className="text-xs text-white/50">已消耗</div>
      </div>
    </div>
  );
}

export default function UserCenterPage() {
  const [data, setData] = useState<UserCenterOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const overview = await fetchUserCenterOverview();
        if (!active) {
          return;
        }
        setData(overview);
        const header = document.getElementById("header-remaining-minutes");
        if (header) {
          header.textContent = String(overview.subscription.remainingMinutes);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof ApiError ? err.message : "用户中心数据加载失败");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div className="text-white/60">正在加载用户中心...</div>;
  }

  if (error || !data) {
    return <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">{error || "暂无数据"}</div>;
  }

  const { subscription, usagePreview, transactionPreview } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">用户中心</h1>
        <p className="mt-2 text-sm text-white/50">管理您的 AI 直播资源、套餐与账单记录。</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[24px] border border-white/10 bg-[#0d121c] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-white/50">剩余分钟数</div>
              <div className="mt-3 text-4xl font-bold">
                {subscription.remainingMinutes}
                <span className="ml-2 text-lg font-normal text-white/40">/ {subscription.totalMinutes} 分钟</span>
              </div>
            </div>
            <ProgressRing percent={subscription.consumedPercent} />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-[#041018]">
              立即续费
            </button>
            <button type="button" className="rounded-full border border-white/10 px-5 py-2 text-sm text-white/80">
              分钟明细
            </button>
          </div>
        </section>

        <section className="rounded-[24px] border border-white/10 bg-[#0d121c] p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">我的套餐</h2>
            <span className="rounded-full bg-accent/15 px-3 py-1 text-xs text-accent">{subscription.statusLabel}</span>
          </div>
          <div className="mt-4 text-2xl font-bold text-accent">{subscription.package.name}</div>
          <ul className="mt-5 space-y-3 text-sm text-white/70">
            {subscription.package.features.map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <span className="text-accent">✓</span>
                {feature}
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-white/10 pt-4 text-sm text-white/50">
            下次账单日期：{subscription.nextBillingAt ? subscription.nextBillingAt.slice(0, 10) : "-"}
          </div>
          <button type="button" className="mt-4 text-sm text-accent transition hover:text-white">
            管理订阅
          </button>
        </section>
      </div>

      <section className="rounded-[24px] border border-white/10 bg-[#0d121c] p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">使用记录</h2>
          <button type="button" className="text-sm text-white/50">筛选器</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-white/40">
              <tr>
                <th className="pb-4 pr-4 font-medium">AI 房间名称</th>
                <th className="pb-4 pr-4 font-medium">开始时间</th>
                <th className="pb-4 pr-4 font-medium">结束时间</th>
                <th className="pb-4 pr-4 font-medium">时长（分钟）</th>
                <th className="pb-4 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {usagePreview.map((record) => (
                <tr key={record.id} className="border-t border-white/5 text-white/80">
                  <td className="py-4 pr-4">{record.roomName}</td>
                  <td className="py-4 pr-4">{record.startedAt}</td>
                  <td className="py-4 pr-4">{record.endedAt || "-"}</td>
                  <td className="py-4 pr-4">{record.durationMinutes}</td>
                  <td className="py-4">
                    <button type="button" className="text-accent">下载</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[24px] border border-white/10 bg-[#0d121c] p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">交易记录</h2>
          <button type="button" className="text-sm text-accent">查看全部账单</button>
        </div>
        <div className="space-y-4">
          {transactionPreview.map((record) => (
            <div key={record.id} className="flex flex-wrap items-center justify-between gap-4 border-t border-white/5 pt-4 first:border-t-0 first:pt-0">
              <div>
                <div className="font-medium text-white">{record.title}</div>
                <div className="mt-1 text-xs text-white/40">
                  订单号：{record.orderNo} · {record.paidAt || record.createdAt}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold">¥ {record.amountYuan.toFixed(2)}</div>
                <div className="mt-1 text-xs text-accent">{record.statusLabel}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
