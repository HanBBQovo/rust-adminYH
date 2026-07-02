import { getTauriCore } from '@/desktop/tauri'

export interface DesktopTextExport {
  filename: string
  contents: string
}

export async function saveOrdersCsvWithDesktopDialog(exportFile: DesktopTextExport): Promise<boolean> {
  const core = getTauriCore()
  if (!core) return false

  return core.invoke<boolean>('export_orders_csv', {
    filename: exportFile.filename,
    contents: exportFile.contents,
  })
}
