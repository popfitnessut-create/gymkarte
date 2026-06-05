// 会員プラン属性の定義（回数券 / 月額プラン）

export const PLAN_TYPES = [
  { value: 'ticket', label: '回数券' },
  { value: 'monthly', label: '月額プラン' }
]

export const TICKET_PLANS = ['8回数券', '12回数券']
export const MONTHLY_PLANS = ['ポッププラン', 'パワフルプラン', '特別プラン', 'スタートプラン']

// 回数券の規定回数と価格（新規購入時に自動反映）
export const TICKET_SPECS = {
  '8回数券': { count: 8, price: 25600 },
  '12回数券': { count: 12, price: 31800 }
}

// 月の利用回数に上限があるプラン（残数に月の残り回数を反映）
export const MONTHLY_LIMITS = {
  'ポッププラン': 4
}

export function planOptions(planType) {
  return planType === 'monthly' ? MONTHLY_PLANS : TICKET_PLANS
}

// 利用状況の自動ラベル（回数券会員は「◯回数券」、月額はプラン名）
export function usageLabel(member) {
  return member?.plan_name || (member?.plan_type === 'monthly' ? '月額プラン' : '回数券')
}

// ドロップダウン用の部位リスト
export const MUSCLE_OPTIONS = [
  '胸', '腹', '前腕', '大腿四頭筋', '肩(前)', '肩(後)',
  '背中(広背筋)', '僧帽筋', 'ハムストリングス', '臀部', 'ふくらはぎ',
  '上腕二頭筋', '上腕三頭筋', '脚全体', '全身'
]
