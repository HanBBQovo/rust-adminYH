# adminYh Rust + Tauri 重构规划

日期：2026-07-01  
范围：旧前端 `/Users/hanhan/Desktop/code/adminYh`、旧后端 `/Users/hanhan/Desktop/code/adminYh-server`、新前端模板 `/Users/hanhan/Desktop/code/frontend-template`

## 1. 目标与原则

### 目标

- 将旧的“宇涵物流订单系统”重构为 Rust + Tauri 桌面应用。
- 保证旧 MySQL 数据可完整迁移、可回滚、可校验。
- 前端以 `frontend-template/web` 为视觉和工程基线，风格、布局、组件体系全部按模板重做。
- 后端从 Koa + 手写 SQL 重构为强类型 Rust 服务，保留旧业务语义和必要接口兼容。
- Electron 相关能力全部迁到 Tauri，旧 Electron/Vue CLI 体系不继续沿用。

### 重构原则

- 数据优先：先固化旧库表结构、数据字典、迁移校验脚本，再动业务重写。
- 兼容优先：第一阶段尽量保持旧字段名和返回结构可映射，避免前后端同时大范围失控。
- 安全优先：删除明文密码缓存、修复 SQL 注入、统一鉴权和权限校验。
- 模板优先：前端不迁移 Element Plus/Vue 组件，只迁移业务配置、字段和交互逻辑。
- 封装优先：前后端必须沉淀稳定的公共封装，业务页面和业务 handler 不直接散写请求、SQL、样式、错误处理、权限判断，保证后续维护和修改集中可控。
- 测试优先：按大项目标准建立自动化测试、迁移对账、端到端验收和发布前检查清单；任何核心模块完成后都必须经过测试闭环，不能只靠手工点页面。
- 可审计优先：所有迁移步骤必须有 dry-run、行数校验、关键字段抽样、迁移日志。

### Git 与交付规范

- Git 远程固定为 `https://github.com/HanBBQovo/rust-adminYH.git`，本地仓库初始化后必须设置 `origin` 指向该地址。
- 开发分支按功能拆分提交，不把文档、测试脚手架、后端业务实现、前端页面实现混在同一个 commit。
- 每完成一个独立功能必须立即执行：格式/语法检查 → `git status` 复核 → commit → push。
- 推荐提交粒度：
  - `docs: document git and rebuild workflow`
  - `test: add quality gate scripts`
  - `docs: add migration and api compatibility drafts`
- 提交前必须确认未改动不在当前任务范围内的目录；本轮文档/测试脚手架只允许改 `docs/`、`scripts/` 和必要的 Git 配置。
- push 失败时不得伪造完成状态，必须记录失败原因、当前 commit hash、远程地址和下一步处理建议。

### 测试与质量红线

- 每个功能完成后必须测试，不允许“先做完最后再补测试”；测试缺失视为功能未完成。
- 每次 commit 前必须至少跑通当前可执行质量门禁：`scripts/check-all.sh`；涉及前端交互的功能必须额外执行 `RUN_E2E=true scripts/test-frontend.sh` 或等价 Playwright 命令；涉及桌面壳、打包配置、图标、权限或发布产物的功能必须执行 `RUN_TAURI=true scripts/check-all.sh`。`RUN_TAURI=true` 默认验证可启动的 macOS `.app` 产物；发布 macOS 安装包前必须额外执行 `RUN_TAURI=true RUN_TAURI_DMG=true scripts/check-all.sh` 验证 DMG。若 DMG 因本机 GUI/Finder/hdiutil 环境失败，必须记录失败原因，并以 `.app` 打包通过作为替代验证，不能伪造 DMG 已通过。
- 后端核心逻辑必须做到单元测试 + API 集成测试双覆盖；数据库 repository 和迁移逻辑必须在测试库/影子库跑对账验证。
- 前端页面不能只看构建成功，必须覆盖 lint、类型检查、组件/交互测试、关键 E2E；涉及模板样式时还要人工/截图验收是否偏离 `frontend-template`。
- 前端 E2E 起步覆盖登录壳、成功登录、菜单加载、工作台关键数据、范围切换和退出登录；后续每新增一个主页面，至少补一个“进入页面 + 列表加载/空态/错误态”的 Playwright 用例。
- 上传类接口必须前后端双校验；头像上传后端必须拒绝未登录、非 `avatar` 字段、空文件、非 jpg/png MIME/扩展名和超过 500kb，不能只依赖前端表单校验。
- 数据迁移必须做到 dry-run、apply、verify、rollback-plan 四段式闭环，且对账通过后才允许切换真实数据。
- 所有 bug 修复都要先补可复现测试或校验脚本，再修实现，避免后续重构回归。

## 2. 旧系统审计结论

### 2.1 旧前端 adminYh

旧前端是 Vue 3 + Vue CLI 4 + TypeScript + Vuex + Vue Router + Element Plus beta 项目，后来叠加 Electron 打包能力。依赖和脚本见 `/Users/hanhan/Desktop/code/adminYh/package.json`。

核心模块：

- 登录/RBAC：`/login` 登录后获取 `userInfo` 和 `userMenus`，菜单决定动态路由。
- 系统管理：用户、角色、菜单。
- 订单管理：发货公司、运单。
- 回单管理：全部回单、未回收、已回收。
- 工作台/统计：订单总数、运费、公司数、回单数。

重要实现：

- 路由入口：`src/router/index.ts`
- 动态菜单转路由：`src/utils/map-menus.ts`
- 登录状态：`src/store/login/login.ts`
- 通用 CRUD 状态：`src/store/main/system/system.ts`
- 请求封装：`src/service/index.ts`、`src/service/request/index.ts`
- 配置驱动页面：`src/components/page-content`、`src/components/page-search`、`src/components/page-modal`
- 旧业务页面配置：`src/views/main/**/config/*.ts`

保留价值：

- 业务字段定义。
- 列表/搜索/弹窗配置驱动思路。
- 订单导出字段。
- 回单状态流转逻辑。
- 菜单权限模型。

废弃内容：

- Vue CLI、Vuex、Vue Router 动态 `require.context`、Element Plus beta。
- Electron `background.ts`、`preload.ts`、`vue-cli-plugin-electron-builder`。
- `dist/`、`node_modules/`、旧构建产物。
- localStorage 明文保存密码逻辑。

主要风险：

