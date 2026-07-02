import { describe, expect, it, vi } from 'vitest'

import type { LegacyOrder } from '@/api/orders'
import { saveOrdersCsvWithDesktopDialog } from '@/desktop/export'
import { buildOrdersCsv, downloadOrdersCsv, exportOrdersCsv, orderExportFilename } from '@/pages/orders/order-export'

vi.mock('@/desktop/export', () => ({
  saveOrdersCsvWithDesktopDialog: vi.fn(),
}))

const ORDER_ROW: LegacyOrder = {
  id: 1,
  oddnumber: 'YD20260702001',
  billingAt: '2026-07-02',
  consignee: '张三',
  consigneephone: '13800000000',
  address: '上海,浦东新区',
  method: '送货',
  goodsname: '设备',
  number: '2',
  pack: '木箱',
  weight: '20',
  measurement: '1',
  cainsurance: '是',
  value: '1000',
  insurance: '10',
  consignor: '李四',
  consignorphone: '13900000000',
  freight: '100',
  delivery: '20',
  sumfreight: '120',
  freightstate: '现付',
  paynow: '120',
  paygo: '',
  payback: '',
  paymonth: '',
  receiptnum: 1,
  company: '顺丰速运',
  remarks: '备注 "重要"\n跨行',
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(blob)
  })
}

function mockBrowserDownload() {
  let capturedBlob: Blob | null = null
  const createObjectURL = vi.fn((blob: Blob | MediaSource) => {
    capturedBlob = blob as Blob
    return 'blob:orders-csv'
  })
  const revokeObjectURL = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })

  const click = vi.fn()
  const createElement = document.createElement.bind(document)
  const anchors: HTMLAnchorElement[] = []
  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
    const element = createElement(tagName, options)
    if (tagName.toLowerCase() === 'a') {
      Object.defineProperty(element, 'click', { configurable: true, value: click })
      anchors.push(element as HTMLAnchorElement)
    }
    return element
  }) as typeof document.createElement)

  return {
    anchors,
    click,
    createObjectURL,
    get capturedBlob() {
      return capturedBlob
    },
    revokeObjectURL,
  }
}

describe('order export', () => {
  it('builds CSV with the legacy order column order and escaped values', () => {
    const csv = buildOrdersCsv([ORDER_ROW])
    const [header, row] = csv.split('\n')

    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(header.slice(1)).toBe(
      '运单号,开单时间,收货人,收货人号码,收货地址,送货方式,货物名称,货物数量,货物包装,货物重量(KG),货物体积(m³),是否参保,声明价值,保险费,发货人,发货人号码,运费(元),送货费(元),合计运费(元),付款方式,现付(元),到付(元),回付(元),月结(元),回单数量,发货单位,备注',
    )
    expect(row).toContain('YD20260702001')
    expect(row).toContain('"上海,浦东新区"')
    expect(csv).toContain('"备注 ""重要""\n跨行"')
  })

  it('uses a deterministic file name and object URL for browser downloads', async () => {
    const browserDownload = mockBrowserDownload()

    downloadOrdersCsv([ORDER_ROW], { now: new Date('2026-07-02T08:00:00Z') })

    expect(orderExportFilename(new Date('2026-07-02T08:00:00Z'))).toBe('orders-2026-07-02.csv')
    expect(browserDownload.createObjectURL).toHaveBeenCalledTimes(1)
    expect(browserDownload.revokeObjectURL).toHaveBeenCalledWith('blob:orders-csv')
    expect(browserDownload.click).toHaveBeenCalledTimes(1)
    expect(browserDownload.anchors[0]).toMatchObject({
      href: 'blob:orders-csv',
      download: 'orders-2026-07-02.csv',
      rel: 'noopener',
    })
    expect(browserDownload.capturedBlob).toBeTruthy()
    await expect(readBlobText(browserDownload.capturedBlob!)).resolves.toContain('YD20260702001')
  })

  it('uses the desktop save dialog before falling back to browser downloads', async () => {
    vi.mocked(saveOrdersCsvWithDesktopDialog).mockResolvedValueOnce(true)

    await expect(exportOrdersCsv([ORDER_ROW], { now: new Date('2026-07-02T08:00:00Z') })).resolves.toBe('desktop')

    expect(saveOrdersCsvWithDesktopDialog).toHaveBeenCalledWith({
      filename: 'orders-2026-07-02.csv',
      contents: buildOrdersCsv([ORDER_ROW]),
    })
  })

  it('falls back to browser download when desktop save is unavailable or cancelled', async () => {
    vi.mocked(saveOrdersCsvWithDesktopDialog).mockResolvedValueOnce(false)
    const browserDownload = mockBrowserDownload()

    await expect(exportOrdersCsv([ORDER_ROW], { now: new Date('2026-07-02T08:00:00Z') })).resolves.toBe('browser')

    expect(browserDownload.click).toHaveBeenCalledTimes(1)
    expect(browserDownload.anchors[0]?.download).toBe('orders-2026-07-02.csv')
  })
})
