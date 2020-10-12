const { app,autoUpdater,dialog,BrowserWindow } = require('electron');
const isDev = require('electron-is-dev');


if (require('electron-squirrel-startup')) return app.quit();


const server = 'https://github.com/gsguglielmo/Teleprompter-2.0/releases/download/'
const url = `${server}/latest`
let updateWindow;

autoUpdater.setFeedURL({ url })

autoUpdater.on("update-available",()=>{
    updateWindow.webContents.send("updateStarted", {});
});

autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
    autoUpdater.quitAndInstall();
});

autoUpdater.on("update-not-available",()=>{
    loadProjectsManager();
});
autoUpdater.on("error",(err)=>{
    console.error(err);
    loadProjectsManager();
});

function loadProjectsManager(){
    require("./mainApp.js").createWindow();
    if(!updateWindow.isDestroyed()){
        updateWindow.close();
    }

}

app.whenReady().then(()=>{

    const win = new BrowserWindow({
        width: 500,
        height: 320,
        webPreferences: {
            nodeIntegration: true
        },
        resizable: false,
        frame: false
    })

    // and load the index.html of the app.
    win.loadFile('src/www/updateCheck.html');
    win.webContents.openDevTools({ mode: 'detach' })

    updateWindow = win;

    if(!isDev){
        autoUpdater.checkForUpdates();
        /*
        setInterval(() => {
            autoUpdater.checkForUpdates();
            console.log("check update")
        }, 60000);*/
    }else{
        loadProjectsManager();
    }




    //
});



