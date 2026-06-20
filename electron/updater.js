const { app, dialog, ipcMain, BrowserWindow } = require('electron')

// electron-updater 本体は本番（パッケージ済み）でのみ読み込む。
// 開発時（npm run dev）は app.isPackaged === false なので何もしない。
let autoUpdater = null

// 手動チェック（設定画面のボタン）かどうかのフラグ。
// 起動時の自動チェックでは「最新です」「エラー」のダイアログを出さず、
// 手動チェック時のみ結果を必ず通知する（通知して選択UX）。
let manualCheck = false

// レンダラーへ状態を送る（任意・設定画面のステータス表示用）
function send(status, info) {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send('updater:status', { status, info: info || null })
  }
}

function setupHandlers() {
  autoUpdater.autoDownload = false // ダウンロードは本人の確認後に行う
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => send('checking'))

  autoUpdater.on('update-available', async (info) => {
    send('available', info)
    const win = BrowserWindow.getAllWindows()[0]
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['今すぐ更新（ダウンロード）', '後で'],
      defaultId: 0,
      cancelId: 1,
      title: 'アップデートのお知らせ',
      message: `新しいバージョン ${info.version} が配信されています。`,
      detail: '最新版へのバージョンアップを実行してください。\n「今すぐ更新」を押すとダウンロードを開始します（ダウンロード中もアプリは使えます。更新は再起動時に適用されます）。'
    })
    if (response === 0) {
      send('downloading')
      autoUpdater.downloadUpdate()
    }
  })

  autoUpdater.on('update-not-available', () => {
    send('not-available')
    if (manualCheck) {
      const win = BrowserWindow.getAllWindows()[0]
      dialog.showMessageBox(win, {
        type: 'info',
        buttons: ['OK'],
        title: 'アップデート',
        message: '最新バージョンを使用中です。',
        detail: `現在のバージョン: ${app.getVersion()}`
      })
    }
    manualCheck = false
  })

  autoUpdater.on('download-progress', (p) => {
    send('progress', { percent: Math.round(p.percent) })
  })

  autoUpdater.on('update-downloaded', async (info) => {
    send('downloaded', info)
    const win = BrowserWindow.getAllWindows()[0]
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['今すぐ再起動して更新', '後で（次回起動時に更新）'],
      defaultId: 0,
      cancelId: 1,
      title: 'アップデート準備完了',
      message: `バージョン ${info.version} のダウンロードが完了しました。`,
      detail: '再起動すると更新が適用されます。'
    })
    if (response === 0) {
      // すぐにインストール（アプリは再起動される）
      setImmediate(() => autoUpdater.quitAndInstall())
    }
  })

  autoUpdater.on('error', (err) => {
    send('error', { message: String(err && err.message ? err.message : err) })
    if (manualCheck) {
      const win = BrowserWindow.getAllWindows()[0]
      dialog.showMessageBox(win, {
        type: 'error',
        buttons: ['OK'],
        title: 'アップデート',
        message: 'アップデートの確認に失敗しました。',
        detail: 'インターネット接続を確認して、しばらくしてからもう一度お試しください。'
      })
    }
    manualCheck = false
  })
}

function initUpdater() {
  // 開発中・未パッケージ時は無効
  if (!app.isPackaged) {
    // 設定画面からの手動チェックも安全に応答できるようハンドラだけは用意
    ipcMain.handle('updater:version', () => app.getVersion())
    ipcMain.handle('updater:check', () => ({ ok: false, reason: 'dev' }))
    return
  }

  try {
    autoUpdater = require('electron-updater').autoUpdater
  } catch (e) {
    // 依存が無い等の場合でもアプリ本体は動かす
    ipcMain.handle('updater:version', () => app.getVersion())
    ipcMain.handle('updater:check', () => ({ ok: false, reason: 'unavailable' }))
    return
  }

  setupHandlers()

  ipcMain.handle('updater:version', () => app.getVersion())
  ipcMain.handle('updater:check', () => {
    manualCheck = true
    autoUpdater.checkForUpdates()
    return { ok: true }
  })

  // 起動から少し待ってウィンドウ表示後に自動チェック
  setTimeout(() => {
    manualCheck = false
    autoUpdater.checkForUpdates().catch(() => {})
  }, 4000)
}

module.exports = { initUpdater }
