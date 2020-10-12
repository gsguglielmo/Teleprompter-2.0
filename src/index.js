/**
 * This module checks for updates and if not available opens the projectManager. If an update is
 * available it will be installed automatically.
 * */

const { app,autoUpdater,dialog,BrowserWindow } = require('electron');
const isDev = require('electron-is-dev');

//Todo manage installation and update procedures if needed
if (require('electron-squirrel-startup')) return app.quit();


const server = 'https://github.com/gsguglielmo/Teleprompter-2.0/releases/download/'
const url = `${server}/latest`
let updateWindow;

autoUpdater.setFeedURL({ url })

autoUpdater.on("update-available",()=>{
    updateWindow.webContents.send("updateStarted", {});
});

//Restart the app when the update is done
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
    require("./projectsManager.js").init();
    if(!updateWindow.isDestroyed()){
        updateWindow.close();
    }

}

app.whenReady().then(()=>{

    //Display the loading window
    const win = new BrowserWindow({
        width: 500,
        height: 320,
        webPreferences: {
            nodeIntegration: true
        },
        resizable: false,
        frame: false
    })
    win.loadFile('src/www/updateCheck.html');

    //win.webContents.openDevTools({ mode: 'detach' })
    updateWindow = win;

    //Update only if we are not in a development environment
    if(!isDev){

        //The update checks happens only once when the app is started
        autoUpdater.checkForUpdates();
        /*
        setInterval(() => {
            autoUpdater.checkForUpdates();
            console.log("check update")
        }, 60000);*/
    }else{
        loadProjectsManager();
    }

});



