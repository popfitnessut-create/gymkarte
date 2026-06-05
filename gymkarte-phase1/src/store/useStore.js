import { create } from 'zustand'

// 画面遷移・選択状態のグローバルストア
export const useStore = create((set) => ({
  page: 'dashboard', // dashboard | members | memberDetail
  selectedMemberId: null,

  navigate: (page) => set({ page }),
  openMember: (id) => set({ page: 'memberDetail', selectedMemberId: id }),
  backToList: () => set({ page: 'members', selectedMemberId: null })
}))
