import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerAccount } from "../../lib/auth-api";
import { ApiError } from "../../lib/api-client";
import { setAuthSession } from "../../lib/auth-storage";
import {
  AuthFooterLinks,
  AuthShell,
  BrandPanel,
  FormField,
  PrimaryButton,
  RegisterFeatures,
  TextInput,
} from "../../components/auth/AuthLayout";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!agreed) {
      setError("请先阅读并同意服务条款和隐私政策");
      return;
    }

    setLoading(true);
    try {
      const result = await registerAccount(phone.trim(), password, nickname.trim());
      setAuthSession(result.token, result.user);
      navigate("/user-center", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "注册失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      left={
        <BrandPanel
          badge="下一代直播"
          title="智播 AI"
          description="以临床级 AI 精度提升你的直播表现力，让口播、互动与转化都更可控。"
        >
          <RegisterFeatures />
        </BrandPanel>
      }
      right={
        <div className="flex h-full flex-col justify-center px-8 py-10 lg:px-10 lg:py-12">
          <div>
            <h2 className="text-2xl font-bold text-primary">创建账号</h2>
            <p className="mt-2 text-sm text-muted">开启您的专业 AI 直播之旅</p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <FormField label="用户名">
              <TextInput
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="请输入用户名"
                autoComplete="username"
              />
            </FormField>

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

            <FormField label="设置密码">
              <div className="relative">
                <TextInput
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="请输入密码"
                  className="pr-16"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
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

            <label className="flex items-start gap-3 text-sm leading-6 text-muted">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-card-border bg-transparent"
              />
              <span>
                我已阅读并同意
                <button type="button" className="mx-1 text-accent transition hover:text-white">
                  服务条款
                </button>
                和
                <button type="button" className="mx-1 text-accent transition hover:text-white">
                  隐私政策
                </button>
              </span>
            </label>

            {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

            <PrimaryButton loading={loading} type="submit">
              立即注册
              <span aria-hidden="true">→</span>
            </PrimaryButton>
          </form>

          <div className="my-6 flex items-center gap-4 text-xs text-muted">
            <div className="h-px flex-1 bg-card-border" />
            其他方式
            <div className="h-px flex-1 bg-card-border" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="rounded-xl border border-card-border px-4 py-3 text-sm text-white transition hover:border-accent/40"
            >
              微信
            </button>
            <button
              type="button"
              className="rounded-xl border border-card-border px-4 py-3 text-sm text-white transition hover:border-accent/40"
            >
              码云
            </button>
          </div>

          <div className="mt-6 text-center text-sm text-muted">
            已有账号？
            <Link to="/login" className="ml-1 text-accent transition hover:text-white">
              立即登录
            </Link>
          </div>

          <AuthFooterLinks />
        </div>
      }
    />
  );
}