- 登录页“记住密码”会把明文密码写入 localStorage。
- token 直接放 localStorage，且登出未完整清理 `userInfo/userMenus/name/password`。
- 前端只做菜单级权限，没有按钮级权限。
- `firstMenu.url` 在菜单为空时可能崩溃。
- Axios 只有部分列表请求处理 `code === -200`，没有统一 401/失效处理。

### 2.2 旧后端 adminYh-server

旧后端是 Node.js + Koa + mysql2 + jsonwebtoken + koa-multer。依赖和启动脚本见 `/Users/hanhan/Desktop/code/adminYh-server/package.json`。

入口和配置：

- 入口：`index.js`
- Koa app：`src/app/index.js`
- 环境配置：`src/app/config.js`
- MySQL 连接：`src/app/database.js`
- RSA key：`src/app/keys/private.key`、`src/app/keys/public.key`

后端存在一个明显配置问题：`src/app/database.js` 使用 `config.MYSQL_PROT`，而 `.env` 是 `MYSQL_PORT`。如果线上旧服务能运行，可能依赖默认端口或历史环境变量；新系统必须修正为显式 `MYSQL_PORT`。

核心 API：

- Auth：`POST /login`、`GET /code`
- Chart：`GET /chart/headerList`、`GET /chart/company/order/count`、`GET /chart/company/order/sumfreight`、`GET /chart/company/receipt/sumreceipt`
- User：`POST /users`、`DELETE /users/:userId`、`PATCH /users/:userId`、`PATCH /users/:userId/password`、`GET /users/:userId`、`POST /users/list`、`GET /users/:userId/avatar`
- Role：`POST /role`、`DELETE /role/:roleId`、`PATCH /role/:roleId`、`GET /role/:roleId`、`POST /role/list`、`POST /role/assign`、`GET /role/:roleId/menu`、`GET /role/:roleId/menuIds`
- Menu：`POST /menu`、`GET /menu/tree`
- Company：`POST /company`、`DELETE /company/:companyId`、`PATCH /company/:companyId`、`GET /company/:companyId`、`POST /company/list`
- Order：`POST /order`、`DELETE /order/:orderId`、`PATCH /order/:orderId`、`GET /order/:orderId`、`POST /order/list`
- Receipt：`POST /receipt/list`、`PATCH /receipt/:receiptId`、`POST /notrecovery/list`、`POST /recovery/list`
- Upload：`POST /upload/avatar`
- Memory：`POST /memory/list`

旧后端主要问题：

- 大量 SQL 使用字符串拼接，存在 SQL 注入风险。
- 登录密码是无 salt MD5；验证码接口存在，但登录验证码校验已被注释，不能按“已有强验证码登录”设计新系统。
- 管理权限硬编码为 `user_role.role_id == 1`，不是完整 RBAC policy。
- RBAC 分配角色菜单时只插入 `role_permission`，没有先删除旧关系，可能重复或残留。
- 旧系统删除订单只删 `order_list`，新系统已明确改为事务级联清理 `company_order` 和安全匹配的 `receipt`，防止新数据继续产生孤儿关系。
- 文件上传直接 `fs.unlinkSync` 删除旧头像，缺少文件存在判断。
- 用户 ID `58` 被硬编码为不可删除管理员。
- token 写入 `user.token`，多人登录会使旧 token 失效；这是业务语义，需要明确是否保留。
- `memory.controller` 返回不带 `code`，与其它接口不一致。
- 仓库内没有 `.sql`、migration、schema、Dockerfile、docker-compose、pm2 或 README；真实表结构必须从线上/旧库 `information_schema` 导出，代码反推只能作为辅助。
- 头像文件在本地 `uploads/avatar`，文件名由 `Date.now() + 原扩展名` 生成；迁移必须同时迁数据库和磁盘文件。

### 2.3 frontend-template

模板是 React 19 + Vite 6 + TypeScript 5.6 + Tailwind 3 + shadcn/ui + Radix + lucide-react + motion + recharts。

核心约定：

- 以 `frontend-template/web` 作为前端基线。
- `src/App.tsx` 只做鉴权门。
- `src/pages/Dashboard.tsx` 提供侧栏、顶栏、主题切换、退出登录、移动端抽屉。
- 不默认引入 react-router；内部后台页面少、无深链时用 `useState<Page>` 切页。
- 网络请求统一走 `src/api/client.ts` 的 `apiRequest`。
- 页面布局使用 `PageShell`、`PageSurface`、`DataTableToolbar`、`FilterBar`、`FormSection`、`FormField`。
- 主题只改 `src/index.css` token，不在业务页散写大量颜色。

新项目必须继承：

- `components/ui/*`
- `components/layout/*`
- `lib/*`
- `theme`、`i18n`
- `api/client.ts` 模式
- `ChunkLoadBoundary`、`PageLoader`

## 3. 推荐新技术栈

### 3.1 桌面壳

- Tauri 2.x
- Rust stable
- Tauri plugins：
  - `tauri-plugin-shell`：必要时调用系统能力。
  - `tauri-plugin-dialog`：导出 Excel、选择保存路径。
  - `tauri-plugin-fs`：受控文件读写。
  - `tauri-plugin-opener`：打开文件或目录。
  - `tauri-plugin-store` 或系统 keychain 插件：保存非敏感偏好；敏感 token 优先使用后端会话或安全存储。

定位：

- Tauri 负责窗口、桌面文件能力、打包、自动更新预留。
- 业务 API 不建议直接塞进 Tauri command 里，除非项目确定只做单机本地数据库。
- 当前旧系统有 MySQL 后端和多用户/RBAC，更适合“前端 Tauri + Rust HTTP API 服务 + MySQL”的架构。

### 3.2 Rust 后端

推荐：

- Web 框架：Axum
- 异步运行时：Tokio
- 数据库：MySQL 8 兼容
- 数据访问：SQLx
- 迁移：SQLx migrations
- 序列化：Serde
- 配置：config + dotenvy
- 鉴权：jsonwebtoken 或 biscuit/jose 方案；保留 RS256 也可以，但建议统一 key 管理
- 密码：argon2 新密码；旧密码兼容层按旧算法验证后升级
- 校验：validator
- 日志/链路：tracing + tracing-subscriber
- 错误：thiserror + anyhow
- OpenAPI：utoipa + Swagger UI，仅开发/内网启用
- Excel 导出：前端生成 CSV/XLSX 或 Rust 使用 rust_xlsxwriter

为什么不用 ORM：

