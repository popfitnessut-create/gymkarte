import { useMemo, useState } from 'react'
import {
  BookOpen, Search, Rocket, Users, UserPlus, IdCard, Dumbbell, Ticket,
  LineChart, FileText, LayoutGrid, ClipboardList, BarChart3, Bell, Settings,
  FileSpreadsheet, HelpCircle
} from 'lucide-react'

/* ====== マニュアル本文の見た目を整える小さな部品 ====== */
function Sub({ children }) {
  return <h3 className="mt-5 mb-2 text-sm font-semibold text-accent">{children}</h3>
}
function P({ children }) {
  return <p className="mb-3 text-sm leading-relaxed text-gray-300">{children}</p>
}
function Steps({ items }) {
  return (
    <ol className="mb-3 ml-1 space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-sm leading-relaxed text-gray-300">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">{i + 1}</span>
          <span>{t}</span>
        </li>
      ))}
    </ol>
  )
}
function Bullets({ items }) {
  return (
    <ul className="mb-3 ml-1 space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-sm leading-relaxed text-gray-300">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}
function Note({ children, type = 'info' }) {
  const styles = {
    info: 'border-accent/40 bg-accent/5 text-gray-300',
    warn: 'border-amber-500/40 bg-amber-500/5 text-gray-200',
    tip: 'border-green-500/40 bg-green-500/5 text-gray-200'
  }
  const label = { info: 'ポイント', warn: '注意', tip: 'ヒント' }
  return (
    <div className={`mb-3 rounded-lg border px-3 py-2 text-sm leading-relaxed ${styles[type]}`}>
      <span className="mr-1 font-semibold">{label[type]}：</span>{children}
    </div>
  )
}

/* ====== マニュアル各章 ====== */
const SECTIONS = [
  {
    id: 'start', title: 'はじめに・基本操作', icon: Rocket,
    keywords: '保存 同期 画面 起動 戻る',
    body: () => (
      <>
        <P>GymKarte（ジムカルテ）は、会員のカルテ・回数券・手続き・統計をまとめて管理するアプリです。左側のメニューから各画面に移動します。</P>
        <Sub>画面の移動</Sub>
        <Bullets items={[
          '左メニュー：ダッシュボード／会員一覧／手続き／会員統計／ヘルプ・マニュアル／設定。',
          '会員一覧で会員名をクリックすると、その人の詳細カルテが開きます。',
          '詳細画面は上部のタブ（基本情報・セッション記録・回数券 など）で切り替えます。'
        ]} />
        <Sub>保存について</Sub>
        <P>入力しただけでは保存されません。各画面の「保存」ボタンを押して確定します。保存が終わると「保存が完了しました」と表示されます。</P>
        <Note type="warn">画面を切り替える・閉じる前に、必ず「保存」を押してください。未保存のまま移動すると入力内容が消えます。</Note>
        <Sub>データの共有（同期）</Sub>
        <P>店舗PCと自宅PCで同じデータを共有しています。保存した内容は自動でクラウドへ送られ、もう一方のPCを起動すると最新が取り込まれます。反映には数秒かかることがあります。</P>
      </>
    )
  },
  {
    id: 'members', title: '会員一覧', icon: Users,
    keywords: '検索 並び替え フィルタ ステータス マルチ',
    body: () => (
      <>
        <P>登録済みの会員を一覧で確認・検索する画面です。アプリ起動時の最初の画面でもあります。</P>
        <Sub>会員を探す</Sub>
        <Steps items={[
          '上部の検索欄に、氏名・フリガナ・電話番号・会員IDのいずれかを入力します（あいまい検索に対応）。',
          'ステータスで絞り込む場合は「すべて／アクティブ／休会／退会／解約」を選びます。',
          '並び順は「フリガナ順／会員ID順／登録順／手動並び替え」から選べます。会員ID順・フリガナ順は昇順/降順の切り替えも可能です。'
        ]} />
        <Sub>手動で並び替える</Sub>
        <P>並び順を「手動並び替え」にすると、各行の上下ボタンで順番を入れ替えられます（自動保存）。※検索欄に文字が入っていると手動並び替えは使えません。</P>
        <Sub>会員カルテを開く</Sub>
        <P>一覧の行をクリックすると、その会員の詳細カルテが開きます。残回数が少ない会員（回数券）や、記録表が未お渡しの会員には色付きのバッジが表示されます。</P>
        <Sub>複数人をまとめて記録する（マルチ展開）</Sub>
        <Steps items={[
          '各行のチェックボックスで記録したい会員を選びます（最大10名）。',
          '「マルチ展開」ボタンを押すと、選んだ会員を並べて同時に記録できる画面に移ります（→「マルチカルテ」章）。'
        ]} />
      </>
    )
  },
  {
    id: 'new-member', title: '新規会員の登録', icon: UserPlus,
    keywords: '新規 登録 入会 課金 会費ペイ',
    body: () => (
      <>
        <Steps items={[
          '会員一覧の「新規会員登録」ボタンを押します。',
          '会員ID（任意・空欄なら自動採番）、氏名、フリガナ、電話番号、性別、生年月日、入会日を入力します。',
          '「登録」を押すと、その会員の詳細画面が開きます。プラン種別など残りの情報は基本情報タブで入力・保存します。'
        ]} />
        <Note type="warn">新規会員を登録すると、ダッシュボードに「会費ペイにて◯◯様の初回継続課金日の変更を行なってください」というアラートが出ます。会費ペイ側で設定を済ませたら「変更済み」を押して消してください（→「ダッシュボードのアラート対応」章）。</Note>
      </>
    )
  },
  {
    id: 'detail', title: '基本情報の編集', icon: IdCard,
    keywords: '基本情報 プラン 編集 削除 ステータス',
    body: () => (
      <>
        <P>会員詳細の「基本情報」タブで、その人の情報を編集します。</P>
        <Steps items={[
          '氏名・連絡先・入会日などのほか、ステータス（アクティブ／休会／退会／解約）、プラン種別（回数券／月額）、プラン名を設定します。',
          '目標・健康状態・備考・初回カウンセリング内容も記入できます。',
          '入力後、「保存」ボタンを押します。'
        ]} />
        <Note>入会日を変更すると、在籍年数（記念品アラート）はその日付から自動で計算し直されます。</Note>
        <Note type="warn">「削除」を押すと会員データはすべて消え、元に戻せません。退会者は削除ではなくステータスを「退会／解約」にする運用をおすすめします。</Note>
        <Note>別のPCで同じ会員を先に編集していた場合、保存時に「上書きするか／最新を読み込むか」の確認が出ます。</Note>
      </>
    )
  },
  {
    id: 'sessions', title: 'セッション記録', icon: Dumbbell,
    keywords: 'セッション トレーニング メニュー 重量 回数 HIIT 部位 日次',
    body: () => (
      <>
        <P>来店ごとのトレーニング内容を記録するタブです。1回の来店＝1枚のカルテです。</P>
        <Sub>新しいカルテを追加する</Sub>
        <Steps items={[
          '「新規カルテを追加」ボタンを押すと、一番下に新しい記録カードが開きます。',
          '日付・人数・担当トレーナー・鍛えた部位（①②）を選びます。',
          'トレーニングメニューを入力します（次項）。',
          '必要に応じて日次カルテ欄に体重・体調・食事・睡眠などを書きます。',
          '「保存」を押します。'
        ]} />
        <Sub>メニューの入力</Sub>
        <Bullets items={[
          'プリセットから入れる：「＋ プリセット種目から追加」で種目を選ぶと1行追加されます。',
          '手動で入れる：「種目を追加」で空の行を足し、種目を選びます。',
          '各種目はセットごとに「重量(kg)・回数」を入力。プランクなど時間種目は「回数/秒数」を切り替えて秒数を入力します。',
          'HIITを選んだ場合は、子種目名・重量・秒数を入力します（子種目は1つ以上必要）。'
        ]} />
        <Sub>回数券の消費</Sub>
        <P>回数券プランの会員は「回数券を1回消費する」チェックで消費を記録します。残数はカルテごとに自動で計算されて表示されます。</P>
        <Note type="warn">回数券が残0の会員を保存しようとすると、購入画面に切り替わります。購入を登録すると、入力中のセッションが自動で保存されます。</Note>
        <Note type="warn">月額プランで今月の利用上限に達している会員は、新規カルテを登録できません（翌月まで）。</Note>
      </>
    )
  },
  {
    id: 'tickets', title: '回数券・月額プラン', icon: Ticket,
    keywords: '回数券 購入 残数 有効期限 月額',
    body: () => (
      <>
        <P>会員詳細の「回数券」タブ（回数券会員）で、回数券の購入と残数を管理します。</P>
        <Steps items={[
          '「新規購入」ボタンを押します。',
          '回数券の種類を選ぶと、枚数と金額が自動で入ります。',
          '購入日を入れると有効期限が自動計算されます（購入日＋4ヶ月。手動で変更も可能）。',
          '金額・備考を必要に応じて直し、「購入を登録」を押します。'
        ]} />
        <Bullets items={[
          '画面上部に現在の残回数が大きく表示されます。残3回以下は赤色で警告されます。',
          '購入履歴は表で確認でき、期限切れの券は赤く表示されます。',
          '誤って登録した券は、行の削除ボタン（ゴミ箱）で消せます（確認あり）。'
        ]} />
      </>
    )
  },
  {
    id: 'analytics', title: '日次カルテ・分析', icon: LineChart,
    keywords: '日次 分析 グラフ 体重 来店 推移',
    body: () => (
      <>
        <Sub>日次カルテ一覧</Sub>
        <P>セッション記録の中で書いた体重・体調などのメモが、日付順に一覧で表示されるタブです（閲覧専用）。記録はセッション記録側で入力します。</P>
        <Sub>分析タブ</Sub>
        <P>その会員のデータをグラフで振り返れます。来店回数や平均ペース、鍛えた部位の割合、種目別の重量の伸び、体重・体脂肪率の推移などが見られます。種目別グラフは上のドロップダウンで種目を切り替えられます。</P>
      </>
    )
  },
  {
    id: 'evaluation', title: 'パフォーマンス記録表', icon: FileText,
    keywords: '記録表 評価 発行 PDF 印刷 お渡し フィードバック',
    body: () => (
      <>
        <P>月額プラン会員向けに、毎月の成長をまとめてお渡しする記録表を作るタブです（回数券会員には表示されません）。</P>
        <Steps items={[
          '上部で対象月を選びます。',
          '「印刷グラフに載せる種目」を最大3つ選びます（セッション記録から今月・前月の値が自動で入ります）。',
          '当月の記録（重量・回数）を確認・必要なら修正します。',
          'トレーナーを選び、「がんばり・良かった点」（必須）と「来月の目標・アドバイス」「半ちゃんからのひとこと」（任意）を入力します。定型文テンプレートも使えます。',
          '途中なら「下書き保存」、確定したら「発行する」を押します。',
          '紙でお渡しする場合は「PDF発行」でPDFを保存、または印刷します。'
        ]} />
        <Sub>お渡し状況の記録</Sub>
        <P>発行後、「お渡し済み／未お渡し／対象外」を記録します。記録するとダッシュボードや会員一覧のリマインダが消えます。</P>
        <Note type="warn">「がんばり・良かった点」が空欄だと発行できません。種目も1つ以上選んでください。</Note>
      </>
    )
  },
  {
    id: 'multi', title: 'マルチカルテ（同時記録）', icon: LayoutGrid,
    keywords: 'マルチ 同時 複数 一括 コピー グループ',
    body: () => (
      <>
        <P>グループレッスンなど、複数会員を並べて同時に記録する画面です。会員一覧でチェックして「マルチ展開」すると開きます（最大10名）。</P>
        <Steps items={[
          '上部で全員共通の担当トレーナーを選べます。',
          '各会員カードで、鍛えた部位・メニュー（手動入力欄／重量回数）・日次カルテ・回数券消費を入力します。',
          '同じメニューを使い回すときは「全員へ」または「選択へ」コピーを使うと便利です。',
          '保存は「一括保存」で全員、または会員をチェックして「選択保存」で一部だけ保存できます。'
        ]} />
        <Bullets items={[
          'カードはドラッグで並べ替えできます。',
          '「フルカルテを開く」でその会員の詳細画面に移動できます。',
          '回数券が残0の会員がいる場合は、保存時に購入画面が順番に表示されます。'
        ]} />
      </>
    )
  },
  {
    id: 'procedures', title: '手続き（解約・休会・移行）', icon: ClipboardList,
    keywords: '手続き 解約 休会 移行 オプション 会費ペイ コース 削除 編集',
    body: () => (
      <>
        <P>会員の各種手続きを受け付けて記録し、会費ペイでの操作を忘れないようアラートで知らせる画面です。</P>
        <Sub>手続きを受け付ける</Sub>
        <Steps items={[
          '左メニューの「手続き」を開きます。',
          '手続きの種類を選びます：月額プラン解約／月額プラン休会／移行／オプション解約。',
          '対象の会員を検索して選びます。',
          '受付日（通常は今日）を確認し、「この手続きを受け付ける」を押します。',
          '受け付けた手続きは右側の「受付履歴」に残ります。'
        ]} />
        <Sub>会費ペイでの操作タイミング</Sub>
        <P>受付からしばらくして表示期間に入ると、ダッシュボードに操作アラートが出ます。表示期間のルールは次のとおりです。</P>
        <Bullets items={[
          '受付が毎月1〜10日 → 当月14日〜翌月12日に表示。',
          '受付が毎月11日以降 → 翌月14日〜翌々月12日に表示。',
          '解約・オプション解約 → 「コース削除」、休会・移行 → 「コース編集」のアラートになります。'
        ]} />
        <Note>会費ペイで操作を済ませたら、アラートの「実施済み」を押して消してください。</Note>
        <Note>この画面は記録とアラートのためのものです。会員のステータス（休会・退会など）は基本情報タブで別途変更してください。</Note>
      </>
    )
  },
  {
    id: 'stats', title: '会員統計', icon: BarChart3,
    keywords: '統計 解約率 休会率 移行率 グラフ',
    body: () => (
      <>
        <P>「手続き」タブで受け付けた記録をもとに、直近12か月の解約率・休会率・移行率を表示する画面です。グラフと月別の明細表で確認できます。</P>
        <Note>各率は「その月の手続き件数 ÷ 月初の月額会員数」で計算します。月初の月額会員数は、月額プラン会員のうち入会日が月初以前で、それ以前に解約手続きがない人数として算出した概算値です。今後の月は手続きを受け付けるほど正確になります。</Note>
      </>
    )
  },
  {
    id: 'alerts', title: 'ダッシュボードのアラート対応', icon: Bell,
    keywords: 'ダッシュボード アラート 通知 記念品 課金 実施済み',
    body: () => (
      <>
        <P>ダッシュボードには、対応が必要な事項がアラートとして表示されます。対応したら各ボタンを押して消します。</P>
        <Bullets items={[
          '初回継続課金日の変更（新規会員）：会費ペイで設定したら「変更済み」。',
          '手続きの会費ペイ操作：コース削除／編集を行ったら「実施済み」。',
          '在籍記念品：在籍1年・2年・3年に達した会員へ記念品をお渡ししたら「贈呈済み」。'
        ]} />
        <Bullets items={[
          'パフォーマンス記録表の印刷・お渡しリマインダ：月末は印刷、月初はお渡し状況の記録を促します。',
          '回数券の残数アラート：残2回以下の回数券会員が表示されます。会員名を押すと詳細へ移動します。'
        ]} />
        <Note type="tip">アラートは「やることリスト」です。対応漏れを防ぐため、出社時にダッシュボードを確認する運用がおすすめです。</Note>
      </>
    )
  },
  {
    id: 'settings', title: '設定（トレーナー・種目・同期）', icon: Settings,
    keywords: '設定 トレーナー 種目 プリセット バックアップ 同期 アップデート ジム名',
    body: () => (
      <>
        <P>左メニュー下部の「設定」で、アプリ全体の設定を行います。</P>
        <Sub>トレーナー</Sub>
        <P>名前を入力して「追加」。一覧の名前を直接編集すると自動保存されます。ここで登録した人が、記録画面の担当トレーナーの選択肢になります。</P>
        <Sub>種目プリセット</Sub>
        <P>よく使う種目を登録しておくと、セッション記録やマルチカルテのドロップダウンに出てきます。種目名と部位カテゴリを入力して「追加」します。</P>
        <Sub>データ管理</Sub>
        <Bullets items={[
          'バックアップを書き出す：データを.dbファイルとして保存します。定期的な保存をおすすめします。',
          'バックアップから復元：保存した.dbファイルから戻します（復元後にアプリが再起動）。',
          'Excel / CSV インポート：会員データを一括取り込みします（→「Excel取り込み」章）。'
        ]} />
        <Sub>クラウド同期</Sub>
        <P>店舗PCと自宅PCで共有するための設定です。通常は設定済みのため触る必要はありません。状態（有効／最終同期時刻）を確認できます。</P>
        <Sub>アプリのアップデート</Sub>
        <P>「アップデートを確認」で最新版の有無を確認できます。新しい版があればダウンロードし、アプリを再起動すると更新されます。</P>
      </>
    )
  },
  {
    id: 'import', title: 'Excel / CSV 取り込み', icon: FileSpreadsheet,
    keywords: 'Excel CSV インポート 取り込み 一括 列 マッピング',
    body: () => (
      <>
        <P>既存の会員リスト（Excel／CSV）をまとめて取り込めます。設定画面の「Excel / CSV インポート」から行います。</P>
        <Steps items={[
          'ファイルを選びます（.xlsx / .xls / .csv）。',
          '列の対応づけ：アプリの項目（氏名・フリガナ・入会日など）に、ファイルのどの列が当たるかを選びます。列名から自動で推測もされます。',
          'プレビューで先頭の数件を確認します。',
          '「インポート実行」を押すと取り込まれ、成功・スキップ件数とエラー内容が表示されます。'
        ]} />
        <Note type="warn">「氏名」は必須項目です。氏名の列を対応づけないとプレビュー・取り込みに進めません。形式が不正な行はスキップされ、理由が一覧に表示されます。</Note>
      </>
    )
  },
  {
    id: 'faq', title: '困ったときは', icon: HelpCircle,
    keywords: 'FAQ よくある質問 トラブル 消えた 保存できない',
    body: () => (
      <>
        <Sub>入力した内容が消えてしまった</Sub>
        <P>「保存」を押す前に画面を移動・終了すると保存されません。入力後は必ず保存ボタンを押してください。</P>
        <Sub>他のPCの変更が見えない</Sub>
        <P>同期に数秒〜十数秒かかることがあります。少し待つか、設定画面の「今すぐ同期」を押してください。</P>
        <Sub>記録表タブが見当たらない</Sub>
        <P>パフォーマンス記録表は月額プラン会員のみ表示されます。基本情報でプラン種別が「月額」になっているか確認してください。</P>
        <Sub>新規カルテが登録できない</Sub>
        <P>月額プランで今月の利用上限に達している可能性があります。回数券会員で残0の場合は、保存時に回数券の購入が必要です。</P>
        <Sub>アラートが消えない／また出てくる</Sub>
        <P>各アラートの「実施済み／変更済み／贈呈済み」ボタンを押すと消えます。在籍記念品は1年→2年→3年と、節目ごとに改めて表示されます。</P>
      </>
    )
  }
]

export default function Help() {
  const [active, setActive] = useState('start')
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    if (!k) return SECTIONS
    return SECTIONS.filter((s) =>
      s.title.toLowerCase().includes(k) || (s.keywords || '').toLowerCase().includes(k))
  }, [q])

  const current = SECTIONS.find((s) => s.id === active) || SECTIONS[0]
  const CurrentIcon = current.icon

  return (
    <div className="p-8">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold">
        <BookOpen size={24} className="text-accent" /> ヘルプ・マニュアル
      </h1>
      <p className="mb-6 text-sm text-gray-400">ジムカルテの使い方を機能ごとにまとめています。左の項目から選んでください。</p>

      <div className="grid grid-cols-[16rem_1fr] gap-6">
        {/* 目次 */}
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-3">
          <div className="relative mb-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-lg border border-navy-600 bg-navy-900 py-2 pl-9 pr-3 text-sm outline-none focus:border-accent"
              placeholder="キーワードで探す" />
          </div>
          <nav className="space-y-0.5">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-gray-500">該当する項目がありません</p>
            ) : filtered.map((s) => {
              const Icon = s.icon
              return (
                <button key={s.id} onClick={() => setActive(s.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition
                    ${active === s.id ? 'bg-accent text-white' : 'text-gray-300 hover:bg-navy-700'}`}>
                  <Icon size={16} className="shrink-0" />
                  <span>{s.title}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* 本文 */}
        <div className="rounded-xl border border-navy-700 bg-navy-800 p-6">
          <h2 className="mb-4 flex items-center gap-2 border-b border-navy-700 pb-3 text-lg font-bold">
            <CurrentIcon size={20} className="text-accent" /> {current.title}
          </h2>
          <div>{current.body()}</div>
        </div>
      </div>
    </div>
  )
}
