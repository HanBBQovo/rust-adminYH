# 数据库迁移校验清单

日期：2026-07-01  
范围：旧后端 `/Users/hanhan/Desktop/code/adminYh-server` 到新 Rust + Tauri 项目 `rust-adminYH`

## 1. 目标

- 完整迁移旧 MySQL 数据、头像文件和关键业务语义。
- 所有生产写入前必须先在影子库执行 dry-run、apply、verify。
- 第一阶段保留旧表名和旧字段名，通过 Rust DTO/Service 层做命名和安全增强。
- 所有校验必须可重复执行，并纳入 `scripts/test-migration.sh`。

## 2. 旧库事实

代码审计确认旧后端使用 Koa + mysql2，数据库连接来自 `src/app/database.js`。该文件读取 `config.MYSQL_PROT`，而配置导出是 `MYSQL_PORT`，新系统必须修正为显式端口配置。

旧代码没有 migration/schema 文件，真实字段类型、索引、字符集、约束必须以线上 MySQL `information_schema` 和 `mysqldump --no-data` 为准，代码反推只作为辅助。

### 2.1 核心表

| 表 | 用途 | 迁移策略 |
|---|---|---|
| `user` | 用户、旧 token、头像 URL、启用状态 | 保留 ID；旧 MD5 密码兼容登录后升级 Argon2；不要直接丢弃 `token` 语义 |
| `role` | 角色 | 保留 ID、名称、说明、时间字段 |
| `user_role` | 用户角色关系 | 校验用户和角色孤儿关系；新系统可加唯一约束 |
| `permission` | 菜单/权限 | 保留 `pid/type/url/icon/sort`；修复响应拼写但兼容旧字段映射 |
| `role_permission` | 角色菜单关系 | 分配前应先清理旧关系；迁移时报告重复关系 |
| `company` | 发货公司 | 保留名称；重复名称先报告，不直接合并 |
| `order_list` | 运单主表 | 保留旧字段名；`billingAt` 是毫秒时间戳语义 |
| `company_order` | 公司-订单弱关联 | 保留 `com_name/order_id`；校验 `order_id` 是否存在 |
| `receipt` | 回单 | 保留中文状态文本；`oddnumber` 弱关联订单号 |
| `avatar` | 头像元数据 | 与磁盘 `uploads/avatar` 双向校验 |
| `memory` | 收/发货人记忆词条 | 保留文本，报告重复 |

### 2.2 隐式业务语义

- `user.password` 是无 salt MD5；新系统必须提供旧密码兼容层，并在首次成功登录后升级为 Argon2 PHC。新建用户和改密必须直接写入 Argon2，避免继续产生旧 MD5。
- 旧登录成功会把 token 写回 `user.token`，形成“单用户单 token”效果；新系统需明确是保留 token version 还是改 session 表。
- 旧用户 `58` 是硬编码保护账号，第一阶段兼容删除保护；用户创建会同时写 `user`、`user_role`、默认头像记录和 `avatar_url`，后续 SQLx 实现必须放到事务中。
- 旧角色菜单分配逻辑只插入 `role_permission`，不清理旧关系；新系统兼容接口必须改为事务内先删除再插入，并在迁移报告中统计重复关系。
- `order_list.billingAt`、`receipt.billingAt` 是毫秒时间戳，不按秒级 Unix time 迁移。
- 订单创建会写入 `order_list` 和 `company_order`；`receiptnum > 0` 时写入 `receipt`。
- 新建回单默认状态：`recoverystate='未回收'`、`issuestate='未发放'`、`poststate='未寄出'`。
- `company_order.com_name` 与 `company.name` 文本关联，`receipt.oddnumber` 与 `order_list.oddnumber` 文本关联，第一版不强行改成纯 ID 模型。
- 公司改名第一阶段保持旧行为：只更新 `company.name`，不自动级联历史 `order_list.company` 或 `company_order.com_name`。后续如要增强必须单独设计迁移脚本、对账和回滚策略。
- 订单/回单兼容接口第一阶段保留 `company_order.com_name`、`receipt.oddnumber` 文本关联；新 SQLx 仓储必须把订单创建、公司关联、回单创建、memory 记忆写入放进同一个事务。
- `/memory/list` 旧响应只有 `{ data }`、无 `code/message`；迁移后的 API 兼容层要保留该形状，前端自动补全依赖 `SELECT name value FROM memory` 的 `value` 字段。
- 图表统计接口直接依赖 `order_list.sumfreight`、`order_list.receiptnum`、`company.name`、`company_order.com_name`、`receipt` 总行数；迁移校验要按旧 SQL 口径对比四个 `/chart/*` 响应，不要先改成新维表口径。
- 旧前端回单“接收”会写入 `issuestate='已接收'`，但筛选枚举里还有 `已发放/未发放`；迁移时不得强行归一化，必须先按真实 `SELECT DISTINCT issuestate` 输出分布并由人工确认。
- 头像默认文件为 `default.jpg`；旧头像目录为 `/Users/hanhan/Desktop/code/adminYh-server/uploads/avatar`。
- 头像上传旧字段名为 multipart `avatar`，上传成功响应 `{ code: 0, message: '上传头像成功！' }`；迁移后仍要保留 `/upload/avatar` 与 `/users/:userId/avatar`，后者必须直接输出图片 bytes 与原 `mimetype`。

