import { useEffect, useState } from 'react'
import { fmtDate } from '../lib/format'

// 日次カルテ一括閲覧タブ（読み取り専用の一覧）。記録は各セッションカルテ内で行う。
export default function DailyListTab({ memberId }) {
  const [logs, setLogs] = useState([])

  useEffect(() => {
    window.api.daily.list(memberId).then(setLogs)
  }, [memberId])

  if (logs.length === 0) {
    return (
      <div className="max-w-5xl rounded-xl border border-dashed border-navy-600 p-10 text-center text-gray-500">
        日次カルテはまだありません。セッション記録のカルテ内で体重・体調などを入力すると、ここに一覧表示されます。
      </div>
    )
  }

  return (
    <div className="max-w-5xl">
      <p className="mb-3 text-sm text-gray-400">日次カルテ <span className="font-medium text-gray-100">{logs.length}</span> 件（新しい順）</p>
      <div className="overflow-hidden rounded-xl border border-navy-700">
        <table className="w-full text-sm">
          <thead className="bg-navy-800 text-xs text-gray-400">
            <tr>
              <th className="w-40 px-4 py-2 text-left">日付</th>
              <th className="px-4 py-2 text-left">日次カルテ</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((d) => (
              <tr key={d.id} className="border-t border-navy-700 align-top">
                <td className="whitespace-nowrap px-4 py-2.5 text-gray-300">{fmtDate(d.log_date)}</td>
                <td className="whitespace-pre-wrap px-4 py-2.5 text-gray-300">{d.member_comment || d.trainer_note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
