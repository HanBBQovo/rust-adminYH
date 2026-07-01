import { RefreshCw } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { getDashboardSummary, type DashboardRange, type PendingTask } from '@/api/dashboard'
import { InlineLoader } from '@/components/PageLoader'
import { PageShell, PageStat, PageStatStrip, PageSurface } from '@/components/layout/PageScaffold'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { ErrorState } from '@/components/ui/error-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency, formatNumber } from '@/lib/formatters'
import { motion, staggerContainer, staggerItem } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useResource } from '@/lib/use-resource'
import { useState } from 'react'

const RANGE_OPTIONS: Array<[DashboardRange, string]> = [
  ['7d', '近 7 天'],
  ['30d', '近 30 天'],
]

const chartConfig: ChartConfig = {
  freight: { label: '运费', color: 'hsl(var(--chart-1))' },
  receipts: { label: '回单', color: 'hsl(var(--chart-2))' },
}

const taskMeta: Record<PendingTask['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  normal: { label: '正常', variant: 'secondary' },
  warning: { label: '待跟进', variant: 'outline' },
  danger: { label: '异常', variant: 'destructive' },
}

export default function Workspace() {
  const [range, setRange] = useState<DashboardRange>('7d')
  const { data, loading, error, refresh } = useResource(() => getDashboardSummary(range), [range])

  return (
    <PageShell
      title="工作台"
      description="物流订单、运费、发货公司和回单状态的桌面端总览。"
      width="7xl"
      actions={
        <>
          <div className="flex rounded-md border border-border/70 bg-background/80 p-0.5">
            {RANGE_OPTIONS.map(([value, label]) => (
              <Button key={value} type="button" variant={range === value ? 'default' : 'ghost'} size="sm" className="h-7 rounded-md px-2.5 text-xs" onClick={() => setRange(value)}>
                {label}
              </Button>
            ))}
          </div>
          <Button type="button" variant="outline" className="gap-2" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            刷新
          </Button>
        </>
      }
    >
      {error ? (
        <PageSurface>
          <ErrorState message={error} onRetry={refresh} />
        </PageSurface>
      ) : loading && !data ? (
        <div className="flex h-64 items-center justify-center">
          <InlineLoader />
        </div>
      ) : data ? (
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
          <PageStatStrip>
            {data.stats.map((stat) => (
              <motion.div key={stat.key} variants={staggerItem}>
                <PageStat
                  label={stat.label}
                  value={stat.unit === '¥' ? formatCurrency(stat.value) : formatNumber(stat.value)}
                  note={stat.note}
                />
              </motion.div>
            ))}
          </PageStatStrip>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.85fr)]">
            <PageSurface title="运费趋势" description="Rust API 就绪后接 /api/chart/dashboard，当前开发态保留确定性 mock。">
              <div className="h-[320px] min-w-0">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <AreaChart accessibilityLayer data={data.freightTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="freightFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-freight)" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="var(--color-freight)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis tickLine={false} axisLine={false} tickMargin={4} tickFormatter={(value) => `¥${Number(value).toLocaleString('zh-CN')}`} />
                    <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                    <Area type="monotoneX" dataKey="freight" stroke="var(--color-freight)" strokeWidth={2} fill="url(#freightFill)" dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ChartContainer>
              </div>
            </PageSurface>

            <PageSurface title="待处理事项" description="把旧系统的回单、订单和资料异常收口到统一工作队列。">
              <div className="ops-table-shell">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>编号</TableHead>
                      <TableHead>事项</TableHead>
                      <TableHead>负责人</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.pendingTasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className="font-mono text-xs">{task.id}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{task.title}</span>
                            <span className="text-xs text-muted-foreground">{task.updatedAt}</span>
                          </div>
                        </TableCell>
                        <TableCell>{task.owner}</TableCell>
                        <TableCell>
                          <Badge variant={taskMeta[task.status].variant}>{taskMeta[task.status].label}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </PageSurface>
          </div>
        </motion.div>
      ) : null}
    </PageShell>
  )
}
