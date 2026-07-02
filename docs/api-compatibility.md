# API 兼容清单

日期：2026-07-01  
范围：旧 Koa 后端 `/Users/hanhan/Desktop/code/adminYh-server` 到新 Rust Axum API

## 1. 兼容目标

- 第一阶段保留旧路径、旧请求字段和旧响应结构，降低前后端同时重写风险。
- 外部路径统一挂到 `/api` 前缀下，例如旧 `/login` 对应新 `/api/login`。
- 返回结构保留 `{ code, data, message }`，同时 HTTP status 正确表达认证、权限和服务端错误。
- 新实现内部必须参数化 SQL、统一 DTO 校验、统一错误转换，不能复制旧服务层的字符串拼接查询。

## 2. 通用协议

### 2.1 成功响应

```json
{
  "code": 0,
  "data": {},
  "message": "success"
}
```

### 2.2 兼容错误响应

```json
{
  "code": -200,
  "data": null,
  "message": "无效的token或登录已失效！请重新登录~"
}
```

### 2.3 认证和权限

- 旧系统多数业务接口依赖 `verifyAuth`，管理员写操作额外依赖 `verifyRole`。
- 旧管理员判断依赖 `user_role.role_id == 1`，新系统应集中到权限服务，第一阶段可兼容超级管理员角色 ID。
- 普通用户必须不能调用用户、角色、菜单、公司、订单的管理写接口。
- `/users/:userId/avatar` 旧系统无鉴权，新系统可保留公开读取，但必须限制路径穿越和 MIME。

## 3. 路由矩阵

| 模块 | 方法 | 旧路径 | 新兼容路径 | 权限 | 备注 |
|---|---:|---|---|---|---|
| Auth | POST | `/login` | `/api/login` | 无 | 登录；旧验证码校验已注释，不要假设强验证码 |
| Auth | GET | `/code` | `/api/code` | 无 | 兼容旧 `{ data: "<svg...>" }` 响应；登录暂不强制校验验证码 |
| Chart | GET | `/chart/headerList` | `/api/chart/headerList` | 登录 | 顶部统计 |
| Chart | GET | `/chart/company/order/count` | `/api/chart/company/order/count` | 登录 | 公司订单数量 |
| Chart | GET | `/chart/company/order/sumfreight` | `/api/chart/company/order/sumfreight` | 登录 | 公司运费汇总 |
| Chart | GET | `/chart/company/receipt/sumreceipt` | `/api/chart/company/receipt/sumreceipt` | 登录 | 公司回单数量 |
| User | POST | `/users` | `/api/users` | 管理员 | 创建用户并写用户角色 |
| User | DELETE | `/users/:userId` | `/api/users/:userId` | 管理员 | 已保留旧系统用户 58 删除保护 |
| User | PATCH | `/users/:userId` | `/api/users/:userId` | 管理员 | 修改用户名/角色 |
| User | PATCH | `/users/:userId/password` | `/api/users/:userId/password` | 本人或管理员 | 旧 `verifyPower` 语义需测试覆盖 |
| User | GET | `/users/:userId` | `/api/users/:userId` | 登录 | 用户详情含角色 JSON |
| User | POST | `/users/list` | `/api/users/list` | 登录 | 分页筛选 |
| User | GET | `/users/:userId/avatar` | `/api/users/:userId/avatar` | 公开 | 头像文件直出，限制路径穿越和 MIME |
| Role | POST | `/role` | `/api/role` | 管理员 | 创建角色 |
| Role | DELETE | `/role/:roleId` | `/api/role/:roleId` | 管理员 | 删除角色 |
| Role | PATCH | `/role/:roleId` | `/api/role/:roleId` | 管理员 | 修改角色 |
| Role | GET | `/role/:roleId` | `/api/role/:roleId` | 登录 | 角色详情 |
| Role | POST | `/role/list` | `/api/role/list` | 登录 | 分页筛选 |
| Role | POST | `/role/assign` | `/api/role/assign` | 管理员 | 旧逻辑只插入不清理，需修复并兼容返回 |
| Role | GET | `/role/:roleId/menu` | `/api/role/:roleId/menu` | 登录 | 角色菜单树 |
| Role | GET | `/role/:roleId/menuIds` | `/api/role/:roleId/menuIds` | 管理员 | 角色菜单 ID |
| Menu | POST | `/menu` | `/api/menu` | 管理员 | 创建菜单 |
| Menu | GET | `/menu/tree` | `/api/menu/tree` | 管理员 | 完整菜单树 |
| Company | POST | `/company` | `/api/company` | 管理员 | 创建发货公司 |
| Company | DELETE | `/company/:companyId` | `/api/company/:companyId` | 管理员 | 删除发货公司 |
| Company | PATCH | `/company/:companyId` | `/api/company/:companyId` | 管理员 | 修改发货公司 |
| Company | GET | `/company/:companyId` | `/api/company/:companyId` | 登录 | 公司详情 |
| Company | POST | `/company/list` | `/api/company/list` | 登录 | 公司分页 |
| Order | POST | `/order` | `/api/order` | 管理员 | 创建订单，联动 company_order/receipt/memory |
| Order | DELETE | `/order/:orderId` | `/api/order/:orderId` | 管理员 | 删除订单，事务清理 `company_order` 和安全匹配的 `receipt` |
| Order | PATCH | `/order/:orderId` | `/api/order/:orderId` | 管理员 | 修改订单，同步 `company_order/receipt/memory` |
| Order | GET | `/order/:orderId` | `/api/order/:orderId` | 登录 | 订单详情 |
| Order | POST | `/order/list` | `/api/order/list` | 登录 | 订单分页筛选 |
| Receipt | POST | `/receipt/list` | `/api/receipt/list` | 登录 | 全部回单 |
| Receipt | PATCH | `/receipt/:receiptId` | `/api/receipt/:receiptId` | 登录 | 更新回收/发放/寄出状态 |
| Receipt | POST | `/notrecovery/list` | `/api/notrecovery/list` | 登录 | 未回收列表 |
| Receipt | POST | `/recovery/list` | `/api/recovery/list` | 登录 | 已回收列表 |
| Upload | POST | `/upload/avatar` | `/api/upload/avatar` | 登录 | 上传头像 |
| Memory | POST | `/memory/list` | `/api/memory/list` | 登录 | 旧响应不带 code，新系统需兼容或前端统一适配 |

