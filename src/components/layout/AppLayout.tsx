import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearAuthSession, getStoredUser } from "../../lib/auth-storage";
import { logoutAccount } from "../../lib/auth-api";

const navItems = [
  { to: "/user-center", label: "用户中心", end: true },
  { to: "/ai-config", label: "素材配置", end: true },
  { to: "/live-assistant", label: "直播配置", end: true },
  { to: "#", label: "设置", disabled: true },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const user = getStoredUser();

  async function handleLogout() {
    try {
      await logoutAccount();
    } catch {
      // 即使后端失败也清理本地登录态
    }
    clearAuthSession();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-[#070a10] text-white">
      <div className="flex min-h-screen">
        <aside className="flex w-64 shrink-0 flex-col border-r border-white/10 bg-[#0a0f18] px-5 py-6">
          <div className="mb-8">
            <div className="text-xs tracking-[0.24em] text-accent">智播 AI</div>
            <div className="mt-1 text-lg font-semibold">专业控制台</div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item, index) =>
              item.disabled ? (
                <div
                  key={`${item.label}-${index}`}
                  className="rounded-xl px-4 py-3 text-sm text-white/30"
                >
                  {item.label}
                </div>
              ) : (
                <NavLink
                  key={item.label}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `block rounded-xl px-4 py-3 text-sm transition ${
                      isActive
                        ? "bg-accent/15 text-accent"
                        : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ),
            )}
          </nav>

          <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accent">
                {(user?.nickname || "用").slice(0, 1)}
              </div>
              <div>
                <div className="text-sm font-medium">{user?.nickname || "未命名用户"}</div>
                <div className="text-xs text-accent">专业会员</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-4 w-full rounded-xl border border-white/10 px-3 py-2 text-sm text-white/80 transition hover:border-accent/40 hover:text-white"
            >
              退出账号
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-white/10 px-8 py-5">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-white/40">⌕</span>
              <input
                placeholder="搜索功能或记录..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
              />
            </div>
            <div className="hidden items-center gap-4 md:flex">
              <div className="rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-sm text-accent">
                剩余：<span id="header-remaining-minutes">--</span> 分钟
              </div>
              <button
                type="button"
                onClick={() => navigate("/live-assistant")}
                className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-[#041018] transition hover:brightness-110"
              >
                开始 AI 直播
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-auto px-8 py-6">
            <Outlet />
          </main>

          <footer className="flex items-center justify-between border-t border-white/10 px-8 py-3 text-xs text-white/40">
            <span>服务器：亚太东部（东京）</span>
            <span>延迟：24 毫秒</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
