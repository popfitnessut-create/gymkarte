// ボディマップ：前面・背面の簡易シルエットで鍛えた部位を複数選択
// 各部位はSVG図形。selected配列に部位名を保持し、クリックでトグルする。

const FILL = '#243154'
const SEL = '#2f81f7'

// 前面の部位定義（name と SVG要素）
const FRONT = [
  { name: '肩(前)', el: (on) => (<>
    <circle cx="38" cy="58" r="9" fill={on ? SEL : FILL} />
    <circle cx="82" cy="58" r="9" fill={on ? SEL : FILL} />
  </>) },
  { name: '胸', el: (on) => <rect x="42" y="58" width="36" height="24" rx="8" fill={on ? SEL : FILL} /> },
  { name: '腹', el: (on) => <rect x="46" y="84" width="28" height="34" rx="6" fill={on ? SEL : FILL} /> },
  { name: '前腕', el: (on) => (<>
    <rect x="20" y="92" width="12" height="34" rx="6" fill={on ? SEL : FILL} />
    <rect x="88" y="92" width="12" height="34" rx="6" fill={on ? SEL : FILL} />
  </>) },
  { name: '大腿四頭筋', el: (on) => (<>
    <rect x="44" y="122" width="14" height="48" rx="7" fill={on ? SEL : FILL} />
    <rect x="62" y="122" width="14" height="48" rx="7" fill={on ? SEL : FILL} />
  </>) }
]

// 背面の部位定義
const BACK = [
  { name: '僧帽筋', el: (on) => <path d="M42 50 L78 50 L70 72 L50 72 Z" fill={on ? SEL : FILL} /> },
  { name: '肩(後)', el: (on) => (<>
    <circle cx="38" cy="58" r="9" fill={on ? SEL : FILL} />
    <circle cx="82" cy="58" r="9" fill={on ? SEL : FILL} />
  </>) },
  { name: '背中(広背筋)', el: (on) => <path d="M44 74 L76 74 L72 106 L48 106 Z" fill={on ? SEL : FILL} /> },
  { name: '上腕三頭筋', el: (on) => (<>
    <rect x="22" y="66" width="12" height="26" rx="6" fill={on ? SEL : FILL} />
    <rect x="86" y="66" width="12" height="26" rx="6" fill={on ? SEL : FILL} />
  </>) },
  { name: '上腕二頭筋', el: (on) => (<>
    <rect x="20" y="92" width="12" height="22" rx="6" fill={on ? SEL : FILL} />
    <rect x="88" y="92" width="12" height="22" rx="6" fill={on ? SEL : FILL} />
  </>) },
  { name: '臀部', el: (on) => <rect x="44" y="108" width="32" height="22" rx="9" fill={on ? SEL : FILL} /> },
  { name: 'ハムストリングス', el: (on) => (<>
    <rect x="44" y="132" width="14" height="38" rx="7" fill={on ? SEL : FILL} />
    <rect x="62" y="132" width="14" height="38" rx="7" fill={on ? SEL : FILL} />
  </>) },
  { name: 'ふくらはぎ', el: (on) => (<>
    <rect x="46" y="172" width="12" height="30" rx="6" fill={on ? SEL : FILL} />
    <rect x="62" y="172" width="12" height="30" rx="6" fill={on ? SEL : FILL} />
  </>) }
]

// 体のアウトライン（前面・背面共通）
function Silhouette() {
  return (
    <g strokeWidth="0" fill="none">
      <path d="M60 18 a12 12 0 1 0 0.01 0 Z" fill="#1a2440" />
      <path d="M40 44 Q60 36 80 44 L96 92 L86 96 L78 64 L78 130 L72 205 L62 205 L60 140 L58 205 L48 205 L42 130 L42 64 L34 96 L24 92 Z" fill="#1a2440" />
    </g>
  )
}

export default function BodyMap({ selected, onToggle }) {
  const isOn = (n) => selected.includes(n)
  return (
    <div className="flex gap-6">
      {[{ title: '前面', parts: FRONT }, { title: '背面', parts: BACK }].map((side) => (
        <div key={side.title} className="flex flex-col items-center">
          <span className="mb-1 text-xs text-gray-400">{side.title}</span>
          <svg viewBox="0 0 120 215" width="130" height="233" className="select-none">
            <Silhouette />
            {side.parts.map((p) => (
              <g key={p.name} onClick={() => onToggle(p.name)} className="cursor-pointer"
                 style={{ transition: 'opacity .15s' }}>
                {p.el(isOn(p.name))}
              </g>
            ))}
          </svg>
        </div>
      ))}
    </div>
  )
}

export const ALL_MUSCLES = [...FRONT, ...BACK].map((p) => p.name)
