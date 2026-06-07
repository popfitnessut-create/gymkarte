// 生年月日から年齢を自動計算
export function calcAge(birthdate) {
  if (!birthdate) return null
  const b = new Date(birthdate)
  if (isNaN(b)) return null
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age
}

export const STATUS_LABEL = {
  active: 'アクティブ',
  paused: '休会',
  withdrawn: '退会',
  cancelled: '解約'
}

// 表示用の会員ID。手動入力(member_code)があればそれを、なければ内部idを#0001形式で
export function memberCode(m) {
  if (!m) return ''
  const c = m.member_code != null ? String(m.member_code).trim() : ''
  if (c) return c
  return '#' + String(m.id).padStart(4, '0')
}

export const GENDER_LABEL = {
  male: '男性',
  female: '女性',
  other: 'その他'
}

export function fmtDate(s) {
  if (!s) return '—'
  return s.slice(0, 10)
}