- 旧系统 SQL 查询多、字段命名不规范、JSON 聚合和兼容字段较多。
- SQLx 能保留 SQL 可读性，同时提供编译期/运行期类型校验。
- 后续可以在稳定后再抽 repository/service 层，不需要一开始引入重 ORM。

### 3.3 前端

严格使用 `frontend-template/web`：

- React 19
- Vite 6
- TypeScript 5.6
- Tailwind 3
- shadcn/ui + Radix
- lucide-react
- motion
- recharts
- fetch API + `apiRequest`

不建议引入：

- Element Plus
- Vue/Vuex/Vue Router
- Ant Design
- Redux
- React Router，除非确认需要 URL 深链、浏览器前进后退、外链到具体页面。

可选：

- 若列表缓存和并发请求显著复杂，再引入 TanStack Query；第一阶段按模板 `useResource` 即可。

### 3.4 数据库

第一阶段仍使用 MySQL，原因：

- 旧系统已经是 MySQL。
- 旧 SQL 使用 MySQL JSON 函数。
- 完整迁移风险最低。

不建议第一阶段改 PostgreSQL/SQLite：

- 跨数据库迁移会引入类型、日期、JSON、字符集、大小写和自增行为差异。
- 用户要求“之前数据库的数据能完全迁移过去”，因此第一阶段应优先同库升级。

## 4. 新项目目录规划

建议在 `/Users/hanhan/Desktop/code/rust-adminYH` 内组织为：

```text
rust-adminYH/
  docs/
    rebuild-plan.md
    database-migration.md
    api-compatibility.md
  apps/
    desktop/                 # Tauri app
      src-tauri/
      web/                   # 从 frontend-template/web 派生
  crates/
    admin-api/               # Axum HTTP API
    admin-core/              # 领域模型、DTO、权限、错误类型
    admin-db/                # SQLx pool、repository、migrations
    admin-migration/         # 旧库迁移/校验 CLI
  scripts/
    db/
      export_old_schema.sh
      migrate_dry_run.sh
      verify_counts.sh
  .env.example
  Cargo.toml                 # workspace
```

如果希望部署为单二进制，也可以让 `admin-api` 提供 API，Tauri 只打包前端资源；开发期 Tauri/Vite 访问 `http://127.0.0.1:<port>/api`。

## 5. 数据迁移方案

### 5.1 旧库核心表

从旧 SQL 和服务层可确认至少有这些表：

- `user`
- `role`
- `user_role`
- `permission`
- `role_permission`
- `company`
- `order_list`
- `company_order`
- `receipt`
- `avatar`
- `memory`

核心字段来自旧服务层：

- `user`：`id`、`name`、`password`、`token`、`avatar_url`、`enable`、`createAt`、`updateAt`
- `role`：`id`、`name`、`intro`、`createAt`、`updateAt`
- `user_role`：`user_id`、`role_id`
- `permission`：`id`、`pid`、`name`、`type`、`url`、`icon`、`sort`、`createAt`、`updateAt`
- `role_permission`：`role_id`、`permission_id`
- `company`：`id`、`name`
- `order_list`：`id`、`oddnumber`、`billingAt`、`consignee`、`consigneephone`、`address`、`method`、`goodsname`、`number`、`pack`、`weight`、`measurement`、`cainsurance`、`value`、`insurance`、`consignor`、`consignorphone`、`freight`、`delivery`、`sumfreight`、`freightstate`、`paynow`、`paygo`、`payback`、`paymonth`、`receiptnum`、`company`、`remarks`
- `company_order`：`com_name`、`order_id`
- `receipt`：`id`、`oddnumber`、`billingAt`、`recoverystate`、`issuestate`、`poststate`、`recoverynumber`、`consignor`、`consignee`、`goodsname`、`goodsnumber`
- `avatar`：`filename`、`mimetype`、`size`、`user_id`
- `memory`：`name`

旧系统还有几个迁移时必须保留的隐式语义：

- `user.password` 是 MD5 字符串；新系统不能直接改 Argon2 后丢弃兼容，否则旧用户无法无感登录。
- `order_list.billingAt` 和 `receipt.billingAt` 在旧代码里按 `dayjs(...).valueOf()` 处理，是毫秒时间戳语义，不要误建成秒级时间。
- `receipt.recoverystate/issuestate/poststate` 使用中文状态文本，迁移前必须对真实库跑 `SELECT DISTINCT` 固化实际枚举值。
- `company_order` 用 `com_name` 文本关联公司，`receipt` 用 `oddnumber` 文本弱关联订单；不能在第一版迁移中直接强行改为纯 ID 模型。
- 默认头像为 `default.jpg`，旧常量里 MIME 是 `image/jpeg`，默认大小为 `37622`。

### 5.2 迁移路线

阶段 0：冻结和备份

- 只读导出旧库 schema：`mysqldump --no-data`
- 导出旧库数据：`mysqldump --single-transaction --routines --triggers`
- 记录 MySQL 版本、字符集、排序规则、时区、表行数、最大 ID。
- 复制 `uploads/avatar` 全量文件并记录 hash。
- 从 `information_schema.COLUMNS/STATISTICS/KEY_COLUMN_USAGE` 导出字段、索引、约束；不能只依赖代码反推。
- 对每张表记录 `COUNT(*)`、`MIN/MAX(id)`、关键时间字段 `MIN/MAX`。

阶段 1：还原到影子库

- 在本地或测试 MySQL 创建 `admin_yh_shadow`。
- 导入旧 dump。
- 跑完整行数、关键字段、外键关系、孤儿数据扫描。
- 不直接在生产旧库上试迁移。

阶段 2：新 schema 设计

第一版建议采用“兼容 schema + 增强约束”：

- 保留旧表名和旧字段名，降低迁移风险。
- 新增必要索引和唯一约束。
- 对易错字段建立枚举约束或应用层校验。
- 暂不大规模改列名；前端 DTO 可以用更清晰命名。

建议新增索引：

- `user.name`
- `user_role.user_id`、`user_role.role_id`
- `role_permission.role_id`、`role_permission.permission_id`
- `permission.pid`、`permission.type`、`permission.sort`
- `order_list.oddnumber`
- `order_list.billingAt`
- `order_list.company`
- `order_list.consignee`
- `order_list.consignor`
- `receipt.oddnumber`
- `receipt.billingAt`
- `receipt.recoverystate`
- `company.name`
- `memory.name`