## 4. 请求字段兼容

### 4.1 分页

旧列表接口通常使用：

```json
{
  "offset": 0,
  "size": 10
}
```

新 API 可内部转为 page/pageSize，但兼容层必须继续接受 `offset/size`。

### 4.2 用户筛选

`/users/list` 兼容字段：

- `name`
- `enable`
- `roleId`
- `createAt` 或时间范围字段；旧代码存在按 `DATE(createAt)` 查询的路径。

### 4.3 订单字段

`/order` 新增/编辑必须兼容：

- `oddnumber`
- `billingAt`
- `consignee`
- `consigneephone`
- `address`
- `method`
- `goodsname`
- `number`
- `pack`
- `weight`
- `measurement`
- `cainsurance`
- `value`
- `insurance`
- `consignor`
- `consignorphone`
- `freight`
- `delivery`
- `sumfreight`
- `freightstate`
- `paynow`
- `paygo`
- `payback`
- `paymonth`
- `receiptnum`
- `company`
- `remarks`

### 4.4 回单字段

`/receipt/list`、`/notrecovery/list`、`/recovery/list` 兼容筛选：

- `oddnumber`
- `consignee`
- `consignor`
- `recoverystate`
- `issuestate`
- `poststate`
- `billingAt` 范围

状态更新必须兼容旧中文状态值：

- 回收：`未回收`、`已回收`
- 发放：`未发放`、`已发放`
- 寄出：`未寄出`、`已寄出`

旧前端批量“回单接收”实际提交 `issuestate='已接收'`，而搜索枚举使用 `已发放/未发放`；新系统第一阶段必须同时接受 `已接收` 和 `已发放`，并在迁移 dry-run 中报告历史枚举分布。

## 5. 必测兼容场景

