# adminYH Desktop

`apps/desktop/web` 从 `frontend-template/web` 派生，保留模板的 shadcn/ui、布局封装、主题、i18n、`apiRequest`、`useResource`、懒加载和 chunk 兜底机制。

## 开发命令

```bash
cd apps/desktop/web
npm install
npm run dev
npm run lint
npm run build
npm run tauri:dev
```

## 结构

- `web/src/pages/Dashboard.tsx`: 桌面端导航外壳和页面注册入口。
- `web/src/pages/Workspace.tsx`: 宇涵物流工作台骨架。
- `web/src/pages/ResourceRegistry.tsx`: 旧模块、兼容 API 和负责人映射。
- `web/src/api/client.ts`: 统一 HTTP client，兼容 `{ code, data, message }` 与直接 JSON。
- `src-tauri`: Tauri 2 最小桌面壳，开发期加载 Vite，生产期加载 `web/dist`。