阶段 3：数据清洗

只在影子库生成清洗报告，不直接覆盖：

- 重复 `user.name`
- 重复 `company.name`
- 重复 `order_list.oddnumber`
- `company_order.order_id` 找不到 `order_list.id`
- `receipt.oddnumber` 找不到 `order_list.oddnumber`
- `user_role.user_id` / `role_id` 孤儿数据
- `role_permission.role_id` / `permission_id` 孤儿数据
- `avatar.user_id` 找不到用户
- 空字符串和 null 混用字段
- 日期字段非法或时区异常

阶段 4：迁移执行

- 写 `admin-migration` CLI：
  - `inspect-old`
  - `migrate --dry-run`
  - `migrate --apply`
  - `verify`
  - `rollback-plan`
- 每张表按事务批量迁移。
- 关键表迁移后立即校验行数、最大 ID、抽样 hash。
- 文件迁移单独处理：头像文件复制到新存储目录，数据库保留文件名和 MIME。
- 建议迁移顺序：`role` -> `permission` -> `user` -> `company` -> `memory` -> `avatar` -> `user_role` -> `role_permission` -> `order_list` -> `company_order` -> `receipt` -> 头像文件校验 -> 业务汇总对账。

阶段 5：双跑验收

- 新旧系统同时连影子库或复制库。
- 对相同筛选条件比较列表总数和关键字段。
- 对相同用户比较登录、菜单、权限。
- 对订单创建/编辑/删除、回单状态变更做回归。

### 5.3 数据完整性验收标准

必须全部通过：

- 旧表和新表行数一致，除明确废弃临时表外。
- 每张表最大 ID 一致或映射表完整。
- `order_list` 总运费求和一致。
- `order_list` 的 `SUM(receiptnum)` 一致。
- `receipt` 按 `recoverystate/issuestate/poststate` 分组计数一致。
- `company_order` 与 `order_list` 关联完整。
- 用户、角色、菜单权限关联完整。
- 头像文件数量、hash、可访问性一致。
- 随机抽样 50 条订单、50 条回单、10 个用户详情字段一致。
- 用户角色分布、菜单根/子节点数量一致。

## 6. 后端重构设计

### 6.1 分层

```text
admin-api
  routes/
  handlers/
  middleware/
  state.rs

admin-core
  dto/
  domain/
  auth/
  permissions/
  error.rs

admin-db
  repositories/
  migrations/
  pool.rs

admin-migration
  main.rs
```

### 6.1.1 后端封装规范

后端必须按“路由层 -> handler 层 -> service 层 -> repository 层 -> database 层”封装，不允许把 SQL、权限判断、业务规则直接写在 handler 里。

强制规范：

- 路由层只负责 path/method/middleware 组合。
- handler 层只负责参数提取、调用 service、返回统一响应。
- service 层承载业务规则，例如创建订单后写 `company_order`、可选创建 `receipt`、写 `memory`。
- repository 层只负责数据库读写，所有 SQL 必须参数化。
- database 层统一管理 SQLx pool、事务、分页参数、迁移。
- auth/permission 独立封装，业务模块只能调用统一权限接口，不能硬编码 `role_id == 1`。
- error/response 独立封装，所有 API 返回统一结构，不允许每个 handler 自己拼错误格式。
- validation 独立封装，新增/编辑订单、用户、角色、回单状态必须走 DTO 校验。
- logging/request-id 独立封装，便于定位桌面端和 API 问题。

推荐后端模块边界：

```text
crates/admin-api/src/
  routes/          # 只定义路由
  handlers/        # HTTP 入参/出参
  middleware/      # 鉴权、权限、request-id、错误转换
  response.rs      # ApiResponse / ApiError -> HTTP

crates/admin-core/src/
  dto/             # 请求/响应 DTO
  domain/          # 领域类型、枚举、状态
  services/        # 业务服务 trait/实现
  auth/            # token、密码、session、权限能力
  error.rs

crates/admin-db/src/
  repositories/    # SQLx 查询封装
  migrations/      # SQLx migration
  transaction.rs   # 事务封装
  pagination.rs
  pool.rs
```

禁止事项：

- 禁止 handler 里直接写 SQL。
- 禁止字符串拼接 SQL 条件。
- 禁止在多个模块重复实现分页、排序、状态枚举转换。
- 禁止把旧系统的弱逻辑原样散落复制；兼容逻辑必须集中在 service 或 compatibility 模块。
- 禁止业务代码直接读取环境变量，配置必须通过统一 `AppConfig` 注入。

### 6.2 领域模块

- `auth`：登录、退出、token 校验、验证码可选。
- `users`：用户 CRUD、密码修改、头像。
- `roles`：角色 CRUD、分配菜单、菜单 ID 查询。
- `menus`：菜单树、创建菜单。
- `companies`：发货公司 CRUD、公司订单数。
- `orders`：运单 CRUD、订单列表、导出。
- `receipts`：回单列表、未回收、已回收、状态更新。
- `dashboard`：统计卡片、公司订单数、运费、回单数。
- `memory`：收货人/发货人记忆词条。
- `files`：头像文件读取和上传。

### 6.3 API 兼容策略

第一阶段保留 `/api` 前缀下的旧路径：

- 前端模板开发代理默认 `/api`，Rust 服务暴露 `/api/login`、`/api/users/list` 等。
- 新 API 可以内部按 REST 风格组织，但外部兼容旧路径，减少前端迁移压力。
- 返回结构保留 `{ code, data, message }`，同时 HTTP status 正确表达 401/403/500。

建议统一错误：

```json
{
  "code": -200,
  "message": "无效的token或登录已失效！请重新登录~",
  "data": null
}
```

中期可以过渡到：

```json
{
  "ok": false,
  "error": {
    "code": "AUTH_TOKEN_EXPIRED",
    "message": "登录已失效"
  }
}
```

但不建议第一阶段同时改前后端协议。

### 6.4 安全修复

- 所有 SQL 改为参数化，禁止字符串拼接 LIKE。
- 密码哈希升级到 Argon2。
- 旧密码兼容：
  - 旧库密码是无 salt MD5，登录时先用旧 MD5 验证。
  - 验证成功后立即重写为 Argon2。
- token 不再只依赖前端 localStorage。
- 保留“单用户单 token”语义需明确：
  - 方案 A：继续在 `user.token_version` 或 session 表控制单点登录。
  - 方案 B：允许多端登录，用 session 表管理。
