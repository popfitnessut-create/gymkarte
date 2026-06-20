const { app, BrowserWindow } = require('electron')
const path = require('path')
const { initDb } = require('./db')
const { registerIpc } = require('./ipc')
const { initUpdater } = require('./updater')

const isDev = process.env.NODE_ENV === 'development'

function createWindow() {
  // 実行時のウィンドウ／タスクバーアイコンを明示指定。
  // アップデート後もアイコンが既定に戻らないよう、exe埋め込み(win.icon)に加えて
  // ランタイムでも同梱アイコンを参照する（assetsはpackage.jsonのfilesに含めて同梱）。
  const winIcon = path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png')

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#0b1120',
    title: 'GymKarte',
    icon: winIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  // DB初期化（userData配下に保存 → オフライン完結）
  initDb(app.getPath('userData'))
  registerIpc()
  createWindow()
  initUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
