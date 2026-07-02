export function legacyListResponse(row: unknown | null) {
  return { code: 0, data: { list: row ? [row] : [], totalCount: row ? 1 : 0 } }
}
