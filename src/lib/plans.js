// 会員プラン属性の定義（回数券 / 月額プラン）

export const PLAN_TYPES = [
  { value: 'ticket', label: '回数券' },
  { value: 'monthly', label: '月額プラン' }
]

export const TICKET_PLANS = ['8回数券', '12回数券']
export const MONTHLY_PLANS = ['ポッププラン', 'パワフルプラン', '特別プラン', 'スタートプラン']

// 単発利用（1回のみ・¥4,980）。回数券タブの新規購入から選べる。
// 残数アラートの対象外。最終利用日+6ヶ月で退会アラートの対象になる。
export const SINGLE_USE_PLAN = '単発利用'

// 回数券の規定回数と価格（新規購入時に自動反映）
export const TICKET_SPECS = {
  '8回数券': { count: 8, price: 25600 },
  '12回数券': { count: 12, price: 31800 },
  '単発利用': { count: 1, price: 4980, single: true }
}

// 回数券タブの「新規購入」で選べる券種（単発利用を含む）
export const PURCHASE_PLANS = [...TICKET_PLANS, SINGLE_USE_PLAN]

// 単発利用かどうか（券種名で判定）
export function isSingleUse(planName) {
  return planName === SINGLE_USE_PLAN || !!(TICKET_SPECS[planName] && TICKET_SPECS[planName].single)
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

// 回数券の有効期限を購入日から自動計算する。
// 既定で4ヶ月後の同日。対象月にその日が存在しない場合は月末日に丸める。
// 例: 2025-10-31 購入 → 2026-02-28（2月に31日がないため月末）
export function ticketExpiry(purchasedISO, months = 4) {
  if (!purchasedISO) return ''
  const m = String(purchasedISO).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
  const targetIndex = (mo - 1) + months          // 0始まりの通算月
  const ty = y + Math.floor(targetIndex / 12)
  const tm = ((targetIndex % 12) + 12) % 12       // 0始まりの月
  const lastDay = new Date(ty, tm + 1, 0).getDate()
  const td = Math.min(d, lastDay)
  const pad = (n) => String(n).padStart(2, '0')
  return `${ty}-${pad(tm + 1)}-${pad(td)}`
}

// ドロップダウン用の部位リスト
export const MUSCLE_OPTIONS = [
  '胸', '腹', '前腕', '大腿四頭筋', '肩(前)', '肩(後)',
  '背中(広背筋)', '僧帽筋', 'ハムストリングス', '臀部', 'ふくらはぎ',
  '上腕二頭筋', '上腕三頭筋', '脚全体', '全身'
]
