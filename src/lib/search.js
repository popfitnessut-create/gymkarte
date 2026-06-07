import Fuse from 'fuse.js'

// 高精度あいまい検索。氏名（漢字）・フリガナ・電話番号・会員IDを対象に
// ローマ字も含めてマッチさせるため、ローマ字化したキーも索引に追加する。
const kataToHira = (s) =>
  (s || '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))

// 簡易ヘボン式ローマ字化（カタカナ → ローマ字）。完全網羅ではないが主要音をカバー。
const ROMA = {
  ア:'a',イ:'i',ウ:'u',エ:'e',オ:'o',カ:'ka',キ:'ki',ク:'ku',ケ:'ke',コ:'ko',
  サ:'sa',シ:'shi',ス:'su',セ:'se',ソ:'so',タ:'ta',チ:'chi',ツ:'tsu',テ:'te',ト:'to',
  ナ:'na',ニ:'ni',ヌ:'nu',ネ:'ne',ノ:'no',ハ:'ha',ヒ:'hi',フ:'fu',ヘ:'he',ホ:'ho',
  マ:'ma',ミ:'mi',ム:'mu',メ:'me',モ:'mo',ヤ:'ya',ユ:'yu',ヨ:'yo',
  ラ:'ra',リ:'ri',ル:'ru',レ:'re',ロ:'ro',ワ:'wa',ヲ:'o',ン:'n',
  ガ:'ga',ギ:'gi',グ:'gu',ゲ:'ge',ゴ:'go',ザ:'za',ジ:'ji',ズ:'zu',ゼ:'ze',ゾ:'zo',
  ダ:'da',ヂ:'ji',ヅ:'zu',デ:'de',ド:'do',バ:'ba',ビ:'bi',ブ:'bu',ベ:'be',ボ:'bo',
  パ:'pa',ピ:'pi',プ:'pu',ペ:'pe',ポ:'po',
  キャ:'kya',キュ:'kyu',キョ:'kyo',シャ:'sha',シュ:'shu',ショ:'sho',
  チャ:'cha',チュ:'chu',チョ:'cho',ニャ:'nya',ニュ:'nyu',ニョ:'nyo',
  ヒャ:'hya',ヒュ:'hyu',ヒョ:'hyo',ミャ:'mya',ミュ:'myu',ミョ:'myo',
  リャ:'rya',リュ:'ryu',リョ:'ryo',ギャ:'gya',ギュ:'gyu',ギョ:'gyo',
  ジャ:'ja',ジュ:'ju',ジョ:'jo',ビャ:'bya',ビュ:'byu',ビョ:'byo',
  ピャ:'pya',ピュ:'pyu',ピョ:'pyo'
}

function toRomaji(furigana) {
  if (!furigana) return ''
  // フリガナはカタカナ前提。ひらがなならカタカナへ寄せる
  const kata = (furigana || '').replace(/[ぁ-ゖ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) + 0x60))
  let out = ''
  let i = 0
  while (i < kata.length) {
    const two = kata.substr(i, 2)
    if (ROMA[two]) { out += ROMA[two]; i += 2; continue }
    const one = kata[i]
    out += ROMA[one] || ''
    i += 1
  }
  return out
}

// 会員配列から検索インデックスを構築
export function buildIndex(members) {
  const docs = members.map((m) => ({
    ...m,
    _hira: kataToHira(m.furigana),
    _roma: toRomaji(m.furigana),
    _idstr: String(m.id),
    _code: m.member_code != null ? String(m.member_code) : ''
  }))
  const fuse = new Fuse(docs, {
    includeScore: true,
    includeMatches: true,
    threshold: 0.4,
    ignoreLocation: true,
    keys: ['name', 'furigana', '_hira', '_roma', 'phone', '_idstr', '_code']
  })
  return fuse
}

// クエリ実行。最大10件、スコア順
export function runSearch(fuse, query) {
  if (!query || !query.trim()) return null
  return fuse.search(query.trim()).slice(0, 10)
}

// マッチ箇所をhighlightするためのヘルパー（nameフィールドのみ簡易対応）
export function highlightName(result) {
  const name = result.item.name
  const match = (result.matches || []).find((m) => m.key === 'name')
  if (!match) return [{ text: name, hl: false }]
  const parts = []
  let last = 0
  for (const [s, e] of match.indices) {
    if (s > last) parts.push({ text: name.slice(last, s), hl: false })
    parts.push({ text: name.slice(s, e + 1), hl: true })
    last = e + 1
  }
  if (last < name.length) parts.push({ text: name.slice(last), hl: false })
  return parts
}