## 3. 迁移阶段

### Phase 0：冻结和备份

生产迁移前必须完成：

```bash
mysqldump --single-transaction --routines --triggers --default-character-set=utf8mb4 <OLD_DB> > backups/admin_yh_full.sql
mysqldump --no-data --default-character-set=utf8mb4 <OLD_DB> > backups/admin_yh_schema.sql
tar -C /Users/hanhan/Desktop/code/adminYh-server/uploads -czf backups/admin_yh_avatar.tgz avatar
```

同时记录：

- MySQL 版本、字符集、排序规则、时区。
- 每张表 `COUNT(*)`、主键 `MIN/MAX(id)`。
- 每个索引、唯一约束、外键约束。
- 头像文件路径、大小、SHA256。

### Phase 1：影子库还原

- 创建 `admin_yh_shadow_old` 并导入旧 dump。
- 创建 `admin_yh_shadow_new` 并应用新 schema。
- 所有迁移 CLI 先只连影子库，不允许直接写生产旧库。

### Phase 2：dry-run 清洗报告

dry-run 只读旧库和新库，输出：

- 每表待迁移行数、最大 ID、关键字段空值数量。
- 重复用户、重复公司、重复订单号、重复 memory。
- 孤儿关系：`user_role`、`role_permission`、`company_order`、`receipt.oddnumber`、`avatar.user_id`。
- 状态枚举：`receipt.recoverystate/issuestate/poststate` 的 `SELECT DISTINCT`。
- 日期边界：`billingAt`、`createAt`、`updateAt` 的最小/最大值。
- 头像文件缺失、DB 多余记录、磁盘孤儿文件。

当前已落地 `admin-migration inspect-old` 和 `migrate --dry-run` 的审计报告 v1：

- 数据库连接使用 SQLx MySQL 动态查询，报告只读旧库，不写入生产旧库或新库。
- `inspect-old --old <OLD_DATABASE_URL> --old-avatar-dir <OLD_AVATAR_DIR> --format json` 输出每表行数、ID 边界、重复数据、孤儿关系、回单状态枚举、日期边界、头像文件 SHA256 和 DB/磁盘差异。
- `migrate --dry-run --old <OLD_DATABASE_URL> --new <NEW_DATABASE_URL> --old-avatar-dir <OLD_AVATAR_DIR> --format json` 复用同一套旧库审计，并明确标记 `dry-run only`，禁止真实写入。
- `verify-files --old-avatar-dir <OLD_AVATAR_DIR> --new-avatar-dir <NEW_AVATAR_DIR> --format json` 对比头像文件相对路径和 SHA256，用于迁移后的文件完整性检查；缺失、多余或 hash 变化都会输出 `status=failed` 并以非 0 退出，不能把文件差异当成普通 warning 放过。
- `migrate --old <OLD_DATABASE_URL> --new <NEW_DATABASE_URL> --old-avatar-dir <OLD_AVATAR_DIR> --new-avatar-dir <NEW_AVATAR_DIR> --format json` 已支持真实 apply；默认拒绝写入非空目标库，只有影子库明确需要增量/复跑时才允许加 `--allow-non-empty-target`。
- 真实 apply 按白名单字段复制 11 张兼容表，保留旧 `id`、MD5 密码、`user.token`、中文回单状态、毫秒 `billingAt`、`company_order.com_name` 和 `receipt.oddnumber`，每张表复制后立即校验行数与 ID 边界，并设置 `AUTO_INCREMENT = MAX(id)+1`。
- `verify --old <OLD_DATABASE_URL> --new <NEW_DATABASE_URL> --format json` 已从脚手架升级为真实对账：比较所有核心表行数/ID、订单聚合、回单状态分布、RBAC 分布、弱关联孤儿数量、日期边界和头像 DB 指标；任何不一致都会返回 `status=failed`。

