import { create } from 'zustand'

// 画面遷移・選択状態のグローバルストア
export const useStore = create((set) => ({
  page: 'dashboard', // dashboard | members | memberDetail | multi
  selectedMemberId: null,
  multiIds: [], // マルチ展開で開く会員ID配列
  // 会員を開くときの初期表示指定（リマインダから対象月・タブを指定して開くため）
  // { tab, ym } 形式。consume後はnullに戻す。
  memberInitial: null,

  navigate: (page) => set({ page }),
  openMember: (id) => set({ page: 'memberDetail', selectedMemberId: id, memberInitial: null }),
  // 指定タブ・対象月で会員を開く（ダッシュボードのお渡しリマインダ用）
  openMemberAt: (id, initial) => set({ page: 'memberDetail', selectedMemberId: id, memberInitial: initial || null }),
  consumeMemberInitial: () => set({ memberInitial: null }),
  backToList: () => set({ page: 'members', selectedMemberId: null, memberInitial: null }),
  openMulti: (ids) => set({ page: 'multi', multiIds: ids })
}))
