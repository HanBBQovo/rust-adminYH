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

订单 CSV 导出在 Tauri 运行态会先调用 Rust command 打开系统保存对话框,写入所选
`.csv` 文件并打开导出目录；浏览器/Vite 运行态保留普通下载兜底。前端只能通过
`web/src/desktop/export.ts` 调用桌面能力,业务页面不得直接调用 Tauri 全局 API、
dialog/fs 插件或散写文件保存逻辑。

如果要连接内网或远端 API,打包时显式传入:

```bash
VITE_API_BASE_URL=https://admin-api.example.com/api ADMIN_YH_DESKTOP_DISABLE_SIDECAR=true npm run tauri:build:app
```

打包 `.app` 前必须先构建 release 版 API,并通过 Tauri `--config` 注入资源映射,
把仓库根目录的 `target/release/admin-api` 打进
`Contents/Resources/binaries/admin-api`:

```bash
cargo build --release -p admin-api
cd apps/desktop/web
npm run tauri:build:app -- --config '{"bundle":{"resources":{"../../../target/release/admin-api":"binaries/admin-api"}}}'
```

诊断开关:

- `ADMIN_YH_DESKTOP_DISABLE_SIDECAR=true`: 不启动本机 sidecar,用于远端 API 包。
- `ADMIN_YH_DESKTOP_ADMIN_API_BIN=/path/to/admin-api`: 指定本机 sidecar 二进制,用于开发/排障。
- sidecar 启动失败时,需要记录 `.app` 路径、sidecar 路径、`APP_HTTP__PORT`、`API_BASE_URL`、最近 stdout/stderr 和 `curl http://127.0.0.1:16824/api/health` 结果。

## 质量门禁

- 默认提交前：在仓库根目录运行 `scripts/check-all.sh`。
- 前端架构约束：`scripts/test-frontend.sh` 会自动运行 `scripts/test-frontend-architecture.mjs`，阻断页面直接请求、绕过 API 封装、业务层直接使用 Radix 原语和业务页散写 inline style。
- 前端交互改动：运行 `RUN_E2E=true scripts/test-frontend.sh`。
- E2E 共享封装：新增主页面验收用例时，必须复用 `web/e2e/support/*` 中的登录、会话、菜单、模板壳和旧列表响应 helpers，不要在 spec 内重复散写 token、菜单 mock 或旧响应结构。
- 桌面壳、图标、CSP、capability、打包配置改动：运行 `RUN_TAURI=true scripts/check-all.sh`。该门禁会先跑 Tauri sidecar runtime smoke 单测，覆盖禁用 sidecar、已有健康 API 跳过启动、缺失二进制诊断和 `/api/health` 等待成功，再构建 release `admin-api` sidecar，通过 Tauri `--config` 注入资源映射构建 `.app`，并校验 `Contents/Resources/binaries/admin-api` 存在且可执行。
- Tauri 发布候选：运行 `RUN_TAURI=true RUN_TAURI_SIDECAR_SMOKE=true TAURI_SIDECAR_DATABASE_URL=mysql://... scripts/check-all.sh`，使用可重建测试库启动 `.app` 内打包后的 `admin-api`，并验证 `http://127.0.0.1:16824/api/health`。如果本机 16824 已被占用，先停止占用进程，避免误把外部 API 当作 bundled sidecar 通过。
- macOS 安装包发布前：运行 `RUN_TAURI=true RUN_TAURI_DMG=true scripts/check-all.sh`。
- 桌面文件能力改动：至少运行 `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`、订单导出相关 Vitest 和 `scripts/test-tauri-contract.sh`，确认保存对话框、文件名清洗、CSV 后缀、目录打开和浏览器兜底都被覆盖。
- 真实迁移演练：配置 `OLD_DATABASE_URL`、`NEW_DATABASE_URL`，在影子库上运行 `scripts/test-migration.sh`；真实 apply 只允许测试库/影子库加 `MIGRATION_APPLY=true`。

## CI

GitHub Actions 位于 `.github/workflows/ci.yml`，开发期不会因 push/PR 自动触发。每个功能切片仍需本地跑完对应门禁后用 `[skip ci]` 提交并推送，等整体开发完成或需要发布候选时，再从 Actions 页面手动运行 `CI` workflow。

手动触发时默认执行：

- 后端 Rust fmt/check/clippy/test。
- 前端 lint/typecheck/Vitest/build。
- Playwright E2E。
- 迁移文档与迁移 crate 单测。

手动输入项控制重型发布门禁：

- `run_docker=true`：构建 API/Web Docker 镜像并执行 compose 健康检查。
- `run_docker_e2e=true`：在 Docker compose 后用 Playwright 连接 nginx Web + Rust API + MySQL 真实链路。
- `run_tauri=true`：构建 Tauri macOS `.app` 并上传 artifact。
- `run_tauri_dmg=true`：在 Tauri job 内额外生成 DMG。

DMG 生成依赖 macOS Finder/hdiutil 图形环境，作为 release-only 门禁处理，不在普通 PR 阻塞链路中默认执行。

## 结构

- `web/src/pages/Dashboard.tsx`: 桌面端导航外壳和页面注册入口。
- `web/src/pages/Workspace.tsx`: 宇涵物流工作台骨架。
- `web/src/pages/ResourceRegistry.tsx`: 旧模块、兼容 API 和负责人映射。
- `web/src/api/client.ts`: 统一 HTTP client，兼容 `{ code, data, message }` 与直接 JSON。
- `src-tauri`: Tauri 2 桌面壳，开发期加载 Vite，生产期加载 `web/dist`。
