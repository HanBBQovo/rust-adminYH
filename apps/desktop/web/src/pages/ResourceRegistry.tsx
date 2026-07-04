import { RefreshCw } from 'lucide-react'

import { listResourceSummaries, type ResourceSummary } from '@/api/registry'
import { DataTableSurface } from '@/components/layout/DataTableSurface'
import { DataTableToolbar } from '@/components/layout/DataTableToolbar'
import { PageShell } from '@/components/layout/PageScaffold'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatNumber } from '@/lib/formatters'
import { useResource } from '@/lib/use-resource'
import { useMemo, useState } from 'react'

const statusMeta: Record<ResourceSummary['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ready: { label: '可接入', variant: 'secondary' },
  building: { label: '建设中', variant: 'outline' },
  blocked: { label: '待后端', variant: 'destructive' },
}

const legacyModuleLabels: Record<ResourceSummary['key'], string> = {
  orders: '订单管理',
  receipts: '回单管理',
  companies: '发货公司',
  users: '用户管理',
  roles: '角色权限',
  menus: '菜单权限',
}

export default function ResourceRegistry() {
  const [keyword, setKeyword] = useState('')
  const { data, loading, error, refresh } = useResource(listResourceSummaries, [])
  const rows = useMemo(() => {
    const normalized = keyword.trim().toLocaleLowerCase('zh-CN')
    if (!normalized) return data ?? []
    return (data ?? []).filter((item) =>
      [item.title, item.description, item.apiPath, item.owner, legacyModuleLabels[item.key]].join(' ').toLocaleLowerCase('zh-CN').includes(normalized),
    )
  }, [data, keyword])

  return (
    <PageShell
      title="页面注册表"
      description="前端导航、旧模块、兼容 API 和 Rust 服务边界的集中映射。"
      width="7xl"
      actions={
        <Button type="button" variant="outline" className="gap-2" onClick={refresh} disabled={loading}>
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          刷新
        </Button>
      }
    >
      <DataTableSurface
        title="业务模块"
        description="集中查看可用业务模块、兼容接口、数据量和维护归属。"
        loading={loading && !data}
        error={error}
        emptyTitle="没有匹配模块"
        emptyDescription="请调整关键词或刷新模块数据。"
        isEmpty={!rows.length}
        onRetry={refresh}
        toolbar={
          <DataTableToolbar
            searchValue={keyword}
            onSearchChange={setKeyword}
            searchPlaceholder="搜索模块、API 或负责人..."
          />
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>模块</TableHead>
              <TableHead>兼容 API</TableHead>
              <TableHead>旧模块</TableHead>
              <TableHead>负责人</TableHead>
              <TableHead className="text-right">记录数</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((item) => (
              <TableRow key={item.key}>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{item.title}</span>
                    <span className="max-w-md text-xs text-muted-foreground">{item.description}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">{item.apiPath}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{legacyModuleLabels[item.key]}</TableCell>
                <TableCell>{item.owner}</TableCell>
                <TableCell className="text-right font-mono">{formatNumber(item.count)}</TableCell>
                <TableCell>
                  <Badge variant={statusMeta[item.status].variant}>{statusMeta[item.status].label}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableSurface>
    </PageShell>
  )
}