当前已落地 SQLx 兼容数据库层第一阶段：

- `admin-db` 已从占位连接池切换为真实 `sqlx::MySqlPool`，连接配置继续通过 `DATABASE_URL`、连接数和超时环境变量控制。
- `202607010001_init_compat_schema.sql` 已建立 11 张核心旧表的兼容 schema：`role`、`permission`、`user`、`company`、`memory`、`avatar`、`user_role`、`role_permission`、`order_list`、`company_order`、`receipt`。
- 第一版 schema 保留旧表名、旧字段名、`billingAt` 毫秒字段、中文回单状态、`company_order.com_name` 和 `receipt.oddnumber` 弱关联；暂不加硬外键或唯一约束，避免未审计旧脏数据被 schema 阻断。
- `MySqlOrderRepository` 已实现订单、回单、memory 的 SQLx 参数化仓储：订单创建在事务内写入 `order_list`、`company_order`、可选 `receipt`，并对收/发货人 memory 做存在性检查后再插入。
- `MySqlCompanyRepository` 已实现公司分页、详情、新增、修改、删除；`Countorder` 按旧口径从 `company_order.com_name` 统计，未命中详情保持空数组语义，公司改名不级联历史订单或公司订单文本。
- 真实 MySQL 回归已覆盖公司仓储：列表分页、详情数组/空数组、`Countorder` 文本弱关联统计、创建/改名/删除，以及公司改名后历史 `company_order.com_name` 不被静默重写的兼容边界。
- 真实 MySQL 回归已覆盖图表仓储：首页 header 指标增量、公司订单数、公司运费和回单汇总继续按旧 `company_order`、`order_list`、`receipt` 弱关联口径聚合，避免迁移时误改统计口径。
- 真实 MySQL 回归已覆盖角色/菜单仓储：角色筛选/增删改、菜单树旧 `children/chilren` 双形状、菜单新增旧 `partentId` 兼容、角色菜单 ID 汇总、权限分配去重替换和失败校验不污染既有 `role_permission`。
- `MySqlChartRepository` 已实现旧图表 snapshot 查询，继续保留旧口径差异：公司订单数来自 `company_order.com_name`，运费和回单数来自 `order_list.company/sumfreight/receiptnum`，回单总数来自 `receipt`。
- `MySqlUserRepository` 已实现旧用户和认证 SQLx 仓储，登录 token 继续写回 `user.token`，用户创建在事务内写入 `user`、`user_role`、默认 `avatar`，头像更新在事务内同步 `avatar` 和 `user.avatar_url`。真实 MySQL 回归已覆盖头像元数据更新：更新后只保留当前用户一条 `avatar` 记录，`user.avatar_url` 继续指向 `/users/:id/avatar`，缺失用户不会插入孤儿头像。
- SQLx 动态筛选已补充真实 MySQL 空筛选回归：用户、角色、订单和回单的 list/count 在无筛选项时不会拼接悬空 `WHERE`，文本筛选为空字符串时跳过条件，避免迁移后旧前端默认列表请求触发 SQL 语法错误或全表 `LIKE '%%'` 伪筛选。
- 密码安全升级已接入：`CompatPasswordVerifier` 支持旧 MD5 与 Argon2；认证成功且原密码为 MD5 时会回写 Argon2，用户创建和改密也会写入 Argon2。真实 MySQL 回归已纳入 `mysql_user_auth_repository` 发布级 gate，验证旧 MD5 首登升级、错误密码不污染旧 hash/token、`user.token` 单点登录写回、新建/改密 Argon2 写入。生产切换前必须确认旧 Node 服务不会继续并行读取同一写库，否则升级后的用户无法再由旧服务登录。
- 生产 token 策略已从开发态 `dev-{user_id}-{uuid}` 切换为 32 字节随机 opaque token，仍保留写回 `user.token` 的旧单用户单 token 语义；旧库已有 token 只作为迁移数据保留，新系统新登录会覆盖为新格式。
- `MySqlMenuRepository`、`MySqlRoleRepository` 已实现旧 RBAC SQLx 仓储，菜单从 `permission` 拉平后在 Rust 构树，角色授权通过事务替换 `role_permission`，并对重复 `menuList` 做幂等去重。
- `admin-api` 生产启动路径已通过 `build_mysql_pool` 装配全部 SQLx 仓储；未设置可连接 `DATABASE_URL` 时生产 API 会启动失败，测试路径仍通过 `AppState::with_services` 注入内存仓储。
- Docker/CI 可通过 `DATABASE_MIGRATE_ON_START=true` 在 API 启动时执行兼容 schema migration；生产环境是否启用必须由发布流程明确控制，避免未备份生产库时自动变更结构。