- 后端实现角色/菜单权限校验，前端只负责展示。
- 文件上传限制 MIME、大小、扩展名，文件名由服务端生成。

## 7. 前端重构设计

### 7.1 基线

从 `frontend-template/web` 派生到 `apps/desktop/web`。

保留：

- `src/components/ui`
- `src/components/layout`
- `src/lib`
- `src/components/theme*`
- `src/i18n`
- `src/api/client.ts`
- `src/main.tsx`
- `src/App.tsx` 的鉴权门思想

替换：

- 示例 `Overview.tsx`、`Settings.tsx`
- 示例 `api/demo.ts`
- `BRAND_NAME`、`STORAGE_NAMESPACE`

### 7.1.1 前端模板与封装规范

前端必须严格按照 `frontend-template/web` 的架构、视觉和组件规范开发。新业务页面只能使用模板已有的 layout、ui、theme、api、toast、confirm、resource 封装；不允许为了单个页面随意自建风格、散写大段 CSS 或引入另一套 UI 体系。

强制规范：

- 页面必须使用模板的 `PageShell`、`PageSurface`、`DataTableToolbar`、`FilterBar`、`FormSection`、`FormField` 等组合组件。
- 基础控件必须优先使用 `src/components/ui/*`，包括 Button、Input、Select、Dialog、Table、Badge、Tabs、Tooltip、Pagination 等。
- 所有接口请求必须封装在 `src/api/<domain>.ts`，页面禁止直接 `fetch`、禁止直接拼 URL。
- 所有请求必须走 `apiRequest`，由它统一处理 `/api` 前缀、token、request-id、错误结构和日志。
- 列表数据加载必须优先使用模板的 `useResource` 或后续统一的数据 hook，不允许每个页面重复手写 loading/error/refresh。
- 危险操作必须走 `useConfirm`，成功/失败反馈必须走全局 toast，不允许直接 `window.confirm` / `alert`。
- 主题、颜色、圆角、阴影、字体必须从模板 token 和语义 class 获取；业务页面不得散写大段 hex 色值、box-shadow、border、font-family。
- 图标统一使用 `lucide-react`，不要混用其它图标库。
- 图表统一使用模板内的 recharts/chart 封装，不直接迁移旧 ECharts 风格。
- 页面导航先通过 Dashboard 的 `navItems` / page registry 管理，后端菜单只做权限过滤，不动态 import 任意路径。

推荐前端业务目录：

```text
src/
  api/
    auth.ts
    dashboard.ts
    users.ts
    roles.ts
    menus.ts
    companies.ts
    orders.ts
    receipts.ts
    memory.ts
    files.ts
  features/
    auth/
    dashboard/
    system/
    orders/
    receipts/
  components/
    layout/         # 来自模板，只做必要扩展
    ui/             # 来自模板，不随意改风格
  lib/
    formatters.ts
    use-resource.ts
    validators.ts
    permissions.ts
```

禁止事项：

- 禁止引入 Element Plus、Ant Design、Bootstrap 或另一套 UI 风格。
- 禁止从旧 Vue 页面复制样式到 React 页面。
- 禁止页面内写大块内联样式或临时 CSS class 来绕过模板规范。
- 禁止业务组件直接操作 localStorage；必须通过 `config/nsKey`、auth client 或统一 store/hook。
- 禁止每个页面各自实现表格、分页、弹窗、筛选、错误态；必须复用模板封装。
- 禁止为了快速完成页面而破坏模板暗色模式、响应式布局、字体和间距体系。

### 7.2 页面规划

建议页面 union：

```ts
type Page =
  | 'dashboard'
  | 'orders'
  | 'companies'
  | 'receipts'
  | 'receipts-unrecovered'
  | 'receipts-recovered'
  | 'users'
  | 'roles'
  | 'menus'
  | 'settings'
```

导航分组：

- 数据概览
  - 工作台
- 订单管理
  - 运单管理
  - 发货公司
- 回单管理
  - 全部回单
  - 未回收
  - 已回收
- 系统管理
  - 用户管理
  - 角色管理
  - 菜单管理
- 系统设置

如果后续要保留后端动态菜单：

- 后端返回菜单树。
- 前端有静态 `pageRegistry`，用菜单 URL 或 permission code 映射页面。
- 不再动态 import 任意路径，避免旧 `require.context` 风险。

### 7.3 业务 API 文件

```text
src/api/auth.ts
src/api/dashboard.ts
src/api/users.ts
src/api/roles.ts
src/api/menus.ts
src/api/companies.ts
src/api/orders.ts
src/api/receipts.ts
src/api/memory.ts
src/api/files.ts
```

页面禁止直接 `fetch`，只调用上述类型化函数。

### 7.4 UI 规范

列表页统一：

- `PageShell`
- `PageSurface`
- `DataTableToolbar`
- `FilterBar`
- `Table`
- `Pagination`
- `EmptyState`
- `ErrorState`

表单统一：

- `Dialog` 或 `Sheet`
- `FormSection`
- `FormField`
- `Input`
- `Select` / `Combobox` / `MultiSelect`
- `useConfirm`
- `useGlobalToast`

图表统一：

- `recharts`
- 模板 chart token
- 不直接搬 ECharts。

导出：

- 小数据前端生成 CSV/XLSX。
- 大数据走 Rust API 流式导出或 Tauri command 保存。

## 8. Tauri 集成设计

### 8.1 开发模式

- Vite dev server：`http://localhost:5278`
- Rust API：`http://127.0.0.1:16824`
- Tauri 加载 Vite 页面。
- Vite `/api` 代理到 Rust API。

### 8.2 生产模式

两种方案：

方案 A：桌面壳 + 远端/本机 API 服务

- Tauri 只打包前端。
- Rust API 独立部署或本机服务启动。
- 适合多人协作和共享 MySQL。

方案 B：Tauri 启动内嵌 Rust API

- Tauri 启动时拉起本地 Axum server。
- 前端访问 `127.0.0.1:<port>/api`。
- 适合单机部署，但仍可连远端 MySQL。

当前建议方案 B，用于桌面体验；同时保留 API 独立运行能力，方便部署和测试。

### 8.3 桌面能力边界

放到 Tauri/Rust：

- 选择文件保存路径。
- 导出订单 Excel。
- 打开导出目录。
- 头像文件本地读取/缓存。
- 后续自动更新。

不放到 Tauri：

