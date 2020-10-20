const { app,dialog,ipcMain,BrowserWindow } = require('electron');
const isDev = require('electron-is-dev');
const path = require('path');
const fs = require("fs-extra");
const sanitize = require("sanitize-filename");
const { v4: uuidv4 } = require('uuid');
const tar = require('tar-fs');

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

    ipcMain.on('importDialog', async(event, index) => {
        let result = await dialog.showOpenDialogSync(win, {
            properties: ['openFile'],
            filters: [
                { name: 'Teleprompter project', extensions: ['teleprompter'] },
            ]
        });

        if(result === undefined) return;
        let projectCompressedPath = result[0];

        let tmpPath = path.join(app.getPath("temp"),"tjgnf83lfs_teleprompter_import");
        if(fs.existsSync(tmpPath)){
            fs.rmdirSync(tmpPath,{recursive: true});
        }

        let op = fs.createReadStream(projectCompressedPath).pipe(tar.extract(tmpPath))
        op.on('finish',async function () {

            let config_file = path.join(tmpPath,"teleprompter.json");

            let importConfig = JSON.parse(fs.readFileSync(config_file));

            if(importConfig.name !== undefined && importConfig.date !== undefined && importConfig.uuid !== undefined){
                console.log(importConfig.uuid);

                let project = undefined;

                for(let i=0;i<projects.length;i++){
                    if(projects[i].config.uuid === importConfig.uuid){
                        project = projects[i];
                    }
                }

                if(project !== undefined){

                    let result = await dialog.showMessageBox(win, {
                        type: "question",
                        buttons: ["Replace the existing project", "Keep both projects", "Cancel"],
                        defaultId: 0,
                        title: "Duplicate projects found",
                        message: "The project that you are trying to import already exists. What do you want to do?"
                    });


                    switch (result.response){
                        case 0: //Replace

                            let path = project.dir;
                            fs.rmdirSync(path,{recursive: true});
                            project.config = importConfig;
                            fs.move(tmpPath, path, err => {
                                if(err) return console.error(err);
                                openProject(project);
                            });

                            break;
                        case 1: //Keep both
                            project = undefined;
                            break;
                        case 2: //Cancel
                            fs.rmdirSync(tmpPath,{recursive: true});
                            break;
                    }
                }

                if(project === undefined){
                    //The project is new, create a folder and move the data inside
                    let name = importConfig.name.split("-")[0];
                    let date = importConfig.date;
                    let {newDir,index} = getProjectFolder(dir,name,date);

                    importConfig.name = index>1 ? name+" - "+index : name;

                    project = {
                        dir: newDir,
                        config: importConfig
                    };

                    fs.writeFileSync(config_file,JSON.stringify(importConfig));

                    fs.move(tmpPath, newDir, err => {
                        if(err) return console.error(err);
                        openProject(project);
                    });
                }

            }
        });


        event.sender.send("importDialog", {});
    });

    ipcMain.on('createProject', (event, args) => {
        let name = args.name;
        let date = args.date;

        let {newDir,index} = getProjectFolder(dir,name,date);

        let project = {
            dir: newDir,
            config: {
                name: index>1 ? name+" - "+index : name,
                uuid: uuidv4(),
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
                if(p_config.name !== undefined && p_config.date !== undefined && p_config.uuid !== undefined){

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

function getProjectFolder(dir,name, date){
    let newDir = path.join(dir,sanitize(name.replace(/[^\x00-\x7F]/g, "")+" "+date));

    let index = 1;
    while (fs.existsSync(newDir)){
        index++;
        newDir = path.join(dir,sanitize(name.replace(/[^\x00-\x7F]/g, "")+" "+date+"-"+index));
    }
    return {
        newDir: newDir,
        index: index
    };
}
