const { app,autoUpdater,dialog } = require('electron');

if (require('electron-squirrel-startup')) return app.quit();

//require('update-electron-app')()

const server = 'https://github.com/gsguglielmo/Teleprompter-2.0/releases/download/'
const url = `${server}/latest`


autoUpdater.setFeedURL({ url })

autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
    const dialogOpts = {
        type: 'info',
        buttons: ['Restart', 'Later'],
        title: 'Application Update',
        message: process.platform === 'win32' ? releaseNotes : releaseName,
        detail: 'A new version has been downloaded. Restart the application to apply the updates.'
    }

    dialog.showMessageBox(dialogOpts).then((returnValue) => {
        if (returnValue.response === 0) autoUpdater.quitAndInstall()
    })
})


app.whenReady().then(()=>{


    setInterval(() => {
        autoUpdater.checkForUpdates();
    }, 60000);



    require("./mainApp.js").createWindow();
});