- 用户权限判断。
- 订单/回单核心业务规则。
- 数据库迁移主流程。迁移应是独立 CLI，可被 Tauri 调用但不能只存在于前端。

## 9. 分阶段实施计划

### Phase 0：审计和冻结

- 导出旧库 schema 和数据。
- 扫描旧库实际表结构、索引、字符集、行数。
- 固化旧 API 清单和字段字典。
- 建立影子库。

产物：

- `docs/database-migration.md`
- `docs/api-compatibility.md`
- 旧库 dump 和校验报告。

### Phase 1：工程骨架

- 初始化 Cargo workspace。
- 创建 `admin-api`、`admin-core`、`admin-db`、`admin-migration`。
- 从 `frontend-template/web` 派生前端。
- 初始化 Tauri 2。
- 打通 `/api/health`。
- 建立测试基线：Rust `cargo test`、前端 `npm run lint && npm run build`、API 集成测试、Playwright E2E、迁移校验脚本全部接入脚本化命令。

验收：

- `cargo check`
- `cargo test`
- `npm run build`
- `npm run lint`
- Tauri dev 能打开模板页面并访问 Rust health API。

### Phase 2：数据库层和迁移 CLI

- SQLx 连接 MySQL。
- 写兼容 schema migrations。
- 写旧库 inspect/dry-run/verify。
- 迁移 `user/role/permission` 和权限关系。
- 迁移 `company/order_list/receipt/company_order/memory/avatar`。

验收：

- 影子库全量迁移通过。
- 行数、抽样、关联完整性校验通过。

### Phase 3：鉴权和系统管理

- 登录、退出、当前用户、菜单权限。
- 用户 CRUD。
- 角色 CRUD + 分配菜单。
- 菜单树。
- 前端登录页、主布局、系统管理页面。

验收：

- 旧管理员可登录。
- 菜单和权限与旧系统一致。
- 不再明文保存密码。

### Phase 4：订单和回单

- 公司 CRUD。
- 运单 CRUD、查询、分页、导出。
- 创建订单自动创建回单和 memory。
- 回单列表、未回收、已回收、状态更新。

验收：

- 同筛选条件下，新旧列表数量一致。
- 创建/编辑订单后的 `order_list/company_order/receipt/memory` 行为与旧系统一致或按新规则明确修正。

### Phase 5：看板和桌面能力

- 统计卡片。
- 公司订单数/运费/回单图表。
- 头像上传和读取。
- Tauri 导出文件保存。
- 打包配置。

验收：

- macOS 本地可安装运行。
- 常用操作不依赖浏览器。

### Phase 6：切换和回滚

- 生产旧库最终备份。
- 迁移到新库。
- 新系统只读验收。
- 短暂停写切换。
- 保留旧系统回滚窗口。

### Phase 7：测试、验收和发布门禁

- 跑完整自动化测试矩阵。
- 跑旧库到新库迁移 dry-run 和 apply 后 verify。
- 跑关键业务 E2E：登录、菜单、用户、角色、公司、订单、回单、头像、导出。
- 跑权限回归：普通用户不能访问管理接口，管理员可以执行管理操作。
- 跑兼容回归：旧 API 路径、旧响应结构、旧字段名映射。
- 跑桌面端打包验证：Tauri dev、Tauri build、安装包启动、导出文件、打开目录。
- 生成发布验收报告，所有阻断项清零后才能切换。

## 10. 风险清单

| 风险 | 影响 | 处理 |
|---|---|---|
| 旧库没有 migration 文件 | 无法确认真实 schema | 先 dump schema，以实际库为准 |
| SQL 注入历史数据异常 | 迁移时可能出现脏数据 | 影子库扫描并出清洗报告 |
| 密码算法不明确 | 旧用户无法登录 | 审计 `password-handle.js`，做兼容验证 |
| 旧 token 存在 `user.token` | 新旧会话语义不一致 | 明确单点登录或多端登录策略 |
| 菜单 URL 与前端页面绑定 | 新 React 页面无法直接动态 import | 建静态 pageRegistry 映射 |
| 订单删除/回单联动不可靠 | 数据一致性风险 | 新系统显式事务处理并保留兼容策略 |
| 头像文件与 DB 不一致 | 用户头像丢失 | hash 清单 + 缺失文件 fallback |
| 日期格式/时区差异 | 查询结果不一致 | MySQL/session/Rust 全部固定 Asia/Shanghai 或 UTC 策略 |
| 字段名 typo | 前端兼容问题 | DTO 层兼容旧名，新代码内部用清晰命名 |

## 11. 测试策略与质量门禁

这个项目必须按大项目规范做测试，测试不是最后补一下，而是每个阶段都要跟着实现同步建设。

### 11.1 测试分层

后端测试：

- 单元测试：覆盖密码兼容、token/session、权限判断、状态枚举、金额/数量计算、日期毫秒时间戳转换。
- repository 测试：使用测试 MySQL 或容器库，验证 SQLx 查询、分页、筛选、排序、事务回滚。
- service 测试：覆盖创建订单联动 `company_order/receipt/memory`、修改订单联动回单、回单状态更新、角色菜单分配。
- API 集成测试：启动 Axum app，直接请求 `/api/login`、`/api/users/list`、`/api/order/list`、`/api/receipt/list` 等旧兼容接口。
- 安全测试：验证未登录 401、普通用户 403、SQL 注入 payload 不生效、越权修改密码失败、上传非法文件失败。

前端测试：

- 类型检查：`tsc -b` 必须通过。
- lint：`npm run lint` 必须通过。
- 组件测试：表格、筛选、弹窗表单、分页、状态 badge、权限隐藏/禁用逻辑。
- API mock 测试：每个 `src/api/<domain>.ts` 校验请求路径、方法、入参、错误处理。
- E2E 测试：使用 Playwright 覆盖登录、导航、列表筛选、新增/编辑/删除、回单状态流转、导出。
- 视觉/响应式检查：关键页面至少覆盖桌面宽屏、普通桌面、窄屏；不得破坏模板暗色模式和布局。

数据库和迁移测试：

- schema 测试：新旧字段、类型、主键、自增、索引、字符集、时间字段语义对比。
- dry-run 测试：迁移前输出影响表、行数、异常数据，不写新库。
- apply 测试：在影子库全量迁移。
- 对账测试：每表 `COUNT(*)`、`MAX(id)`、订单运费求和、回单状态分组、用户角色分布、菜单树数量。
- 关联测试：检查 `user_role`、`role_permission`、`company_order`、`receipt.oddnumber`、`avatar.user_id` 孤儿数据。
- 文件测试：头像 DB 记录和磁盘文件双向校验，缺失文件必须报告。