### Phase 3：apply 迁移

建议顺序：

1. `role`
2. `permission`
3. `user`
4. `company`
5. `memory`
6. `avatar`
7. `user_role`
8. `role_permission`
9. `order_list`
10. `company_order`
11. `receipt`
12. 头像文件复制和 hash 校验
13. 汇总业务对账

每个阶段必须在事务中批量写入。核心业务表迁移后立即执行行数、最大 ID、抽样 hash 校验。

### Phase 4：verify 对账

阻断级校验必须全部通过：

- 每张表行数一致。
- 每张含自增 ID 的表最大 ID 一致。
- `SUM(order_list.sumfreight)` 一致。
- `SUM(order_list.receiptnum)` 一致。
- `receipt` 按 `recoverystate/issuestate/poststate` 分组计数一致。
- `company_order.order_id` 全部能找到 `order_list.id`。
- `receipt.oddnumber` 缺失对应订单号的数量已记录并经人工确认。
- 用户角色分布一致。
- 角色菜单数量和根/子菜单数量一致。
- 头像 DB 记录与磁盘文件 hash 一致；缺失文件有 fallback 策略。
- 随机抽样 50 条订单、50 条回单、10 个用户详情字段一致。

## 4. 推荐校验 SQL

### 4.1 表行数和 ID

```sql
SELECT 'user' table_name, COUNT(*) row_count, MIN(id) min_id, MAX(id) max_id FROM user
UNION ALL SELECT 'role', COUNT(*), MIN(id), MAX(id) FROM role
UNION ALL SELECT 'permission', COUNT(*), MIN(id), MAX(id) FROM permission
UNION ALL SELECT 'company', COUNT(*), MIN(id), MAX(id) FROM company
UNION ALL SELECT 'order_list', COUNT(*), MIN(id), MAX(id) FROM order_list
UNION ALL SELECT 'receipt', COUNT(*), MIN(id), MAX(id) FROM receipt;
```

### 4.2 关键汇总

```sql
SELECT COUNT(*) order_count, COALESCE(SUM(sumfreight), 0) total_sumfreight, COALESCE(SUM(receiptnum), 0) total_receipts
FROM order_list;

SELECT recoverystate, issuestate, poststate, COUNT(*) total
FROM receipt
GROUP BY recoverystate, issuestate, poststate
ORDER BY recoverystate, issuestate, poststate;
```

### 4.3 脏数据扫描

