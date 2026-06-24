import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginWithPassword } from "../../lib/auth-api";
import { ApiError } from "../../lib/api-client";
import { setAuthSession } from "../../lib/auth-storage";
import {
  AuthFooterLinks,
  AuthShell,
  BrandPanel,
  FormField,
  LoginStats,
  PrimaryButton,
  TextInput,
} from "../../components/auth/AuthLayout";

const REMEMBER_PHONE_KEY = "ai_live_remember_phone";

export default function LoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const remembered = localStorage.getItem(REMEMBER_PHONE_KEY);
    if (remembered) {
      setPhone(remembered);
    }
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await loginWithPassword(phone.trim(), password);
      if (remember) {
        localStorage.setItem(REMEMBER_PHONE_KEY, phone.trim());
      } else {
        localStorage.removeItem(REMEMBER_PHONE_KEY);
      }
      setAuthSession(result.token, result.user);
      navigate("/user-center", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      left={
        <BrandPanel
          title="引领 AI 直播新纪元"
          description="专为专业主播打造的智能流媒体控制中心。毫秒级 AI 预测与自动化交互，让每一场直播都更具影响力。"
          footer={<LoginStats />}
        />
      }
      right={
        <div className="flex h-full flex-col justify-center px-8 py-10 lg:px-10 lg:py-12">
          <div>
            <h2 className="text-2xl font-bold text-white">账号登录</h2>
            <p className="mt-2 text-sm text-muted">欢迎回来，请使用注册时的手机号和密码登录。</p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <FormField label="手机号">
              <div className="flex overflow-hidden rounded-xl border border-card-border bg-[#0d121c] focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20">
                <span className="flex items-center px-4 text-sm text-accent">+86</span>
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="请输入手机号"
                  inputMode="numeric"
                  autoComplete="tel"
                  className="w-full bg-transparent py-3 pr-4 text-sm text-white outline-none"
                />
              </div>
            </FormField>

            <FormField label="密码">
              <div className="relative">
                <TextInput
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="请输入密码"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted transition hover:text-white"
                >
                  {showPassword ? "隐藏" : "显示"}
                </button>
              </div>
            </FormField>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-muted">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="h-4 w-4 rounded border-card-border bg-transparent"
                />
                记住我
              </label>
              <button type="button" className="text-accent transition hover:text-white">
                忘记密码？
              </button>
            </div>

            {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

            <PrimaryButton loading={loading} type="submit">
              立即登录
              <span aria-hidden="true">→</span>
            </PrimaryButton>
          </form>

          <div className="mt-6 text-center text-sm text-muted">
            还没有账号？
            <Link to="/register" className="ml-1 text-accent transition hover:text-white">
              免费注册
            </Link>
          </div>

          <AuthFooterLinks />
        </div>
      }
    />
  );
}