Tauri 桌面测试：

- dev 启动测试：Tauri 能加载 Vite 页面并访问本地 API。
- build 测试：安装包可构建、可安装、可启动。
- 文件能力测试：导出 Excel/CSV、选择保存路径、打开导出目录。
- 权限测试：Tauri 配置只开放必要 capability，不扩大 fs/shell 权限。
- 升级预留测试：配置不阻塞后续 auto-update。

### 11.2 必须覆盖的业务回归场景

- 旧管理员账号可以登录，新系统能加载用户信息和菜单。
- 登录后刷新应用仍能恢复会话；退出后 token 清理彻底。
- 普通用户不能新增/删除用户、角色、菜单。
- 用户列表按姓名、启用状态、角色、创建时间筛选结果正确。
- 角色新增、编辑、删除、分配菜单后，菜单树和 `menuIds` 返回正确。
- 公司新增、编辑、删除后，公司列表和订单数量正确。
- 订单新增后必须按旧逻辑写入 `order_list`、`company_order`，`receiptnum > 0` 时写入 `receipt`，并写入 `memory`。
- 订单编辑后公司关联和回单信息保持一致。
- 订单删除行为必须明确：兼容旧逻辑或新逻辑级联，测试必须覆盖。
- 回单列表、未回收、已回收三个页面筛选和分页正确。
- 回单回收、发放、寄出状态更新正确。
- 头像上传、读取、默认头像 fallback 正常。
- 导出订单字段、顺序、数量与页面筛选一致。

### 11.3 自动化命令规范

建议根目录提供统一命令：

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npm run lint --prefix apps/desktop/web
npm run build --prefix apps/desktop/web
npm run test --prefix apps/desktop/web
npm run e2e --prefix apps/desktop/web
cargo run -p admin-migration -- verify --old <OLD_DB> --new <NEW_DB>
cargo tauri build
```

后续可以封装成：

```bash
scripts/check-all.sh
scripts/test-backend.sh
scripts/test-frontend.sh
scripts/test-migration.sh
scripts/test-e2e.sh
```

当前仓库已提供 `scripts/check-all.sh`、`scripts/test-backend.sh`、`scripts/test-frontend.sh`、`scripts/test-migration.sh` 作为统一质量门禁入口。默认情况下，Rust 脚本使用 `CARGO_OFFLINE=true`，保证在依赖已缓存但网络不稳定时仍可稳定运行；需要在线拉取新依赖时可显式执行 `CARGO_OFFLINE=false scripts/check-all.sh`。`scripts/test-migration.sh` 默认会执行 `admin-migration rollback-plan --format json`，确保没有真实数据库连接时也能持续校验回滚文档出口。头像文件迁移校验已经从“只报告差异”升级为阻断门禁：`verify-files` 会输出 `status=passed/failed`，缺失、多余或 SHA256 变化都会让 CLI 非 0 退出，发布前必须修复后复验。

前端质量门禁必须包含 `lint`、`typecheck`、`test`、`build` 四段；Playwright E2E 通过 `RUN_E2E=true scripts/test-frontend.sh` 显式开启，避免本地缺少浏览器二进制时阻塞普通提交，但发布候选版本必须开启 E2E。

当前 E2E 已从登录/工作台 happy path 扩展到列表状态矩阵、订单导出和账号设置关键链路：`apps/desktop/web/e2e/business-list-states.spec.ts` 覆盖订单列表、当前页 CSV 下载和回单管理，`apps/desktop/web/e2e/system-list-states.spec.ts` 覆盖发货公司、用户管理、角色权限、菜单管理，`apps/desktop/web/e2e/account-settings.spec.ts` 覆盖系统设置入口、当前用户改密、旧 `avatar` 字段 multipart 上传和头像 cache bust。所有 spec 都会在真实浏览器中断言登录后菜单进入、旧接口 payload/header、Bearer token、关键交互，以及加载/错误/操作反馈时仍保留 `frontend-template` 的侧栏/顶栏页面壳、不回退登录页。后续每补一个主页面，也必须按同样矩阵补齐。

当前生产 API 已接入 SQLx MySQL 仓储，普通 `scripts/check-all.sh` 覆盖编译、clippy、内存仓储 API 集成测试、前端组件测试和构建；连接真实数据库的 repository/迁移回归必须在影子库设置 `ADMIN_DB_TEST_DATABASE_URL`、`OLD_DATABASE_URL`、`NEW_DATABASE_URL`、`DATABASE_URL` 后单独执行，不允许用本地空库冒充迁移验收。默认门禁会明确打印 `RUN_DB_TESTS=true` 未设置时跳过真实 MySQL repository 集成测试，不能把该跳过视为发布级数据库验收。订单/回单仓储已增加 SQL 注入 payload 回归，确认 `%' OR 1=1 --` 只作为普通筛选文本处理。

真实 MySQL 仓储回归已继续扩展到公司、图表和角色/菜单模块：`crates/admin-db/tests/mysql_company_repository.rs` 覆盖 `MySqlCompanyRepository` 的列表分页、旧 `Countorder` 文本弱关联统计、详情数组/空数组语义、创建/改名/删除，以及公司改名不级联历史 `company_order.com_name` 的迁移边界；`crates/admin-db/tests/mysql_chart_repository.rs` 覆盖 `MySqlChartRepository` 的首页 header 指标、公司订单数、公司运费和回单汇总，确保继续使用旧 `company_order.com_name`、`order_list.company/sumfreight/receiptnum` 和 `receipt` 总行数口径；`crates/admin-db/tests/mysql_role_menu_repository.rs` 覆盖 `MySqlRoleRepository` 和 `MySqlMenuRepository` 的角色筛选/增删改、菜单树旧 `children/chilren` 响应、角色菜单查询、菜单创建和角色权限事务替换；这些测试已纳入 `RUN_DB_TESTS=true ADMIN_DB_TEST_DATABASE_URL=... scripts/check-all.sh`。

