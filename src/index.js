const { app } = require('electron');

if (require('electron-squirrel-startup')) return app.quit();

require('update-electron-app')()


require("./mainApp.js");
