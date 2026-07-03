import { apiRequest } from '@/api/client'

export interface LegacyMenuNode {
  id: number
  name: string
  type: number
  url?: string | null
  icon?: string | null
  sort: number
  permission?: string | null
  createAt?: string | null
  updateAt?: string | null
  parentId?: number | null
  partentId?: number | null
  children?: LegacyMenuNode[] | null
  chilren?: LegacyMenuNode[] | null
}

export interface MenuTreeItem {
  id: number
  name: string
  type: number
  url?: string | null
  icon?: string | null
  sort: number
  permission?: string | null
  createAt?: string | null
  updateAt?: string | null
  parentId: number | null
  children: MenuTreeItem[]
}

export interface MenuMutationPayload {
  name: string
  type: number
  sort: number
  url?: string
  icon?: string
  parentId?: number | null
}

export type MenuCreatePayload = MenuMutationPayload

export interface MenuCreateFormValues {
  name: string
  type: string
  sort: string
  url: string
  icon: string
  parentId: string
}

export function legacyMenuChildren(node: LegacyMenuNode): LegacyMenuNode[] {
  return [...(node.children ?? []), ...(node.chilren ?? [])]
}

export function normalizeMenuTree(nodes: LegacyMenuNode[]): MenuTreeItem[] {
  return nodes
    .map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      url: node.url,
      icon: node.icon,
      sort: node.sort,
      permission: node.permission,
      createAt: node.createAt,
      updateAt: node.updateAt,
      parentId: node.parentId ?? node.partentId ?? null,
      children: normalizeMenuTree(legacyMenuChildren(node)),
    }))
    .sort((left, right) => left.sort - right.sort || left.id - right.id)
}

export function flattenMenuTree(nodes: MenuTreeItem[], depth = 0): Array<MenuTreeItem & { depth: number }> {
  return nodes.flatMap((node) => [
    { ...node, depth },
    ...flattenMenuTree(node.children, depth + 1),
  ])
}

export function buildMenuCreatePayload(values: MenuCreateFormValues): MenuMutationPayload {
  const payload: MenuMutationPayload = {
    name: values.name.trim(),
    type: Number(values.type),
    sort: Number(values.sort),
  }
  const url = values.url.trim()
  const icon = values.icon.trim()
  if (url) payload.url = url
  if (icon) payload.icon = icon
  if (values.parentId) payload.parentId = Number(values.parentId)
  else payload.parentId = null
  return payload
}

export async function listMenuTree(): Promise<LegacyMenuNode[]> {
  return apiRequest<LegacyMenuNode[]>('/menu/tree')
}

export async function getMenu(menuId: number): Promise<LegacyMenuNode | null> {
  return apiRequest<LegacyMenuNode | null>(`/menu/${menuId}`)
}

export async function createMenu(payload: MenuMutationPayload): Promise<void> {
  await apiRequest('/menu', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateMenu(menuId: number, payload: MenuMutationPayload): Promise<void> {
  await apiRequest(`/menu/${menuId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteMenu(menuId: number): Promise<void> {
  await apiRequest(`/menu/${menuId}`, {
    method: 'DELETE',
  })
}