每次接入一个真实 SQLx 仓储后，必须至少完成四层验证：`cargo test --offline -p admin-db` 验证仓储编译和 schema 契约、`cargo test --offline -p admin-api -p admin-db` 验证 API 装配编译、`scripts/check-all.sh` 验证全仓库回归、`RUN_DB_TESTS=true ADMIN_DB_TEST_DATABASE_URL=mysql://... scripts/check-all.sh` 验证真实 MySQL repository 事务路径。当前订单仓储已提供 `crates/admin-db/tests/mysql_order_repository.rs`，覆盖真实 MySQL 下订单创建、回单同步更新、弱关联删除清理和 SQL 注入 payload 普通文本化；用户认证仓储已提供 `crates/admin-db/tests/mysql_user_auth_repository.rs`，覆盖旧 MD5 登录升级 Argon2、错误密码不污染旧 hash/token、`user.token` 单点写回、新建/改密 Argon2 写入。

Docker/容器门禁已作为发布级测试的一部分补齐：`Dockerfile.admin-api` 构建 Rust Axum API 镜像，`Dockerfile.desktop-web` 构建模板前端静态镜像，`docker-compose.ci.yml` 组合 MySQL、API 和 Web，并通过 `DATABASE_MIGRATE_ON_START=true` 在 CI 数据库启动时应用兼容 schema，用于验证镜像能启动并通过 `/api/health` 与首页检查。默认 `scripts/check-all.sh` 只打印 `RUN_DOCKER=true` 跳过提示；发布候选版本必须执行 `RUN_DOCKER=true scripts/check-all.sh`。如果 Docker 构建或 compose 启动失败，`scripts/test-docker.sh` 必须输出 `docker version`、`docker compose version`、commit、镜像 tag、脱敏后的数据库连接、compose ps 和三类服务最近 200 行日志，不能只给出笼统的 “Docker build failed”。

Docker 基础镜像允许通过环境变量覆盖：`RUST_IMAGE`、`RUNTIME_IMAGE`、`NODE_IMAGE`、`NGINX_IMAGE`、`MYSQL_IMAGE`。本机或 CI 如果 Docker Hub 直连不稳定，可以先预拉取内部镜像或镜像站版本，再用这些变量执行 `scripts/test-docker.sh`；脚本会在诊断中打印实际使用的基础镜像，便于定位是网络拉取失败、构建失败还是启动失败。

Tauri 桌面壳已开始向自包含企业桌面包收敛：生产 `.app` 默认连接固定本机 API `http://127.0.0.1:16824/api`，Rust 主进程会从应用资源目录启动 `admin-api` sidecar，并把 `APP_HTTP__HOST` 固定为 `127.0.0.1`、`APP_HTTP__PORT` 固定为 `16824`。该实现不向 renderer 开放 `shell/process/fs/dialog` 权限，CSP 也收窄到固定 loopback 端口和显式远端 HTTPS。发布构建前必须先从仓库根 workspace 生成 `target/release/admin-api`，再用 Tauri `--config '{"bundle":{"resources":{"../../../target/release/admin-api":"binaries/admin-api"}}}'` 注入 release-only 资源映射，避免普通 `cargo check` 因 release sidecar 不存在而失败；远端 API 包可通过 `ADMIN_YH_DESKTOP_DISABLE_SIDECAR=true` 禁用本机 sidecar，开发排障可通过 `ADMIN_YH_DESKTOP_ADMIN_API_BIN=/path/to/admin-api` 指定二进制。sidecar 失败时必须记录二进制路径、退出/启动错误、stdout/stderr、`APP_HTTP__PORT`、`API_BASE_URL` 和 `/api/health` 探测结果。

Tauri 打包门禁已封装为 `scripts/test-tauri-build.sh`，并接入 `RUN_TAURI=true scripts/check-all.sh` 与 GitHub Actions 的 `tauri-app` job。该脚本先构建 `admin-api` release sidecar，再用 release-only Tauri `--config` 构建 `.app`，最后检查 `.app/Contents/Resources/binaries/admin-api` 是否存在且可执行。若构建失败，脚本必须输出 commit、Tauri 目录、Web 目录、sidecar 路径、资源注入 JSON 和当前 bundle 目录内容，不能只返回笼统的 Tauri build failed。

### 11.4 发布门禁

任何一个发布候选版本必须满足：

- Rust 格式化、clippy、单元测试、集成测试全部通过。
- 前端 lint、类型检查、build、组件测试、E2E 全部通过。
- Docker API/Web 镜像构建、compose 启动、API health 和 Web 首页健康检查全部通过。
- 迁移 dry-run 无阻断项。
- 影子库迁移 apply + verify 全部通过。
- 关键业务手工验收完成，并记录结果。
- Tauri 安装包构建和本机启动通过。
- 无 `unwrap`/`expect` 泄漏到核心业务路径，除启动期明确不可恢复错误外。
- 无明文密码存储、无 SQL 拼接查询、无越权接口。
- 所有阻断级 bug 关闭后才能切换生产。

### 11.5 测试数据策略

- 建一份脱敏旧库快照作为迁移和回归基准。
- 建最小种子数据：管理员、普通用户、角色、菜单、公司、订单、回单、头像。
- 建边界数据：空手机号、空备注、`receiptnum = 0`、中文状态、重复姓名/公司名、缺失头像文件、孤儿关联。
- 每次测试前重建测试库，避免脏数据影响结果。
- 生产迁移前只允许 dry-run；真正 apply 必须在备份和回滚方案确认后执行。

## 12. 需要进一步确认的问题

这些问题不阻塞第一阶段骨架，但会影响最终设计：

1. 新系统是只给本机单人用，还是多用户共享同一个 MySQL？
2. 旧数据库当前真实地址是否就是 `adminYh-server/.env` 中配置的库？
3. 旧用户密码具体 hash 算法是否必须无感兼容？
4. 是否需要保留旧 API 路径给其它客户端使用？
5. Tauri 应用是否需要自动更新？
6. 是否需要离线模式，还是必须实时连 MySQL/API？

## 13. 近期下一步

建议下一步按这个顺序执行：

1. 导出旧 MySQL schema，补齐真实字段类型和索引。
2. 创建 `docs/database-migration.md`，列出每张表字段、类型、迁移规则、校验 SQL。
3. 初始化 Rust workspace + Tauri + frontend-template 派生前端。
4. 先实现 `/api/health`、登录、当前用户、菜单树。
5. 跑通一个完整闭环：旧用户登录 → 菜单展示 → 用户列表读取。
6. 同步建立 `check-all` 测试脚本，确保从第一条接口开始就纳入自动化测试。
