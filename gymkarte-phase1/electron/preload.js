const { contextBridge, ipcRenderer } = require('electron')

// レンダラーに安全なAPIだけを公開（contextIsolation）
contextBridge.exposeInMainWorld('api', {
  members: {
    list: (opts) => ipcRenderer.invoke('members:list', opts),
    get: (id) => ipcRenderer.invoke('members:get', id),
    create: (data) => ipcRenderer.invoke('members:create', data),
    update: (data) => ipcRenderer.invoke('members:update', data),
    remove: (id) => ipcRenderer.invoke('members:delete', id)
  },
  trainers: {
    list: () => ipcRenderer.invoke('trainers:list')
  },
  presets: {
    list: () => ipcRenderer.invoke('presets:list')
  }
})
