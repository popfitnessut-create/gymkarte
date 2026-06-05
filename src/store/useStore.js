import { create } from 'zustand'

// 画面遷移・選択状態のグローバルストア
export const useStore = create((set) => ({
  page: 'dashboard', // dashboard | members | memberDetail | multi
  selectedMemberId: null,
  multiIds: [], // マルチ展開で開く会員ID配列

  navigate: (page) => set({ page }),
  openMember: (id) => set({ page: 'memberDetail', selectedMemberId: id }),
  backToList: () => set({ page: 'members', selectedMemberId: null }),
  openMulti: (ids) => set({ page: 'multi', multiIds: ids })
}))
