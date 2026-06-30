const { contextBridge, ipcRenderer } = require('electron')

// レンダラーに安全なAPIだけを公開（contextIsolation）
contextBridge.exposeInMainWorld('api', {
  members: {
    list: (opts) => ipcRenderer.invoke('members:list', opts),
    get: (id) => ipcRenderer.invoke('members:get', id),
    create: (data) => ipcRenderer.invoke('members:create', data),
    update: (data) => ipcRenderer.invoke('members:update', data),
    remove: (id) => ipcRenderer.invoke('members:delete', id),
    cards: (ids) => ipcRenderer.invoke('members:cards', ids),
    reorder: (ids) => ipcRenderer.invoke('members:reorder', ids),
    billingPending: () => ipcRenderer.invoke('members:billingPending'),
    setBillingDone: (id) => ipcRenderer.invoke('members:setBillingDone', id),
    singleUseAlerts: () => ipcRenderer.invoke('members:singleUseAlerts'),
    setSingleUseRemoved: (id) => ipcRenderer.invoke('members:setSingleUseRemoved', id)
  },
  procedures: {
    list: () => ipcRenderer.invoke('procedures:list'),
    create: (data) => ipcRenderer.invoke('procedures:create', data),
    setDone: (id) => ipcRenderer.invoke('procedures:setDone', id),
    remove: (id) => ipcRenderer.invoke('procedures:remove', id),
    alerts: () => ipcRenderer.invoke('procedures:alerts'),
    stats: () => ipcRenderer.invoke('procedures:stats')
  },
  anniversary: {
    alerts: () => ipcRenderer.invoke('anniversary:alerts'),
    setDone: (data) => ipcRenderer.invoke('anniversary:setDone', data)
  },
  trainers: {
    list: () => ipcRenderer.invoke('trainers:list'),
    create: (name) => ipcRenderer.invoke('trainers:create', name),
    update: (data) => ipcRenderer.invoke('trainers:update', data),
    remove: (id) => ipcRenderer.invoke('trainers:delete', id)
  },
  presets: {
    list: () => ipcRenderer.invoke('presets:list'),
    create: (data) => ipcRenderer.invoke('presets:create', data),
    update: (data) => ipcRenderer.invoke('presets:update', data),
    remove: (id) => ipcRenderer.invoke('presets:delete', id),
    reorder: (ids) => ipcRenderer.invoke('presets:reorder', ids)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value })
  },
  backup: {
    export: () => ipcRenderer.invoke('backup:export'),
    import: () => ipcRenderer.invoke('backup:import')
  },
  excel: {
    open: () => ipcRenderer.invoke('excel:open'),
    import: (data) => ipcRenderer.invoke('excel:import', data)
  },
  tickets: {
    list: (memberId) => ipcRenderer.invoke('tickets:list', memberId),
    remaining: (memberId) => ipcRenderer.invoke('tickets:remaining', memberId),
    create: (data) => ipcRenderer.invoke('tickets:create', data),
    update: (data) => ipcRenderer.invoke('tickets:update', data),
    remove: (id) => ipcRenderer.invoke('tickets:delete', id)
  },
  sessions: {
    list: (memberId) => ipcRenderer.invoke('sessions:list', memberId),
    create: (data) => ipcRenderer.invoke('sessions:create', data),
    update: (data) => ipcRenderer.invoke('sessions:update', data),
    remove: (id) => ipcRenderer.invoke('sessions:delete', id)
  },
  daily: {
    list: (memberId) => ipcRenderer.invoke('daily:list', memberId),
    get: (args) => ipcRenderer.invoke('daily:get', args),
    save: (data) => ipcRenderer.invoke('daily:save', data),
    remove: (id) => ipcRenderer.invoke('daily:delete', id)
  },
  stats: {
    dashboard: () => ipcRenderer.invoke('stats:dashboard'),
    memberAnalytics: (memberId) => ipcRenderer.invoke('stats:memberAnalytics', memberId)
  },
  evaluations: {
    list: (memberId) => ipcRenderer.invoke('evaluations:list', memberId),
    get: (args) => ipcRenderer.invoke('evaluations:get', args),
    history: (memberId) => ipcRenderer.invoke('evaluations:history', memberId),
    save: (data) => ipcRenderer.invoke('evaluations:save', data),
    remove: (id) => ipcRenderer.invoke('evaluations:delete', id),
    performance: (memberId) => ipcRenderer.invoke('evaluations:performance', memberId),
    handovers: (memberId) => ipcRenderer.invoke('evaluations:handovers', memberId),
    setHandover: (data) => ipcRenderer.invoke('evaluations:setHandover', data),
    clearHandover: (data) => ipcRenderer.invoke('evaluations:clearHandover', data),
    reminders: () => ipcRenderer.invoke('evaluations:reminders'),
    exportPdf: (args) => ipcRenderer.invoke('evaluations:exportPdf', args)
  },
  sync: {
    status: () => ipcRenderer.invoke('sync:status'),
    setConfig: (data) => ipcRenderer.invoke('sync:setConfig', data),
    now: () => ipcRenderer.invoke('sync:now')
  },
  updater: {
    version: () => ipcRenderer.invoke('updater:version'),
    check: () => ipcRenderer.invoke('updater:check'),
    // 状態通知の購読（returns 解除関数）
    onStatus: (cb) => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('updater:status', handler)
      return () => ipcRenderer.removeListener('updater:status', handler)
    }
  }
})
