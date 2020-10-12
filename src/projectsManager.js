const { app,autoUpdater,dialog,BrowserWindow } = require('electron');
const isDev = require('electron-is-dev');


exports.init = ()=>{
    const win = new BrowserWindow({
        width: 670,
        height: 500,
        webPreferences: {
            nodeIntegration: true
        },
        resizable: true,
        frame: false
    })
    win.loadFile('src/www/projectSelector.html');
    win.webContents.openDevTools({ mode: 'detach' })
}