```sql
SELECT name, COUNT(*) total FROM user GROUP BY name HAVING COUNT(*) > 1;
SELECT name, COUNT(*) total FROM company GROUP BY name HAVING COUNT(*) > 1;
SELECT oddnumber, COUNT(*) total FROM order_list GROUP BY oddnumber HAVING COUNT(*) > 1;

SELECT ur.* FROM user_role ur LEFT JOIN user u ON u.id = ur.user_id WHERE u.id IS NULL;
SELECT ur.* FROM user_role ur LEFT JOIN role r ON r.id = ur.role_id WHERE r.id IS NULL;
SELECT rp.* FROM role_permission rp LEFT JOIN role r ON r.id = rp.role_id WHERE r.id IS NULL;
SELECT rp.* FROM role_permission rp LEFT JOIN permission p ON p.id = rp.permission_id WHERE p.id IS NULL;
SELECT co.* FROM company_order co LEFT JOIN order_list o ON o.id = co.order_id WHERE o.id IS NULL;
SELECT r.* FROM receipt r LEFT JOIN order_list o ON o.oddnumber = r.oddnumber WHERE o.id IS NULL;
SELECT a.* FROM avatar a LEFT JOIN user u ON u.id = a.user_id WHERE u.id IS NULL;
```

### 4.4 旧枚举固化

```sql
SELECT DISTINCT recoverystate FROM receipt ORDER BY recoverystate;
SELECT DISTINCT issuestate FROM receipt ORDER BY issuestate;
SELECT DISTINCT poststate FROM receipt ORDER BY poststate;
```

## 5. 脚本接入

当前入口：

```bash
scripts/test-migration.sh
```

该脚本默认会输出 `admin-migration rollback-plan --format json`，用于持续校验回滚步骤没有从发布门禁中丢失。

环境变量：

- `OLD_DATABASE_URL`：旧库或影子旧库连接串。
- `NEW_DATABASE_URL`：新库或影子新库连接串。
- `OLD_AVATAR_DIR`：旧头像目录，默认 `/Users/hanhan/Desktop/code/adminYh-server/uploads/avatar`。
- `NEW_AVATAR_DIR`：新头像目录；设置后执行双向文件校验。

当 `admin-migration` crate 创建后，脚本会执行：

```bash
cargo test -p admin-migration
cargo run -p admin-migration -- inspect-old --old "$OLD_DATABASE_URL" --old-avatar-dir "$OLD_AVATAR_DIR" --format json
cargo run -p admin-migration -- migrate --dry-run --old "$OLD_DATABASE_URL" --new "$NEW_DATABASE_URL" --old-avatar-dir "$OLD_AVATAR_DIR" --format json
cargo run -p admin-migration -- verify --old "$OLD_DATABASE_URL" --new "$NEW_DATABASE_URL" --format json
```

真实迁移 apply 只在显式开启时执行，避免误写生产库：

```bash
MIGRATION_APPLY=true \
OLD_DATABASE_URL=mysql://user:pass@127.0.0.1/admin_yh_shadow_old \
NEW_DATABASE_URL=mysql://user:pass@127.0.0.1/admin_yh_shadow_new \
OLD_AVATAR_DIR=/Users/hanhan/Desktop/code/adminYh-server/uploads/avatar \
NEW_AVATAR_DIR=/tmp/admin-yh-new-avatar \
scripts/test-migration.sh
```

如目标影子库不是空库，必须人工确认后额外设置 `MIGRATION_ALLOW_NON_EMPTY_TARGET=true`；生产切换前不建议开启该选项。

如果设置 `NEW_AVATAR_DIR`，脚本还会执行：

```bash
cargo run -p admin-migration -- verify-files --old-avatar-dir "$OLD_AVATAR_DIR" --new-avatar-dir "$NEW_AVATAR_DIR" --format json
```

`verify-files` 的 `status` 必须为 `passed`。如果输出 `missingInNew`、`extraInNew` 或 `changed`，脚本会失败退出；发布前必须先补齐缺失文件、移除多余文件或重新复制变化文件后再复验。

## 6. 未决策项

- 是否保留旧 `user.token` 单点登录语义，或迁到 session 表。
- 重复 `role_permission` 是否迁移时去重，还是保留并在清洗报告中阻断。
- `receipt.oddnumber` 无订单时是允许历史脏数据保留，还是迁移前修复。

## 7. 已决策行为

- 订单删除不再兼容旧系统“只删 `order_list`”的危险行为；新仓储必须在事务内先定位订单原始 `oddnumber`，清理 `company_order.order_id`，当没有其它订单继续使用同一 `oddnumber` 时清理对应 `receipt.oddnumber`，最后删除 `order_list`。旧库迁移前仍需审计已存在孤儿关系和重复 `oddnumber`，避免误删历史凭证。
