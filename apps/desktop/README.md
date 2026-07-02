# adminYH Desktop

`apps/desktop/web` 从 `frontend-template/web` 派生，保留模板的 shadcn/ui、布局封装、主题、i18n、`apiRequest`、`useResource`、懒加载和 chunk 兜底机制。业务页面必须复用这些封装，不允许绕过模板散写样式、请求或权限逻辑。

## 开发命令

```bash
cd apps/desktop/web
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run tauri:dev
```

开发期 `/api` 由 Vite 代理到本机 Rust API,默认端口是 `16824`:

```bash
APP_HTTP__PORT=16824 cargo run -p admin-api
cd apps/desktop/web && npm run dev
```

Tauri 生产包不会内置 Vite 代理。当前桌面壳默认连接 `http://127.0.0.1:16824/api`,
并由 Rust 主进程从应用资源目录启动 `admin-api` sidecar。sidecar 只绑定
`127.0.0.1:16824`,不会向前端开放 shell/process/fs 权限。

如果要连接内网或远端 API,打包时显式传入:

```bash
VITE_API_BASE_URL=https://admin-api.example.com/api ADMIN_YH_DESKTOP_DISABLE_SIDECAR=true npm run tauri:build:app
```

打包 `.app` 前必须先构建 release 版 API,并通过 `TAURI_CONFIG` 注入资源映射,
把 `apps/desktop/src-tauri/target/release/admin-api` 打进
`Contents/Resources/binaries/admin-api`:

```bash
cd apps/desktop/src-tauri
cargo build --release -p admin-api
TAURI_CONFIG='{"bundle":{"resources":{"../target/release/admin-api":"binaries/admin-api"}}}' npm run tauri:build:app --prefix ../web
```

诊断开关:

- `ADMIN_YH_DESKTOP_DISABLE_SIDECAR=true`: 不启动本机 sidecar,用于远端 API 包。
- `ADMIN_YH_DESKTOP_ADMIN_API_BIN=/path/to/admin-api`: 指定本机 sidecar 二进制,用于开发/排障。
- sidecar 启动失败时,需要记录 `.app` 路径、sidecar 路径、`APP_HTTP__PORT`、`API_BASE_URL`、最近 stdout/stderr 和 `curl http://127.0.0.1:16824/api/health` 结果。

## 质量门禁

- 默认提交前：在仓库根目录运行 `scripts/check-all.sh`。
- 前端交互改动：运行 `RUN_E2E=true scripts/test-frontend.sh`。
- 桌面壳、图标、CSP、capability、打包配置改动：运行 `RUN_TAURI=true scripts/check-all.sh`。
- macOS 安装包发布前：运行 `RUN_TAURI=true RUN_TAURI_DMG=true scripts/check-all.sh`。
- 真实迁移演练：配置 `OLD_DATABASE_URL`、`NEW_DATABASE_URL`，在影子库上运行 `scripts/test-migration.sh`；真实 apply 只允许测试库/影子库加 `MIGRATION_APPLY=true`。

## CI

GitHub Actions 位于 `.github/workflows/ci.yml`，push/PR 到 `main` 会执行：

- 后端 Rust fmt/check/clippy/test。
- 前端 lint/typecheck/Vitest/build。
- Playwright E2E。
- 迁移文档与迁移 crate 单测。
- Tauri macOS `.app` 打包并上传 artifact。

DMG 生成依赖 macOS Finder/hdiutil 图形环境，作为 release-only 门禁处理，不在普通 PR 阻塞链路中默认执行。

## 结构

- `web/src/pages/Dashboard.tsx`: 桌面端导航外壳和页面注册入口。
- `web/src/pages/Workspace.tsx`: 宇涵物流工作台骨架。
- `web/src/pages/ResourceRegistry.tsx`: 旧模块、兼容 API 和负责人映射。
- `web/src/api/client.ts`: 统一 HTTP client，兼容 `{ code, data, message }` 与直接 JSON。
- `src-tauri`: Tauri 2 桌面壳，开发期加载 Vite，生产期加载 `web/dist`。
