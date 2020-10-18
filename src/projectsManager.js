const { app,autoUpdater,ipcMain,BrowserWindow } = require('electron');
const isDev = require('electron-is-dev');
const path = require('path');
const fs = require("fs");
const sanitize = require("sanitize-filename");

let win;
let projects;

exports.init = ()=>{
     win = new BrowserWindow({
        width: 670,
        height: 500,
        webPreferences: {
            nodeIntegration: true
        },
        resizable: false,
        frame: false
    })
    win.loadFile('src/www/projectSelector.html');
    //win.webContents.openDevTools({ mode: 'detach' })

    let dir = initProjectsDirectory();

    ipcMain.on('projectsList', (event, arg) => {
        projects = discoverExistingProjects(dir);
        event.sender.send("projectsList",projects);
    });

    ipcMain.on('openProject', (event, index) => {
        index = parseInt(index);

        openProject(projects[index]);
    });

    ipcMain.on('createProject', (event, args) => {
        let name = args.name;
        let date = args.date;

        let newDir = path.join(dir,sanitize(name.replace(/[^\x00-\x7F]/g, "")+" "+date));

        let index = 1;
        while (fs.existsSync(newDir)){
            index++;
            newDir = path.join(dir,sanitize(name.replace(/[^\x00-\x7F]/g, "")+" "+date+"-"+index));
        }

        let project = {
            dir: newDir,
            config: {
                name: index>1 ? name+" - "+index : name,
                date: date,
                isInitialized: false
            }
        };

        fs.mkdirSync(newDir);

        fs.writeFile(path.join(newDir,"teleprompter.json"), JSON.stringify(project.config), (err) => {
            if (err) {
                console.error(err.message);
                return ;
            }
            openProject(project);
        });

    });
}

function discoverExistingProjects(main_directory){
    let potentialProjects = getDirectories(main_directory);
    let projects = [];
    potentialProjects.forEach((directory)=>{
        let d = path.join(main_directory,directory);

        //Check if main config json file exists
        let configPath  = path.join(d,"teleprompter.json");

        if(fs.existsSync(configPath)){
            try{
                let p_config = JSON.parse(fs.readFileSync(configPath));
                //console.log(p_config);
                if(p_config.name !== undefined && p_config.date !== undefined){

                    projects.push({
                        dir: d,
                        config: p_config
                    });
                }
            }catch (e){}

        }


    });
    return projects;

}

function openProject(project){
    //console.log(project);
    win.hide();
    require("./mainApp.js").createWindow(project,win);
}

function initProjectsDirectory(){
    let dir = app.getPath("documents");

    let main = path.join(dir,"Teleprompter");

    if(!fs.existsSync(main)){
        fs.mkdirSync(main);
    }
    return main;
}

function getDirectories(source){
    return fs.readdirSync(source, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
}
