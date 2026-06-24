import { copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

import {
  patchChatRtfContent,
  patchFetchConnectInfo,
  patchFetchImInfo,
  patchParseLiveHtml,
  patchSocketUrl,
} from "./vite-douyin-patches.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dycastRoot = path.resolve(__dirname, "../dycast");
const dycastMssdkPath = path.join(dycastRoot, "public/mssdk.js");

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0";

function patchSetCookieHeaders(proxyRes) {
  const setCookie = proxyRes.headers["set-cookie"];
  if (!setCookie) return;
  proxyRes.headers["set-cookie"] = setCookie.map((cookie) =>
    cookie
      .replace(/; Domain=[^;]+/i, "")
      .replace(/; SameSite=None/i, "")
      .replace(/; SameSite=none/i, "")
      .replace(/; Secure(?:=true)?/i, ""),
  );
}

function createDouyinProxyOptions({ target, rewrite, referer }) {
  return {
    target,
    changeOrigin: true,
    rewrite,
    configure: (proxy) => {
      proxy.on("proxyReq", (proxyReq, req) => {
        proxyReq.setHeader("Referer", referer);
        const ua = req.headers["user-agent"] || "";
        if (/mobile|android|iphone|ipad/i.test(ua)) {
          proxyReq.setHeader("User-Agent", DESKTOP_UA);
        }
      });
      proxy.on("proxyRes", (proxyRes) => {
        patchSetCookieHeaders(proxyRes);
      });
    },
  };
}

function dycastSdkPlugin() {
  async function serveMssdk(_req, res) {
    try {
      const sdk = await readFile(dycastMssdkPath);
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.end(sdk);
    } catch (error) {
      res.statusCode = 500;
      res.end(`Failed to load dycast mssdk: ${error.message}`);
    }
  }

  return {
    name: "ai-live-dycast-sdk",
    configureServer(server) {
      server.middlewares.use("/dycast-mssdk.js", serveMssdk);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/dycast-mssdk.js", serveMssdk);
    },
    async closeBundle() {
      await copyFile(dycastMssdkPath, path.join(__dirname, "dist/dycast-mssdk.js"));
    },
  };
}

function douyinIdentityPlugin(douyinIdentity) {
  const files = ["signature.js", "request.ts", "dycast.ts"];
  return {
    name: "ai-live-douyin-identity",
    transform(code, id) {
      if (!id.includes(`${path.sep}dycast${path.sep}src${path.sep}core${path.sep}`)) {
        return null;
      }
      if (!files.some((name) => id.endsWith(name))) {
        return null;
      }
      let next = code.replace(/identity=audience/g, `identity=${douyinIdentity}`);
      next = next.replace(/identity:\s*['"]audience['"]/g, `identity: '${douyinIdentity}'`);
      if (next === code) return null;
      return { code: next, map: null };
    },
  };
}

function douyinParseLivePlugin() {
  const utilSuffix = `${path.sep}dycast${path.sep}src${path.sep}core${path.sep}util.ts`;
  return {
    name: "ai-live-douyin-parse-live",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes(utilSuffix)) return null;
      const next = patchParseLiveHtml(code);
      if (next !== code) return { code: next, map: null };
      return null;
    },
  };
}

function douyinSocketUrlPlugin() {
  const dycastSuffix = `${path.sep}dycast${path.sep}src${path.sep}core${path.sep}dycast.ts`;
  return {
    name: "ai-live-douyin-socket-url",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes(dycastSuffix)) return null;
      let next = patchSocketUrl(code);
      next = patchFetchConnectInfo(next);
      next = patchChatRtfContent(next);
      if (next !== code) return { code: next, map: null };
      return null;
    },
  };
}

function douyinImFetchPlugin() {
  const requestSuffix = `${path.sep}dycast${path.sep}src${path.sep}core${path.sep}request.ts`;
  return {
    name: "ai-live-douyin-im-fetch",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes(requestSuffix)) return null;
      const next = patchFetchImInfo(code);
      if (next !== code) return { code: next, map: null };
      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const douyinIdentityRaw = (env.DOUYIN_IDENTITY || env.VITE_DOUYIN_IDENTITY || "anchor").trim().toLowerCase();
  const douyinIdentity = douyinIdentityRaw === "audience" ? "audience" : "anchor";

  return {
    plugins: [
      react(),
      tailwindcss(),
      dycastSdkPlugin(),
      douyinIdentityPlugin(douyinIdentity),
      douyinParseLivePlugin(),
      douyinImFetchPlugin(),
      douyinSocketUrlPlugin(),
    ],
    define: {
      __DOUYIN_IDENTITY__: JSON.stringify(douyinIdentity),
    },
    resolve: {
      alias: {
        "@": path.join(dycastRoot, "src"),
      },
    },
    server: {
      port: 5173,
      fs: {
        allow: [__dirname, dycastRoot],
      },
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
        "/ws": {
          target: "ws://127.0.0.1:8000",
          changeOrigin: true,
          ws: true,
        },
        "/dylive": createDouyinProxyOptions({
          target: "https://live.douyin.com",
          rewrite: (requestPath) => requestPath.replace(/^\/dylive/, ""),
          referer: "https://live.douyin.com/",
        }),
        "/dyshort": createDouyinProxyOptions({
          target: "https://v.douyin.com",
          rewrite: (requestPath) => requestPath.replace(/^\/dyshort/, ""),
          referer: "https://www.douyin.com/",
        }),
        "/dyreflow": createDouyinProxyOptions({
          target: "https://webcast.amemv.com",
          rewrite: (requestPath) => requestPath.replace(/^\/dyreflow/, ""),
          referer: "https://live.douyin.com/",
        }),
        "/socket": {
          target: "wss://webcast100-ws-web-lq.douyin.com",
          changeOrigin: true,
          secure: true,
          ws: true,
          rewrite: (requestPath) => requestPath.replace(/^\/socket/, ""),
          configure: (proxy) => {
            proxy.on("proxyReqWs", (proxyReq, req) => {
              proxyReq.setHeader("Origin", "https://live.douyin.com");
              proxyReq.setHeader("Referer", "https://live.douyin.com/");
              const ua = req.headers["user-agent"] || "";
              if (/mobile|android|iphone|ipad/i.test(ua)) {
                proxyReq.setHeader("User-Agent", DESKTOP_UA);
              }
            });
          },
        },
      },
    },
  };
});
