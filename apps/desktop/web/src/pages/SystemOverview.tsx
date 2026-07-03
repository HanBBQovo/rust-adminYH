import { Badge } from '@/components/ui/badge'
import { PageShell, PageSurface } from '@/components/layout/PageScaffold'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const systemCards = [
  { title: '桌面应用', value: '本机客户端 + 本地服务托管' },
  { title: '服务接口', value: '统一兼容接口与权限校验' },
  { title: '数据存储', value: 'MySQL 业务库 + 头像文件目录' },
  { title: '界面体系', value: '统一后台布局、主题和组件规范' },
  { title: '数据迁移', value: '预检、迁移、对账、文件校验闭环' },
  { title: '发布检查', value: '本地门禁、容器验收、桌面打包验收' },
]

const runtimeModules = [
  { name: '兼容接口', description: '保留旧系统响应结构、旧路径和中文提示，统一处理登录、权限和错误反馈。' },
  { name: '数据库迁移', description: '覆盖核心业务表、弱关联口径、首次登录密码升级和头像文件校验。' },
  { name: '业务页面', description: '订单、回单、公司、用户、角色、菜单、工作台和设置入口保持统一后台体验。' },
  { name: '桌面交付', description: '桌面包托管本地服务，文件导出和运行诊断由受控桌面能力完成。' },
]

const codingStandards = [
  '页面、表格、筛选、弹窗、提示和空态保持统一后台组件规范。',
  '接口访问、会话、偏好和本地文件能力都通过封装层处理。',
  '权限、校验、响应结构和数据访问由后端服务边界集中维护。',
  '每次变更都先通过对应质量门禁，再进入发布候选验收。',
]

const releaseGates = [
  { gate: '日常提交', status: '基础编译、单元测试、前端构建和静态契约检查' },
  { gate: '真实数据库', status: '仓储、路由、文件目录和业务联动在测试库复验' },
  { gate: '迁移验收', status: '旧库预检、新库写入、数据对账和头像文件校验' },
  { gate: '发布候选', status: '容器、浏览器、桌面包和打包后本地服务全链路验收' },
]

export default function SystemOverview() {
  return (
    <PageShell
      title="系统概览"
      description="集中查看当前系统形态、数据边界和发布验收状态。"
      width="7xl"
    >
      <div className="space-y-6">
        <PageSurface title="关于" description="宇涵物流订单系统已整合桌面端、服务端和数据迁移能力。">
          <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
            新版本保留订单、回单、公司、用户、角色、菜单、图表统计和头像数据语义，同时把接口、数据库、桌面交付和前端页面纳入可测试、可回滚、可维护的企业级模块。
          </p>
        </PageSurface>

        <PageSurface title="运行架构" description="桌面端、服务端、数据库和发布验收保持清晰边界。">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {systemCards.map((stack) => (
              <div key={stack.title} className="rounded-md border border-border/70 bg-background/70 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{stack.title}</div>
                <div className="mt-2 text-sm font-semibold text-foreground">{stack.value}</div>
              </div>
            ))}
          </div>
        </PageSurface>

        <PageSurface title="模块边界" description="核心模块按职责维护，避免隐式规则分散到页面或接口处理流程中。">
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
          <PageSurface title="项目规范" description="关键业务路径保持统一交互、统一服务边界和可审计变更。">
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

          <PageSurface title="发布门禁" description="发布前按场景逐级验收，失败时保留日志和回滚证据。">
            <div className="space-y-3">
              {releaseGates.map((gate) => (
                <div key={gate.gate} className="rounded-md border border-border/70 bg-background/70 p-3">
                  <div className="text-sm font-medium">{gate.gate}</div>
                  <div className="mt-2 text-xs leading-5 text-muted-foreground">{gate.status}</div>
                </div>
              ))}
            </div>
          </PageSurface>
        </div>
      </div>
    </PageShell>
  )
}