- 未登录请求业务接口返回 401，同时 body 保持旧 `{ code: -200, message }` 结构。
- 普通用户调用管理写接口返回 403。
- 旧管理员登录后可获取用户信息和菜单。
- `/users/list`、`/role/list`、`/order/list`、`/receipt/list` 的分页总数与旧库同条件一致。
- SQL 注入 payload 只能作为普通筛选文本，不得影响结果集或 SQL 结构；`mysql_order_repository_treats_sql_injection_filters_as_plain_text` 已覆盖订单/回单真实 MySQL 筛选参数化。
- 创建订单时 `receiptnum > 0` 自动创建回单，`receiptnum = 0` 不创建回单。
- 创建订单后 `company_order` 写入 `company` 文本和订单 ID。
- 角色分配菜单会先删除旧关系再写入新关系，重复提交结果幂等。
- 头像上传限制 MIME、扩展名和大小；读取缺失头像时 fallback 到 `default.jpg`。
- `memory/list` 对旧前端兼容：如果旧前端期望数组，新前端 API client 应能同时处理数组和 `{ code, data }`。

## 6. 实现约束

- 路由层只做 method/path/middleware 组合。
- handler 只做参数提取和响应转换。
- service 承载业务规则和旧兼容语义。
- repository 只写参数化 SQL，禁止拼接筛选条件。
- error/response 统一封装旧响应结构。
- 权限判断集中在 auth/permissions 模块，业务 handler 禁止硬编码 `role_id == 1`。

## 7. 自动化接入

质量门禁入口：

```bash
scripts/check-all.sh
scripts/test-backend.sh
scripts/test-frontend.sh
scripts/test-migration.sh
```

后续 API 集成测试建议覆盖：

```text
POST /api/login
GET  /api/menu/tree
POST /api/users/list
POST /api/role/list
POST /api/company/list
POST /api/order/list
POST /api/receipt/list
POST /api/notrecovery/list
POST /api/recovery/list
```

每个接口至少验证：

- HTTP status。
- `code/data/message` 结构。
- 旧字段名是否存在。
- 未登录、普通用户、管理员三类权限边界。
- 同条件下与旧库查询结果数量一致。

## 8. 当前实现进度

