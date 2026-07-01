import type { LegacyOrder, OrderMutationPayload } from '@/api/orders'

export type OrderFormMode = 'create' | 'edit' | 'view'
export type OrderFormValues = OrderMutationPayload

export interface OrderFormField {
  key: keyof OrderFormValues
  label: string
  placeholder?: string
  required?: boolean
  type?: 'input' | 'date' | 'textarea' | 'select'
  options?: string[]
}

export const ORDER_REQUIRED_FIELDS: Array<keyof OrderFormValues> = [
  'oddnumber',
  'billingAt',
  'consignee',
  'address',
  'method',
  'goodsname',
  'number',
  'pack',
  'cainsurance',
  'consignor',
  'freight',
  'sumfreight',
  'freightstate',
  'receiptnum',
  'company',
]

export const ORDER_FORM_FIELDS: OrderFormField[] = [
  { key: 'oddnumber', label: '运单号', placeholder: '请输入运单号', required: true },
  { key: 'billingAt', label: '开单时间', type: 'date', required: true },
  { key: 'consignee', label: '收货人', placeholder: '请输入收货人', required: true },
  { key: 'consigneephone', label: '收货人号码', placeholder: '请输入收货人号码' },
  { key: 'address', label: '收货地址', placeholder: '请输入收货地址', required: true },
  { key: 'method', label: '送货方式', type: 'select', options: ['送货', '自提'], required: true },
  { key: 'goodsname', label: '货物名称', placeholder: '请输入货物名称', required: true },
  { key: 'number', label: '货物数量', placeholder: '请输入货物数量', required: true },
  { key: 'pack', label: '货物包装', type: 'select', options: ['纸箱', '桶', '托', '木架', '木箱', '纤袋', '铁', '无包装'], required: true },
  { key: 'weight', label: '货物重量(KG)', placeholder: '请输入货物重量' },
  { key: 'measurement', label: '货物体积(m³)', placeholder: '请输入货物体积' },
  { key: 'cainsurance', label: '是否参保', type: 'select', options: ['是', '否'], required: true },
  { key: 'value', label: '声明价值', placeholder: '请输入声明价值' },
  { key: 'insurance', label: '保险费', placeholder: '请输入保险费' },
  { key: 'consignor', label: '发货人', placeholder: '请输入发货人', required: true },
  { key: 'consignorphone', label: '发货人号码', placeholder: '请输入发货人号码' },
  { key: 'freight', label: '运费(元)', placeholder: '请输入运费', required: true },
  { key: 'delivery', label: '送货费(元)', placeholder: '请输入送货费' },
  { key: 'sumfreight', label: '合计运费(元)', placeholder: '请输入合计运费', required: true },
  { key: 'freightstate', label: '付款方式', type: 'select', options: ['现付', '到付', '回付', '月结'], required: true },
  { key: 'paynow', label: '现付(元)', placeholder: '请输入现付金额' },
  { key: 'paygo', label: '到付(元)', placeholder: '请输入到付金额' },
  { key: 'payback', label: '回付(元)', placeholder: '请输入回付金额' },
  { key: 'paymonth', label: '月结(元)', placeholder: '请输入月结金额' },
  { key: 'receiptnum', label: '回单数量', placeholder: '请输入回单数量(没有填0)', required: true },
  { key: 'company', label: '发货单位', placeholder: '请输入发货单位', required: true },
  { key: 'remarks', label: '备注', type: 'textarea', placeholder: '请输入备注(没有可不填)' },
]

function todayText() {
  return new Date().toISOString().slice(0, 10)
}

export function createEmptyOrderForm(): OrderFormValues {
  return {
    oddnumber: '',
    billingAt: todayText(),
    consignee: '',
    consigneephone: '',
    address: '',
    method: '送货',
    goodsname: '',
    number: '',
    pack: '纸箱',
    weight: '',
    measurement: '',
    cainsurance: '否',
    value: '',
    insurance: '',
    consignor: '',
    consignorphone: '',
    freight: '',
    delivery: '',
    sumfreight: '',
    freightstate: '现付',
    paynow: '',
    paygo: '',
    payback: '',
    paymonth: '',
    receiptnum: 0,
    company: '',
    remarks: '',
  }
}

export function orderToFormValues(order: LegacyOrder): OrderFormValues {
  return {
    oddnumber: order.oddnumber,
    billingAt: order.billingAt,
    consignee: order.consignee,
    consigneephone: order.consigneephone,
    address: order.address,
    method: order.method,
    goodsname: order.goodsname,
    number: order.number,
    pack: order.pack,
    weight: order.weight,
    measurement: order.measurement,
    cainsurance: order.cainsurance,
    value: order.value,
    insurance: order.insurance,
    consignor: order.consignor,
    consignorphone: order.consignorphone,
    freight: order.freight,
    delivery: order.delivery,
    sumfreight: order.sumfreight,
    freightstate: order.freightstate,
    paynow: order.paynow,
    paygo: order.paygo,
    payback: order.payback,
    paymonth: order.paymonth,
    receiptnum: order.receiptnum,
    company: order.company,
    remarks: order.remarks,
  }
}

export function validateOrderForm(values: OrderFormValues): Partial<Record<keyof OrderFormValues, string>> {
  return Object.fromEntries(
    ORDER_REQUIRED_FIELDS
      .filter((key) => String(values[key] ?? '').trim() === '')
      .map((key) => [key, `${ORDER_FORM_FIELDS.find((field) => field.key === key)?.label || key}不能为空`]),
  ) as Partial<Record<keyof OrderFormValues, string>>
}
