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
| Auth | GET | `/code` | `/api/code` | 无 | 验证码图片/文本，是否继续启用待定 |
| Chart | GET | `/chart/headerList` | `/api/chart/headerList` | 登录 | 顶部统计 |
| Chart | GET | `/chart/company/order/count` | `/api/chart/company/order/count` | 登录 | 公司订单数量 |
| Chart | GET | `/chart/company/order/sumfreight` | `/api/chart/company/order/sumfreight` | 登录 | 公司运费汇总 |
| Chart | GET | `/chart/company/receipt/sumreceipt` | `/api/chart/company/receipt/sumreceipt` | 登录 | 公司回单数量 |
| User | POST | `/users` | `/api/users` | 管理员 | 创建用户并写用户角色 |
| User | DELETE | `/users/:userId` | `/api/users/:userId` | 管理员 | 旧系统硬编码用户 58 不可删，需确认是否保留 |
| User | PATCH | `/users/:userId` | `/api/users/:userId` | 管理员 | 修改用户名/角色 |
| User | PATCH | `/users/:userId/password` | `/api/users/:userId/password` | 本人或管理员 | 旧 `verifyPower` 语义需测试覆盖 |
| User | GET | `/users/:userId` | `/api/users/:userId` | 登录 | 用户详情含角色 JSON |
| User | POST | `/users/list` | `/api/users/list` | 登录 | 分页筛选 |
| User | GET | `/users/:userId/avatar` | `/api/users/:userId/avatar` | 公开/登录待定 | 头像文件 |
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
| Order | DELETE | `/order/:orderId` | `/api/order/:orderId` | 管理员 | 删除订单；级联策略待定 |
| Order | PATCH | `/order/:orderId` | `/api/order/:orderId` | 管理员 | 修改订单 |
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
- SQL 注入 payload 只能作为普通筛选文本，不得影响结果集或 SQL 结构。
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
- `/api/role/:roleId/menu`、`/api/role/:roleId/menuIds`、`/api/menu/tree` 已先落地内存菜单仓储和集成测试，兼容旧 `children` / `chilren` / `partentId` 字段。
- `/api/company/list`、`/api/company/:companyId`、`POST/PATCH/DELETE /api/company` 已先落地内存公司仓储和集成测试，兼容旧 `Countorder`、`totalCount`、详情数组和中文成功文案。
- `/api/users/list`、`/api/users/:userId`、`POST/PATCH/DELETE /api/users`、`/api/users/:userId/password`、`/api/users/:userId/avatar` 已先落地内存用户仓储和集成测试，兼容旧 `avatarUrl`、`roleId`、角色对象、用户 58 删除保护、对象/裸字符串改密和公开头像读取。
- `/api/role/list`、`/api/role/:roleId`、`POST/PATCH/DELETE /api/role`、`/api/role/assign` 已先落地内存角色仓储和集成测试，兼容旧 `totalCount`、角色详情、中文成功文案和菜单分配幂等替换。
- `/api/order/list`、`/api/order/:orderId`、`POST/PATCH/DELETE /api/order`、`/api/receipt/list`、`PATCH /api/receipt/:receiptId`、`/api/notrecovery/list`、`/api/recovery/list` 已先落地内存订单/回单仓储和集成测试，兼容旧运单字段、`billingAt` 日期格式、回单状态文案、订单创建联动 `company_order/receipt/memory`。
- `/api/memory/list` 已先落地内存记忆词条仓储和集成测试，兼容旧 `{ data: [{ value }] }` 这种不带 `code/message` 的响应结构，并复用订单创建副作用写入的 memory 数据。
- `/api/chart/headerList`、`/api/chart/company/order/count`、`/api/chart/company/order/sumfreight`、`/api/chart/company/receipt/sumreceipt` 已先落地内存图表统计仓储和集成测试，兼容旧顶部统计标题、公司维度字段名 `ordercount/sumfreight/sumReceipt`、登录鉴权要求。
- 前端工作台 `src/api/dashboard.ts` 已改为通过封装层读取旧 `chart` 接口组合数据，不再依赖未实现的 `/chart/dashboard`；配套 `dashboard.test.ts` 覆盖旧字段映射、公司维度聚合和实际请求路径。
- `/api/upload/avatar` 已先落地 multipart 头像上传兼容入口和集成测试，兼容旧字段名 `avatar`、上传成功文案、头像读取 bytes + `Content-Type` 直出。
- 第一阶段登录服务通过 `AuthService` / `AuthUserStore` / `TokenIssuer` 抽象解耦；当前测试使用内存用户仓储，不声称已经连接旧 MySQL。
- 第一阶段菜单服务通过 `MenuService` / `MenuStore` 抽象解耦；当前测试使用内存菜单仓储，不声称已经连接旧 MySQL。
- 第一阶段公司服务通过 `CompanyService` / `CompanyStore` 抽象解耦；当前测试使用内存公司仓储，不声称已经连接旧 MySQL。
- 第一阶段用户管理服务通过 `UserService` / `UserStore` 抽象解耦；当前测试使用内存用户管理仓储，不声称已经连接旧 MySQL 或真实头像文件存储。
- 第一阶段头像上传通过 `UserService::update_avatar` 与文件落盘解耦；当前文件目录默认指向旧 `adminYh-server/uploads/avatar`，后续 SQLx 实现必须把 avatar 表更新和 user.avatar_url 更新纳入同一事务。
- 第一阶段角色管理服务通过 `RoleService` / `RoleStore` 抽象解耦；当前测试使用内存角色仓储，不声称已经连接旧 MySQL。
- 第一阶段订单/回单服务通过 `OrderService` / `ReceiptService` / `OrderStore` 抽象解耦；当前测试使用内存订单仓储，不声称已经连接旧 MySQL。
- 第一阶段记忆词条通过 `MemoryService` 复用订单聚合仓储，保持与订单创建副作用在同一事务边界内演进。
- 第一阶段图表统计服务通过 `ChartService` / `ChartStore` 抽象解耦；当前测试使用内存图表仓储，不声称已经连接旧 MySQL，后续 SQLx 仓储应直接复刻旧 `order_list/company/company_order/receipt` 聚合口径。
- 旧 MD5 密码算法已在兼容层实现并测试；后续接入真实 `user` 表后，再把 `AuthUserStore` 替换为 SQLx/MySQL repository，并补充影子库登录回归。
