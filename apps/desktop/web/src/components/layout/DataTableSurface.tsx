import type { ComponentProps, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { InlineLoader } from '@/components/PageLoader'
import { PageSurface } from '@/components/layout/PageScaffold'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Pagination, type PaginationProps } from '@/components/ui/pagination'
import { TableCell, TableHead } from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface DataTableSurfaceProps {
  title: string
  description?: string
  loading?: boolean
  error?: string | null
  emptyTitle: string
  emptyDescription?: string
  emptyActions?: ReactNode
  actions?: ReactNode
  isEmpty: boolean
  onRetry?: () => void
  pagination?: PaginationProps
  children: ReactNode
}

export function DataTableSurface({
  title,
  description,
  loading = false,
  error,
  emptyTitle,
  emptyDescription,
  emptyActions,
  actions,
  isEmpty,
  onRetry,
  pagination,
  children,
}: DataTableSurfaceProps) {
  const footer = pagination ? <Pagination {...pagination} /> : null

  return (
    <PageSurface title={title} description={description} actions={actions} footer={footer} bodyClassName="p-0">
      {error ? (
        <div className="p-5">
          <ErrorState message={error} onRetry={onRetry} />
        </div>
      ) : loading ? (
        <div className="flex h-64 items-center justify-center">
          <InlineLoader />
        </div>
      ) : isEmpty ? (
        <EmptyState title={emptyTitle} description={emptyDescription} actions={emptyActions} />
      ) : (
        <div className="ops-table-shell">{children}</div>
      )}
    </PageSurface>
  )
}

export function StickyActionHead({
  className,
  children = '操作',
}: {
  className?: string
  children?: ReactNode
}) {
  return <TableHead className={cn('sticky left-0 z-10 bg-background', className)}>{children}</TableHead>
}

export function StickyActionCell({ className, children }: { className?: string; children: ReactNode }) {
  return <TableCell className={cn('sticky left-0 z-10 bg-background', className)}>{children}</TableCell>
}

export function DataTableActionGroup({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex items-center gap-1', className)}>{children}</div>
}

export function DataTableIconAction({
  className,
  destructive = false,
  icon: Icon,
  label,
  type = 'button',
  ...props
}: Omit<ComponentProps<typeof Button>, 'aria-label' | 'children' | 'size' | 'variant'> & {
  destructive?: boolean
  icon: LucideIcon
  label: string
}) {
  return (
    <Button type={type} variant="ghost" size="icon" aria-label={label} className={className} {...props}>
      <Icon className={cn('h-4 w-4', destructive && 'text-destructive')} />
    </Button>
  )
}

export function DataTableRowNumberHead({
  className,
  children = '序号',
}: {
  className?: string
  children?: ReactNode
}) {
  return <TableHead className={cn('w-14 text-right', className)}>{children}</TableHead>
}

export function DataTableRowNumberCell({
  className,
  value,
}: {
  className?: string
  value: ReactNode
}) {
  return <TableCell className={cn('text-right font-mono text-xs text-muted-foreground', className)}>{value}</TableCell>
}

export const DataTableSequenceCell = DataTableRowNumberCell

export function DataTableDateCell({
  className,
  empty = '-',
  value,
}: {
  className?: string
  empty?: ReactNode
  value?: ReactNode
}) {
  return <TableCell className={cn('font-mono text-xs', className)}>{value ? value : empty}</TableCell>
}
