import { Badge } from '@/components/ui/badge'
import { PageShell, PageSurface } from '@/components/layout/PageScaffold'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const migrationStacks = [
  { title: '桌面壳', value: 'Tauri 2 + Rust sidecar' },
  { title: '后端服务', value: 'Rust Axum + SQLx MySQL' },
  { title: '前端框架', value: 'React 19 + TypeScript + Vite' },
  { title: '模板体系', value: 'frontend-template layout/ui/theme 封装' },
  { title: '数据迁移', value: 'admin-migration dry-run / apply / verify / verify-files' },
  { title: '发布门禁', value: 'check-all + release contract + Docker/Tauri gates' },
]

const runtimeModules = [
  { name: '兼容 API', description: '保留旧 code/data/message envelope、旧路径和中文文案，前端只通过 src/api/* 调用。' },
  { name: '数据库迁移', description: '保留 11 张旧兼容表、弱关联口径、MD5 首登升级和头像文件校验。' },
  { name: '前端页面', description: '订单、回单、公司、用户、角色、菜单、工作台和设置入口都复用模板组件。' },
  { name: '桌面交付', description: 'Tauri 打包时由主进程托管 admin-api sidecar，renderer 不直接暴露 shell/fs/process 权限。' },
]

const codingStandards = [
  '页面使用 PageShell、PageSurface、Table、Badge 等模板组件组合，不复制旧 Vue/Element Plus 样式。',
  '业务页面不得直接 fetch、axios、apiRequest 或 Web Storage，所有请求和偏好都走封装层。',
  '后端 handler 不散写 SQL、权限和响应结构，业务逻辑集中到 service/repository/DTO。',
  '每个独立切片必须先验证再 commit，开发期提交保留 [skip ci]，发布候选再手动触发重型门禁。',
]

const releaseGates = [
  { gate: '日常提交', command: 'CARGO_OFFLINE=true scripts/check-all.sh' },
  { gate: '真实 MySQL', command: 'RUN_DB_TESTS=true ADMIN_DB_TEST_DATABASE_URL=... scripts/check-all.sh' },
  { gate: '迁移验收', command: 'OLD_DATABASE_URL=... NEW_DATABASE_URL=... NEW_AVATAR_DIR=... scripts/test-migration.sh' },
  { gate: '发布候选', command: 'RELEASE_GATE=true scripts/check-all.sh' },
]

export default function SystemOverview() {
  return (
    <PageShell
      title="系统概览"
      description="从旧 /main/analysis/overview 迁移而来的只读说明页，集中展示重构架构、维护规范和发布门禁。"
      width="7xl"
    >
      <div className="space-y-6">
        <PageSurface title="关于" description="宇涵物流订单系统正在重构为 Rust + Tauri 桌面应用。">
          <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
            新版本保留旧后台的订单、回单、公司、用户、角色、菜单、图表统计和头像数据语义，同时把接口、数据库、桌面壳和前端页面拆成可测试、可回滚、可维护的企业级模块。
          </p>
        </PageSurface>

        <PageSurface title="技术栈" description="旧 Vue 概览页的技术栈说明已更新为当前 Rust + Tauri 架构。">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {migrationStacks.map((stack) => (
              <div key={stack.title} className="rounded-md border border-border/70 bg-background/70 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{stack.title}</div>
                <div className="mt-2 text-sm font-semibold text-foreground">{stack.value}</div>
              </div>
            ))}
          </div>
        </PageSurface>

        <PageSurface title="模块边界" description="前后端按封装边界维护，避免业务页面和 handler 继续扩散隐式逻辑。">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>模块</TableHead>
                <TableHead>维护边界</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runtimeModules.map((module) => (
                <TableRow key={module.name}>
                  <TableCell className="font-medium">{module.name}</TableCell>
                  <TableCell className="text-muted-foreground">{module.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PageSurface>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
          <PageSurface title="项目规范" description="从旧概览页的规范说明迁移为当前工程约束。">
            <div className="space-y-3">
              {codingStandards.map((standard) => (
                <div key={standard} className="flex gap-3 rounded-md border border-border/70 bg-background/70 p-3 text-sm text-muted-foreground">
                  <Badge variant="secondary" className="h-fit shrink-0">
                    规范
                  </Badge>
                  <span>{standard}</span>
                </div>
              ))}
            </div>
          </PageSurface>

          <PageSurface title="发布门禁" description="常用验证入口集中展示，发布候选必须保存完整日志。">
            <div className="space-y-3">
              {releaseGates.map((gate) => (
                <div key={gate.gate} className="rounded-md border border-border/70 bg-background/70 p-3">
                  <div className="text-sm font-medium">{gate.gate}</div>
                  <code className="mt-2 block break-all rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">{gate.command}</code>
                </div>
              ))}
            </div>
          </PageSurface>
        </div>
      </div>
    </PageShell>
  )
}
