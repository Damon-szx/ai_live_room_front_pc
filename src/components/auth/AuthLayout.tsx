import type { ReactNode } from "react";

type BrandPanelProps = {
  badge?: string;
  title: string;
  description: string;
  footer?: ReactNode;
  children?: ReactNode;
};

export function BrandPanel({ badge, title, description, footer, children }: BrandPanelProps) {
  return (
    <section className="flex h-full flex-col justify-between px-8 py-10 lg:px-12 lg:py-12">
      <div>
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8.009 8.009 0 0 1-8 8Zm3.5-9.5-4.5 2.5a1 1 0 0 1-1.5-.87V8.87a1 1 0 0 1 1.5-.87l4.5 2.5a1 1 0 0 1 0 1.74Z" />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-wide text-white">智播 AI</span>
        </div>

        {badge ? (
          <div className="mb-4 inline-flex rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            {badge}
          </div>
        ) : null}

        <h1 className="max-w-md text-3xl font-bold leading-tight text-white lg:text-4xl">{title}</h1>
        <p className="mt-4 max-w-lg text-sm leading-7 text-muted lg:text-base">{description}</p>
        {children}
      </div>
      {footer}
    </section>
  );
}

export function LoginStats() {
  const items = [
    { label: "延迟", value: "12ms" },
    { label: "在线时间", value: "99.9%" },
    { label: "节点", value: "全球 40+" },
  ];

  return (
    <div className="mt-10 grid grid-cols-3 gap-4 border-t border-white/10 pt-8">
      {items.map((item) => (
        <div key={item.label}>
          <div className="text-xs text-muted">{item.label}</div>
          <div className="mt-1 text-lg font-semibold text-accent">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function RegisterFeatures() {
  const features = [
    {
      title: "智能场景分析",
      description: "实时 AI 驱动画面与互动节奏优化，让直播更稳定。",
    },
    {
      title: "观众洞察",
      description: "预测互动趋势与弹幕情绪，辅助主播实时决策。",
    },
  ];

  return (
    <div className="mt-8 space-y-4">
      {features.map((feature) => (
        <div key={feature.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-semibold text-white">{feature.title}</div>
          <div className="mt-2 text-sm leading-6 text-muted">{feature.description}</div>
        </div>
      ))}
      <p className="text-xs italic text-muted/80">已有超过 5 万名专业主播在使用智播 AI。</p>
    </div>
  );
}

export function AuthShell({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="min-h-screen bg-page px-4 py-6 lg:px-8 lg:py-10">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-[28px] border border-card-border bg-card shadow-[0_24px_80px_rgba(0,0,0,0.45)] lg:grid-cols-[1.05fr_0.95fr]">
        <div className="border-b border-card-border lg:border-b-0 lg:border-r">{left}</div>
        <div>{right}</div>
      </div>
    </div>
  );
}

export function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-card-border bg-[#0d121c] px-4 py-3 text-sm text-white outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20 ${props.className || ""}`}
    />
  );
}

export function PrimaryButton({
  children,
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-text transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 ${props.className || ""}`}
    >
      {loading ? "处理中..." : children}
    </button>
  );
}

export function AuthFooterLinks() {
  return (
    <div className="mt-8 space-y-3 text-center text-xs text-muted">
      <div>© 2026 智播 AI 保留所有权利</div>
      <div className="flex items-center justify-center gap-4">
        <button type="button" className="transition hover:text-white">
          服务协议
        </button>
        <button type="button" className="transition hover:text-white">
          隐私政策
        </button>
      </div>
    </div>
  );
}
