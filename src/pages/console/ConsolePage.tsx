import { Link } from "react-router-dom";
import { getStoredUser } from "../../lib/auth-storage";

export default function ConsolePage() {
  const user = getStoredUser();

  return (
    <div className="min-h-screen bg-page px-6 py-10">
      <div className="mx-auto max-w-4xl rounded-[28px] border border-card-border bg-card p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">直播控制台</h1>
            <p className="mt-2 text-sm text-muted">登录成功，后续将在此接入知识库、音色与直播能力。</p>
          </div>
          <Link
            to="/login"
            className="rounded-xl border border-card-border px-4 py-2 text-sm text-white transition hover:border-accent/40"
          >
            退出并返回登录
          </Link>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-sm text-muted">当前用户</div>
          <div className="mt-2 text-lg font-semibold text-white">{user?.nickname || "未命名用户"}</div>
          <div className="mt-1 text-sm text-accent">{user?.phone || "-"}</div>
        </div>
      </div>
    </div>
  );
}
