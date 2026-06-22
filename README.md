# 智播 AI · PC 端

Web 端 AI 直播间控制台，当前包含登录、注册与基础控制台占位页。

## 技术栈

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- React Router

## 开发

```bash
cd /Users/sunzixiong/VibeCoding/ai-live-front-pc
npm install
npm run dev
```

默认访问：`http://127.0.0.1:5173`

开发环境通过 Vite 代理将 `/api` 转发到 `http://127.0.0.1:8000`。

## 环境变量

复制 `.env.example` 为 `.env.local`：

```bash
cp .env.example .env.local
```

## 鉴权说明

- 注册：`POST /api/auth/register`（用户名、手机号、密码）
- 登录：`POST /api/auth/login`（手机号、密码）
- 前端将 token 存入 `localStorage`，后续请求自动携带 `Authorization: Bearer <token>`

## 生产构建

```bash
npm run build
npm run preview
```