- `/api/login` 已先落地兼容入口和集成测试，返回旧 `{ code, data, message }` 结构。
- `/api/users/me` 已先落地会话校验入口和集成测试，支持 Bearer token 解析、当前用户返回、角色 ID 返回、缺失 token 失败、二次登录挤掉旧 token。
- `/api/role/:roleId/menu`、`/api/role/:roleId/menuIds`、`GET /api/menu/tree`、`POST /api/menu` 已先落地内存菜单仓储和集成测试，兼容旧 `children` / `chilren` / `parentId` / `partentId` 字段、新增菜单旧字段 `name/type/url/icon/sort/parentId`、管理员权限边界和旧路径 `/menu`。
- `/api/company/list`、`/api/company/:companyId`、`POST/PATCH/DELETE /api/company` 已先落地内存公司仓储和集成测试，兼容旧 `Countorder`、`totalCount`、详情数组和中文成功文案。
- `/api/users/list`、`/api/users/:userId`、`POST/PATCH/DELETE /api/users`、`/api/users/:userId/password`、`/api/users/:userId/avatar` 已先落地内存用户仓储和集成测试，兼容旧 `avatarUrl`、`roleId`、角色对象、用户 58 删除保护、对象/裸字符串改密和公开头像读取。
- `/api/role/list`、`/api/role/:roleId`、`POST/PATCH/DELETE /api/role`、`/api/role/assign` 已先落地内存角色仓储和集成测试，兼容旧 `totalCount`、角色详情、中文成功文案和菜单分配幂等替换。
- `/api/order/list`、`/api/order/:orderId`、`POST/PATCH/DELETE /api/order`、`/api/receipt/list`、`PATCH /api/receipt/:receiptId`、`/api/notrecovery/list`、`/api/recovery/list` 已先落地内存订单/回单仓储和集成测试，兼容旧运单字段、`billingAt` 日期格式、回单状态文案、订单创建联动 `company_order/receipt/memory`；订单删除已升级为事务级联清理 `company_order` 和安全匹配的 `receipt`，不再延续旧系统只删主表导致孤儿数据的行为。
- `/api/memory/list` 已先落地内存记忆词条仓储和集成测试，兼容旧 `{ data: [{ value }] }` 这种不带 `code/message` 的响应结构，并复用订单创建副作用写入的 memory 数据。
- `/api/chart/headerList`、`/api/chart/company/order/count`、`/api/chart/company/order/sumfreight`、`/api/chart/company/receipt/sumreceipt` 已先落地内存图表统计仓储和集成测试，兼容旧顶部统计标题、公司维度字段名 `ordercount/sumfreight/sumReceipt`、登录鉴权要求。
- 前端工作台 `src/api/dashboard.ts` 已改为通过封装层读取旧 `chart` 接口组合数据，不再依赖未实现的 `/chart/dashboard`；配套 `dashboard.test.ts` 覆盖旧字段映射、公司维度聚合和实际请求路径。
- 前端订单模块已在 `src/api/orders.ts` 和 `OrdersList` 页面补齐列表 + CRUD 第一阶段：通过封装层请求 `/api/order/list`、`GET /api/order/:id`、`POST /api/order`、`PATCH /api/order/:id`、`DELETE /api/order/:id`，保留旧订单字段、搜索条件、分页、当前页 CSV 导出、旧弹窗必填校验、查看只读、编辑保存和删除确认；配套 API/页面测试覆盖 payload、请求路径、字段渲染、筛选、分页、必填校验、toast、confirm 和刷新行为，`order-export` 单测覆盖旧中文列顺序、BOM、CSV 转义、文件名和 object URL 下载封装。
- 前端回单模块已在 `src/api/receipts.ts` 和 `ReceiptsList` 页面补齐列表 + 状态流转第一阶段：通过封装层请求 `/api/receipt/list`、`/api/notrecovery/list`、`/api/recovery/list`、`PATCH /api/receipt/:id`，复用一个页面承载全部回单/未回收/已回收三个旧入口，保留旧回单字段、搜索条件、分页、回收/接收/寄出按钮和 `issuestate='已接收'` 兼容值；配套 API/页面测试覆盖三类列表路径、旧 payload、状态 PATCH、筛选、分页、toast、空态和刷新行为。
- 前端业务列表 E2E 已补充 `apps/desktop/web/e2e/business-list-states.spec.ts`：订单列表和回单管理在真实浏览器中覆盖登录后进入页面、旧接口分页 payload、Bearer token、成功列表、订单当前页 CSV 下载、空态、错误态，以及错误时仍保留模板侧栏/顶栏、不退回登录页。
- 前端系统管理 E2E 已补充 `apps/desktop/web/e2e/system-list-states.spec.ts`：发货公司、用户管理、角色权限、菜单管理在真实浏览器中覆盖登录后进入页面、旧接口 payload/header、成功列表、空态、错误态，以及错误时仍保留模板侧栏/顶栏、不退回登录页。
- 前端 E2E 公共封装已抽到 `apps/desktop/web/e2e/support/*`：`admin-session` 统一 mock 登录、会话、菜单、工作台图表和模板壳断言，`legacy-responses` 统一旧列表响应形状；后续 Playwright 用例必须复用这些 helpers，避免每个页面重复造 token、菜单和旧响应结构。
- 前端系统写入 E2E 已补充 `apps/desktop/web/e2e/system-write-flows.spec.ts`：真实浏览器中覆盖角色权限分配 `/api/role/assign` 的 `{ roleId, menuList }` 旧 payload、菜单创建 `/api/menu` 的 numeric `type/sort/parentId` payload、创建后刷新菜单树，以及页面注册表不再把已实现订单模块标成建设中。
- 前端架构门禁已接入 `scripts/test-frontend-architecture.mjs` 和 `scripts/test-frontend.sh`：默认提交门禁会阻断页面/业务组件直接 `fetch`、引入 `axios`、绕过 `src/api/*` 调用 `apiRequest`、业务层直接使用 Radix 原语和散写 inline style；菜单/角色树缩进已抽到 `TreeIndent` 模板布局封装，避免业务页面为了层级样式继续扩散自定义写法。
- 前端发货公司模块已在 `src/api/companies.ts` 和 `CompaniesList` 页面补齐列表 + CRUD 第一阶段：通过封装层请求 `/api/company/list`、`GET /api/company/:id`、`POST /api/company`、`PATCH /api/company/:id`、`DELETE /api/company/:id`，保留旧 `Countorder`、`totalCount`、详情数组、分页、查看只读、旧弹窗必填校验、编辑保存和删除确认；配套 API/页面测试覆盖旧 payload、请求路径、详情数组解包、字段渲染、分页、必填校验、toast、confirm、空态和刷新行为。
- 前端用户模块已在 `src/api/users.ts`、`src/api/roles.ts` 和 `UsersList` 页面补齐用户管理第一阶段：通过封装层请求 `/api/users/list`、`GET /api/users/:id`、`POST /api/users`、`PATCH /api/users/:id`、`PATCH /api/users/:id/password`、`DELETE /api/users/:id`，并以只读 `/api/role/list` 提供角色下拉；保留旧 `avatarUrl`、`roleId`、`enable`、`totalCount`、新建密码必填、编辑隐藏密码、独立改密、用户 58 删除保护和启用状态只展示/筛选语义；配套 API/页面测试覆盖旧 payload、请求路径、角色下拉过滤、字段渲染、筛选、分页、必填校验、toast、confirm、空态和刷新行为。
- 前端账号设置模块已在 `AccountPreferences` 和 `Settings` 页面补齐当前用户改密 + 头像上传入口：通过封装层请求 `/api/users/:id/password` 和 multipart `/api/upload/avatar`，保留旧顶栏“修改密码/修改头像”能力、旧头像字段名 `avatar`、jpg/png 与 500kb 前端校验、头像 URL cache bust；配套 API/组件测试覆盖 FormData 请求头、上传字段、URL 解析、改密校验、非法头像拦截和上传成功刷新，`apps/desktop/web/e2e/account-settings.spec.ts` 进一步用真实浏览器覆盖系统设置入口、改密、头像上传和模板壳保持。
- 前端系统偏好已在 `src/api/settings.ts` 和 `Settings` 页面落地封装，不再保留模板“假保存”：通用/外观偏好只保存站点展示、负责团队、能力开关和界面偏好等非敏感本地配置，存储键统一走 `nsKey('settings-preferences')`；配套 `settings.test.ts` 和 `Settings.test.tsx` 覆盖默认值、异常 payload 归一化、确认保存、取消不落盘、恢复默认和不写入 password 等敏感字段。
- 前端角色权限模块已在 `src/api/roles.ts` 和 `RolesList` 页面补齐角色管理第一阶段：通过封装层请求 `/api/role/list`、`GET /api/role/:id`、`POST /api/role`、`PATCH /api/role/:id`、`DELETE /api/role/:id`、`GET /api/menu/tree`、`GET /api/role/:id/menuIds`、`POST /api/role/assign`，保留旧 `name`、`intro`、`createAt`、`updateAt`、`children/chilren`、`parentId/partentId`、`roleId/menuList`、菜单授权幂等替换语义；配套 API/页面测试覆盖旧 payload、请求路径、字段渲染、筛选、分页、必填校验、查看只读、编辑保存、删除确认、菜单树兼容和授权保存。
- 前端菜单管理模块已在 `src/api/menus.ts` 和 `MenusList` 页面补齐菜单树展示 + 新增菜单第一阶段：通过封装层请求 `GET /api/menu/tree` 和 `POST /api/menu`，保留旧 `children/chilren`、`parentId/partentId`、`name/type/url/icon/sort/permission/createAt/updateAt` 字段，Dashboard 独立增加“菜单管理”入口；配套 API/页面测试覆盖旧字段归一、树扁平展示、创建一级菜单、创建子菜单、父级必填校验、空态和刷新行为。
- 迁移审计工具已在 `admin-migration` 落地 `inspect-old`、`migrate --dry-run`、`verify-files`、`rollback-plan` 第一阶段：通过 SQLx MySQL 只读旧库，输出表行数/ID 边界、重复数据、孤儿关系、回单状态分布、日期边界、头像 SHA256 与 DB/磁盘差异；`scripts/test-migration.sh` 已纳入单元测试、rollback-plan JSON 输出和真实库审计命令。
- `admin-db` 已落地 SQLx MySQL 连接池、兼容 schema baseline 和 `MySqlOrderRepository` 第一阶段：保留 11 张旧表和旧字段名，不加硬外键/唯一约束，订单写入通过事务联动 `order_list/company_order/receipt/memory`，查询条件全部走参数化 SQL。
- `admin-db` 已补齐 `MySqlCompanyRepository` 和 `MySqlChartRepository` 第一阶段：公司 `Countorder` 按 `company_order.com_name` 统计，详情保留旧数组语义；图表保留旧 SQL 口径，订单数/运费/回单维度分别沿用 `company_order`、`order_list`、`receipt` 的弱关联统计。
- `crates/admin-db/tests/mysql_company_repository.rs` 已补充真实 MySQL 公司仓储回归：覆盖列表分页、旧 `Countorder` 由 `company_order.com_name` 文本统计、详情空数组语义、创建/改名/删除，以及公司改名不静默改写历史 `company_order.com_name` 的弱关联边界；`RUN_DB_TESTS=true ADMIN_DB_TEST_DATABASE_URL=... scripts/check-all.sh` 已纳入该门禁。
- `crates/admin-db/tests/mysql_order_repository.rs` 已补充真实 MySQL SQL 注入和空筛选回归：订单和回单筛选中的 `%' OR 1=1 --` 只作为普通 LIKE 文本处理，不扩大结果集、不破坏既有订单/回单记录；无筛选项时 list/count 不生成悬空 `WHERE`，空字符串筛选会被跳过，避免退化成全表 `LIKE '%%'`；该门禁随 `RUN_DB_TESTS=true ADMIN_DB_TEST_DATABASE_URL=... scripts/check-all.sh` 执行。
- `crates/admin-db/tests/mysql_chart_repository.rs` 已补充真实 MySQL 图表仓储回归：覆盖首页 header 订单数/运费/公司数/回单数增量、公司订单数继续来自 `company_order.com_name`、公司运费继续来自 `order_list.company/sumfreight`，公司回单汇总继续来自 `order_list.receiptnum`；`RUN_DB_TESTS=true ADMIN_DB_TEST_DATABASE_URL=... scripts/check-all.sh` 已纳入该门禁。
- `crates/admin-db/tests/mysql_role_menu_repository.rs` 已补充真实 MySQL 角色/菜单仓储回归：覆盖角色列表筛选、空筛选列表/计数、创建/改名/删除、全量菜单树旧 `chilren` 响应、角色菜单树旧 `children` 响应、`role_menu_ids` 汇总、菜单创建兼容 `partentId`，以及角色菜单分配去重替换和失败前置校验不清空既有权限；`RUN_DB_TESTS=true ADMIN_DB_TEST_DATABASE_URL=... scripts/check-all.sh` 已纳入该门禁。
- `admin-db` 已补齐 `MySqlUserRepository` 第一阶段：同一个 SQLx 仓储同时实现 `AuthUserStore` 和 `UserStore`，覆盖旧 MD5 登录查用户、登录 token 写回 `user.token`、按 token 查询当前用户、用户列表/详情/创建/修改/改密/删除、默认头像和头像元数据更新；用户创建、用户角色、默认头像写入放在同一事务中。真实 MySQL 回归已补充空筛选列表/计数和头像元数据事务测试，确认空筛选不会生成无效 SQL，上传更新不会产生重复 `avatar` 行，缺失用户不会写入孤儿头像。
- `admin-db` 已补齐 `MySqlMenuRepository` 和 `MySqlRoleRepository` 第一阶段：菜单树从 `permission` 拉平后在 Rust 构树，保留 `/menu/tree` 的 `chilren` 和 `/role/:id/menu` 的 `children` 输出差异；角色列表、详情、创建、修改、删除和 `role_permission` 菜单分配均使用参数化 SQL，分配采用事务化先删后插和去重语义。
- `admin-api` 启动路径已接入真实 SQLx 仓储：生产运行时通过 `DATABASE_URL` 建立 `MySqlPool`，并装配 `CompatAuthService`、`CompatUserService`、`CompatMenuService`、`CompatRoleService`、`CompatCompanyService`、`CompatOrderService`、`CompatReceiptService`、`CompatMemoryService`、`CompatChartService`；测试仍可通过 `AppState::with_services` 注入内存仓储，保证业务测试和生产装配解耦。
- `/api/health` 已从静态进程存活检查升级为生产装配健康检查：测试/内存路径继续返回旧 `{ code, data, message }` envelope 和 `service/status/version` 字段，生产 `AppServices::database` 会额外通过 `MySqlHealthRepository` 执行 `SELECT 1`，并在 `data.checks` 中暴露 `service/database` 明细；数据库不可用时 HTTP 返回 503 且 `data.status=degraded`，让 Docker、Tauri sidecar 和发布门禁能发现真实 MySQL 断连，而不是只证明进程启动。
- `admin-api` 已补充真实 MySQL HTTP 层兼容测试 `crates/admin-api/tests/mysql_api_compatibility.rs`：在 `RUN_DB_TESTS=true ADMIN_DB_TEST_DATABASE_URL=...` 下通过 `MySqlPool -> AppServices::database -> build_router` 走生产装配，覆盖旧 MD5 管理员登录并升级 Argon2、`/api/users/me`、未登录 envelope、普通角色写接口 403、管理员创建订单后 `order_list/company_order/receipt/memory` 联动，以及 `/api/order/list`、`/api/receipt/list`、`/api/memory/list` 真实 MySQL 响应。该测试已接入 `scripts/test-backend.sh` 的真实数据库门禁，避免只验证 repository 而未验证 HTTP 路由装配。
- Docker 静态契约已接入默认门禁：`scripts/test-docker-contract.mjs` 会在不启动 Docker 的情况下锁定 API/Web Dockerfile、compose、nginx `/api` 代理、非 root 运行、`DATABASE_MIGRATE_ON_START` 默认/CI 差异、健康检查、诊断日志、真实浏览器 E2E 开关、seed SQL 和清理策略，防止发布配置被后续重构悄悄破坏。
- Docker 真实 API E2E 已接入发布门禁：`RUN_DOCKER=true RUN_DOCKER_E2E=true scripts/check-all.sh` 会构建 API/Web 镜像，启动 MySQL + Rust API + nginx Web，执行 `scripts/seed-docker-e2e.sql`，再用 Playwright 通过 Web 容器登录真实 `/api/login`，并覆盖工作台指标、订单列表、回单管理和页面注册表的 MySQL seed 数据展示；该门禁证明前端没有依赖 mock 兜底，后端、数据库、nginx 代理和浏览器链路同时可用。
- `/api/upload/avatar` 已先落地 multipart 头像上传兼容入口和集成测试，兼容旧字段名 `avatar`、上传成功文案、头像读取 bytes + `Content-Type` 直出。
- `/api/upload/avatar` 后端已补齐安全校验：缺失 token 返回旧未登录 envelope，非 `avatar` 字段、空文件、非 jpg/png MIME/扩展名和超过 500kb 均返回旧 `{ code: -400 }` 业务错误；前端校验不再是唯一防线。
- `/api/users/:userId/avatar` 头像读取已补齐路径安全边界：数据库中的头像文件名只能解析为单段普通文件名，出现 `../`、绝对路径或多段路径时会回退 `default.jpg`，上传新头像时也不会删除不安全的历史头像路径目标；配套 API 测试覆盖读取 fallback 和旧头像删除保护。
- `admin-migration verify-files` 已补齐头像文件完整性阻断门禁：对比旧/新头像目录的相对文件名和 SHA256，缺失、多余或内容变化都会输出 `status=failed` 并以非 0 退出，避免数据库迁移通过但磁盘头像漏迁。
- 登录服务通过 `AuthService` / `AuthUserStore` / `TokenIssuer` 抽象解耦；生产路径已装配 `MySqlUserRepository`，API 集成测试继续使用内存仓储做快速兼容回归，影子库回归需通过真实 `DATABASE_URL` 单独执行。
- 生产认证不再使用开发态 `dev-{user_id}-{uuid}` token：`production_auth_service` 和 `admin-api` 数据库启动路径统一使用 `SecureTokenIssuer` 生成 32 字节随机 opaque token，并继续写回 `user.token` 保留旧单点登录语义；开发/测试内存服务仍保留 `DevelopmentTokenIssuer` 便于断言。
- 生产 CORS 必须通过 `APP_HTTP__CORS_ORIGINS` 显式配置允许来源；`APP_ENV=production` 下未配置或配置 `*` 会启动失败，避免企业交付时继续使用任意来源跨域。桌面默认保留 loopback 来源，Docker CI 使用 Web 容器端口来源。
- `/api/code` 与旧 `/code` 验证码接口已补齐兼容路由，响应保持旧系统 data-only 形状 `{ data: "<svg...>" }`，不额外包 `{ code, message }`，避免旧前端或迁移期页面因响应形状变化崩溃；登录接口继续兼容旧后端“验证码字段存在但未强制校验”的行为。
- `/admin/resources` 与 `/api/admin/resources` 支撑生产环境资源注册表页，响应保持 frontend-template 的 `key/title/description/count/status/apiPath/legacyPath/owner` 字段形态，并由 Rust 服务聚合实时数量，避免生产包依赖前端 mock。
- 菜单服务通过 `MenuService` / `MenuStore` 抽象解耦；生产路径已装配 `MySqlMenuRepository`，API 集成测试继续使用内存菜单仓储验证旧响应形状和权限边界。
- 公司服务通过 `CompanyService` / `CompanyStore` 抽象解耦；生产路径已装配 `MySqlCompanyRepository`，测试保留内存仓储用于接口兼容回归。
- 用户管理服务通过 `UserService` / `UserStore` 抽象解耦；生产路径已装配 `MySqlUserRepository`，真实头像文件目录仍由 `APP_STORAGE__AVATAR_DIR` 控制。
- 头像上传通过 `UserService::update_avatar` 与文件落盘解耦；SQLx 实现已把 `avatar` 表更新和 `user.avatar_url` 更新纳入同一事务，文件写入失败不会污染数据库记录。
- 角色管理服务通过 `RoleService` / `RoleStore` 抽象解耦；生产路径已装配 `MySqlRoleRepository`，菜单授权替换使用事务保证不留下半写入。
- 订单/回单服务通过 `OrderService` / `ReceiptService` / `OrderStore` 抽象解耦；生产路径已装配 `MySqlOrderRepository`，测试保留内存订单仓储做快速接口回归。
- 第一阶段记忆词条通过 `MemoryService` 复用订单聚合仓储，保持与订单创建副作用在同一事务边界内演进。
- 图表统计服务通过 `ChartService` / `ChartStore` 抽象解耦；生产路径已装配 `MySqlChartRepository`，继续复刻旧 `order_list/company/company_order/receipt` 聚合口径。
- 旧 MD5 密码算法已在兼容层实现并测试；生产认证装配现在通过 `CompatPasswordVerifier` 同时识别旧 32 位 MD5 与 Argon2 PHC。旧用户首次成功登录后会把 `user.password` 升级为 Argon2，新建用户和改密也统一写入 Argon2；失败登录不会污染密码。真实 `user` 表仓储已接入，`crates/admin-db/tests/mysql_user_auth_repository.rs` 已补充真实 MySQL 影子库回归：覆盖旧 MD5 首登升级、错误密码不改 hash/token、`user.token` 单点写回语义、新建和改密写 Argon2、头像元数据事务替换和孤儿头像阻断。发布级数据库门禁需执行 `RUN_DB_TESTS=true ADMIN_DB_TEST_DATABASE_URL=... scripts/check-all.sh`。
