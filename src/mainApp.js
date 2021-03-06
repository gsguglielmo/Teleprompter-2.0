const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const { getAudioDurationInSeconds } = require('get-audio-duration');

const { v4: uuidv4 } = require('uuid');

const {AtemController} = require("./AtemController.js");

const player = require('play-sound')(opts = {
    player: `${__dirname}\\mpg123\\mpg123.exe`
})

const path = require('path');
const fs = require('fs');
const tar = require('tar-fs');
const {GlobalConfig} = require("./globalConfig.js")

let songsDirectory;
const serialConfig = require("./serialConfig.json");



let save = {
    "display_index": 0,
    "stills": {},
    "songs": [

    ],
    "segments": [

    ]
};

let secondsSinceStart = 0;

let currentAudio;


let {SerialController} = require("./SerialController.js");

let serialController;
save.display_index = 0;

save.show_status = {
    started: false,
    paused: true,
    currentSegment: undefined,
    nextSegment: undefined,
    is_live: false,
    totalTime: {
        minutes: 0,
        seconds: 0
    },
    segmentTime: {
        minutes: 0,
        seconds: 0
    },
    late: {
        minutes: 0,
        seconds: 0
    },
    totalLate: 0
}

let webContents = [];

let atemController = new AtemController();

let DIR;

let globalConfig;

function createWindow (config,oldWindow) {

    DIR = config.dir;

    save.name = config.config.name;
    save.date = config.config.date;
    save.uuid = config.config.uuid;
    save.isInitialized = config.config.isInitialized;

    if(save.isInitialized){
        save = config.config;
    }else{
        save.isInitialized = true;
        saveSettingsToDisk().then();
    }

    if(save.uuid === undefined){
        save.uuid = uuidv4();
        saveSettingsToDisk().then();
    }

    if(save.stills === undefined){
        save.stills = {};
        saveSettingsToDisk().then();
    }

    //Convert project file to new version (compatibility layer)
    for(let i=0;i<save.segments.length;i++){
        let segment = save.segments[i];

        if(segment.uuid === undefined && parseInt(segment.type) === 1){
            save.segments[i].uuid = getUUID(segment.filename);
        }
    }
    saveSettingsToDisk().then();

    globalConfig = new GlobalConfig();

    songsDirectory = path.join(DIR, 'songs');
    if(!fs.existsSync(songsDirectory)){
        fs.mkdirSync(songsDirectory);
    }

    save.show_status.paused = true;

    const win2 = new BrowserWindow({
        width: 1300,
        height: 700,
        webPreferences: {
            nodeIntegration: true
        }
    })

    // and load the index.html of the app.
    win2.loadFile('src/www/main.html')
    win2.removeMenu();
    win2.maximize();
    webContents.push(win2.webContents);
    oldWindow.close();

    let displays = screen.getAllDisplays()

    ipcMain.on('compressProject',(event, arg)=>{
        let name = path.basename(DIR);
        let exportDir = path.join(__dirname,"projectExport");
        let compressedPath = path.join(__dirname,"projectExport",name+".teleprompter");
        if(fs.existsSync(exportDir)){
            fs.rmdirSync(exportDir,{recursive: true});
        }

        fs.mkdirSync(exportDir);

        let compression = tar.pack(DIR).pipe(fs.createWriteStream( compressedPath ));
        compression.on('finish', function () {
            console.log("completed");
            event.sender.send('compressProject', compressedPath.toString());
        });


    });

    ipcMain.on('ondragstart', (event, filePath) => {
        event.sender.startDrag({
            file: filePath,
            icon: path.join(__dirname,"www","projecticon_small.png")
        })
    })

    ipcMain.on('getSongs', (event, arg) => {

        fs.readdir(songsDirectory, async (err, files) => {
            //handling error
            if (err) {
                event.sender.send('getSongs',{
                    error: true,
                    message: 'Unable to scan directory: ' + err
                });
                return console.log('Unable to scan directory: ' + err);
            }

            let details = [];

            for(let i=0; i<files.length;i++){
                let duration = await getAudioDurationInSeconds(path.join(songsDirectory,files[i]));
                details.push({
                    filename: files[i],
                    duration: calculateDuration(duration),
                    uuid: getUUID(files[i])
                });
            }

            save.songs = details;
            saveSettingsToDisk().then();

            event.sender.send('getSongs', details);
        });


    });

    ipcMain.on('uploadSong', async (event, files) => {

        let newFiles = [];

        //Assigning uuids to the uploaded files
        for(let i=0;i<files.length;i++){
            let exists = false;

            save.songs.forEach((song)=>{
                if(song.filename === files[i].name){
                    exists = true;
                }
            });

            if(!exists){
                newFiles.push({
                    uuid: uuidv4(),
                    ...files[i]
                })
            }

        }

        event.sender.send('uploadSong', newFiles);

        let successFiles = [];

        for(let i=0;i<newFiles.length;i++){
            let status = true;
            let duration = undefined;
            try{
                fs.copyFileSync(newFiles[i].path,path.join(songsDirectory,newFiles[i].name));

                duration = await getAudioDurationInSeconds(path.join(songsDirectory,newFiles[i].name));
                duration = calculateDuration(duration);
                console.log(duration);
            }catch (e){
                console.error(e.message);
                status = false;
            }
            successFiles.push({
                status: status,
                duration: duration,
                ...newFiles[i]
            });
            if(status){
                save.songs.push({
                    filename: newFiles[i].name,
                    duration: duration,
                    uuid: newFiles[i].uuid
                });
            }

        }

        event.sender.send('songUploadingStatusChange', successFiles);
    });

    ipcMain.on('deleteSong', async (event, uuid) => {

        for(let i=0;i<save.songs.length;i++) {
            let song = save.songs[i];

            if(song.uuid === uuid){
                fs.unlinkSync(path.join(songsDirectory,song.filename));
            }
        }

        event.sender.send('deleteSong', {});
    });

    ipcMain.on('getStills', async (event, uuid) => {
        event.sender.send('getStills', save.stills);
    });

    ipcMain.on('uploadStill', async (event, uuid) => {

        let result = await dialog.showOpenDialogSync(win2, {
            properties: ['openFile'],
            filters: [
                { name: 'Images', extensions: ['jpg', 'png'] },
            ]
        });
        if(result === undefined){
            event.sender.send('uploadStill', {
                status: false
            });
            return;
        }

        let stillPath = result[0];

        try{
            let still_dir = path.join(DIR,"stills");

            //Create directory stills if not exists
            if(!fs.existsSync(still_dir)){
                fs.mkdirSync(still_dir);
            }

            let filename = path.basename(stillPath);

            //File copied, now adding it to the list of stills
            fs.copyFileSync(stillPath,path.join(still_dir,filename));



            save.stills[uuid] = {
                filename: filename,
                song_uuid: uuid
            };
            await saveSettingsToDisk();
            event.sender.send('uploadStill', {
                status: true,
                data: save.stills[uuid]
            });

        }catch (e){
            console.error(e.message);
            event.sender.send('uploadStill', {
                status: false
            });
        }

        event.sender.send('uploadStill', {});
    });

    ipcMain.on('deleteStill', async (event, uuid) => {


        save.stills[uuid] = undefined;
        await saveSettingsToDisk();

        event.sender.send('deleteStill', true);
    });

    ipcMain.on('compressProject', async (event, uuid) => {

        for(let i=0;i<save.songs.length;i++) {
            let song = save.songs[i];

            if(song.uuid === uuid){
                fs.unlinkSync(path.join(songsDirectory,song.filename));
            }
        }

        event.sender.send('deleteSong', {});
    });

    ipcMain.on('saveSegments', async (event, segments) => {

        save.segments = segments;
        if(await saveSettingsToDisk()){
            event.sender.send('saveSegments',{
                error: false,
                message: 'Saved'
            });
        }else{
            event.sender.send('saveSegments',{
                error: true,
                message: 'Unable to save!'
            });
        }
    });

    ipcMain.on('loadSegments', async (event, segments) => {

        event.sender.send('loadSegments',save.segments);
    });

    ipcMain.on('getVersion', async (event, segments) => {

        event.sender.send('getVersion',app.getVersion());
    });

    ipcMain.on('getShowDetails', async (event, segments) => {

        event.sender.send('getShowDetails', {
            name: save.name,
            date: save.date
        });
    });

    ipcMain.on('timer-play', async (event, segments) => {
        timerPlay();
    });

    ipcMain.on('timer-pause', async (event, segments) => {
        timerPause();
    });

    ipcMain.on('timer-next', async (event, segments) => {
        nextSegment();
    });

    ipcMain.on('timer-reset', async (event, segments) => {
        timerReset();
    });

    ipcMain.on('set-description', async (event, description) => {
        save.show_status.description = description;
        sendMessage("get-description",description)
    });

    ipcMain.on('new-monitor', async (event, description) => {
        // Create the browser window.
        let externalDisplay = displays[save.display_index];
        const win = new BrowserWindow({
            width: 800,
            height: 600,
            x: externalDisplay.bounds.x + 50,
            y: externalDisplay.bounds.y + 50,
            webPreferences: {
                nodeIntegration: true
            }
        })


        // and load the index.html of the app.
        win.loadFile('src/www/window.html')
        win.removeMenu();
        webContents.push(win.webContents);
        win.setFullScreen(true);
    });

    ipcMain.on('prepare-next-segment', async (event, stillUUID) => {
        if(save.stills[stillUUID] === undefined) return;


        let still_filename = save.stills[stillUUID].filename;
        let still_path = path.join(DIR,"stills",still_filename);
        console.log(still_path);
        if(!fs.existsSync(still_path))return;

        let upload_slot = 0;
        if(save.workingStill !== undefined && !isNaN(parseInt(save.workingStill))){
            upload_slot = save.workingStill;
        }

        try{
            console.log(atemController.connected);
            await atemController.uploadStill(still_path,upload_slot);
            await atemController.switchStill(upload_slot);
            await atemController.stillToPreview();
            await atemController.key1();

        }catch (e){
            console.error(e);
            event.sender.send('prepare-next-segment',false);
        }


    });

    ipcMain.on('atem-mini-test-connection', async (event, ipAddress) => {

        let success = await atemController.connect(ipAddress);

        event.sender.send('atem-mini-test-connection',true);
        save.atemIp = ipAddress;
        saveSettingsToDisk().then();
    });

    ipcMain.on('atem-disconnect', async (event, none) => {
        await atemController.disconnect();
        event.sender.send('atem-disconnect', true);
    });

    ipcMain.on('getServices', async (event, none) => {
        event.sender.send('getServices',globalConfig.getServices());
    });

    ipcMain.on('saveStreamingSettings', async (event, StreamingSettings) => {

        save.streamingURL = StreamingSettings.url;
        save.streamingKey = StreamingSettings.key;
        save.workingStill = StreamingSettings.workingStill;
        saveSettingsToDisk().then();
        await atemController.setStreamingService(save.streamingURL,save.streamingKey);

        event.sender.send('saveStreamingSettings',true);
    });

    ipcMain.on('getStreamingSettings', async (event, none) => {
        event.sender.send('getStreamingSettings', {
            url: save.streamingURL,
            key: save.streamingKey,
            workingStill: save.workingStill
        });
    });

    ipcMain.on('getAtemMiniAddress', async (event, none) => {
        event.sender.send('getAtemMiniAddress', {
            ip: save.atemIp,
            isConnected: atemController.connected
        });
    });

    ipcMain.on('getDVEPresets',async (event,none)=>{
        event.sender.send('getDVEPresets', globalConfig.getDVEStyles());
    });

    ipcMain.on('getDVEStyle',async (event,none)=>{
        if(save.DVE === undefined){
            save.DVE = globalConfig.getDVEStyles()[0];
            saveSettingsToDisk().then();
        }
        event.sender.send('getDVEStyle', save.DVE);
    });

    ipcMain.on('getAtemMiniStatus',async (event,none)=>{
        let dveStatus = false;
        if(save.DVE !== undefined){
            dveStatus = await atemController.checkDVE(save.DVE);
        }

        event.sender.send('getAtemMiniStatus', {
            connected: atemController.connected,
            dveSettingsCheck: dveStatus,
            streamingSettingsCheck: atemController.checkStreamingService(save.streamingURL,save.streamingKey),
            macroCheck: atemController.checkMacro()
        });
    });

    ipcMain.on('setDVEStyle',async (event,DVE)=>{

        save.DVE = DVE;
        saveSettingsToDisk().then();

        await atemController.setDVE(DVE);

        event.sender.send('setDVEStyle', true);
    });

    ipcMain.on('checkSongs',async (event,none)=>{

        let segments = save.segments;

        let missing = [];

        for(let i=0;i<segments.length;i++){
            if(parseInt(segments[i].type) !== 1) continue;
            if(!fs.existsSync(path.join(songsDirectory,segments[i].filename))){
                missing.push(segments[i]);
            }
        }

        event.sender.send('checkSongs', {
            missing: missing
        });
    });

    ipcMain.on('checkStills',async (event,none)=>{

        let stills = save.stills;
        let keys = Object.keys(stills);

        let missing = [];

        for(let i=0;i<keys.length;i++){
            if(!fs.existsSync(path.join(DIR,"stills",stills[keys[i]].filename))){
                missing.push(stills[keys[i]]);
            }
        }

        event.sender.send('checkStills', {
            missing: missing
        });
    });

    ipcMain.on('connectController',async (event, none)=>{

        let vendor = save["controllerVendor"]===undefined? "10C4" : save["controllerVendor"];
        let product = save["controllerProduct"]===undefined? "EA60" : save["controllerProduct"];

        if(serialController !== undefined){
            serialController.close();
            serialController = undefined;
        }

        if(save["controllerMappings"] === undefined){
            save["controllerMappings"] = {
                next: "a",
                reset: "b",
                pause: "c",
                prepare: "d",
                start: "e"
            }
        }

        serialController = new SerialController(vendor,product,save["controllerMappings"]);

        serialController.onKeyPressedCallback((res)=>{
            switch (res){
                case "next":
                    nextSegment()
                    break;
                case "reset":
                    timerReset()
                    break;
                case "pause":
                    timerPause()
                    break;
                case "prepare":

                    break;
                case "start":
                    timerPlay();
                    break;
            }
        })


        event.sender.send('connectController', {});
    });

    ipcMain.on('saveControllerSettings',async (event, settings)=>{

        save["controllerVendor"] = settings.controllerVendor;
        save["controllerProduct"] = settings.controllerProduct;

        save["controllerMappings"] = settings.controllerMappings;

        saveSettingsToDisk().then();

        event.sender.send('saveControllerSettings', true);
    });

    ipcMain.on('getControllerSettings',async (event, settings)=>{

        if(save["controllerMappings"] === undefined){
            save["controllerMappings"] = {
                next: "a",
                reset: "b",
                pause: "c",
                prepare: "d",
                start: "e"
            }
            saveSettingsToDisk().then();
        }

        event.sender.send('getControllerSettings', {
            controllerVendor: save["controllerVendor"],
            controllerProduct: save["controllerProduct"],
            controllerMappings: save["controllerMappings"]
        });
    });

}

function timerPlay(){
    if(save.show_status.started){



    }else{
        let sgmts = save.segments;

        save.show_status.currentSegment = sgmts[0];
        save.show_status.currentSegmentIndex = 0;
        save.show_status.currentSegment.started = secondsSinceStart;

        save.show_status.forceNext = sgmts[0].type === 1;

        let duration = save.show_status.currentSegment.duration.split(":");

        save.show_status.segmentTime.minutes = parseInt(duration[0]);
        save.show_status.segmentTime.seconds = parseInt(duration[1]);
        save.show_status.description = "";
        save.show_status.totalTime = {
            minutes: 0,
            seconds: 0
        };

        save.show_status.totalLate = 0;

        if(sgmts.length>1){
            save.show_status.nextSegment = sgmts[1];
        }
        save.show_status.started = true;

        playCurrentSong();

    }


    save.show_status.paused = false;
}

function timerPause(){
    save.show_status.paused = true;
}

function timerReset(){
    save.show_status.started = false;
    save.show_status.paused = true;

    save.show_status.totalTime = {
        minutes: 0,
        seconds: 0
    };

    save.show_status.late = {
        minutes: 0,
        seconds: 0
    };

    save.show_status.segmentTime = {
        minutes: 0,
        seconds: 0
    };

    save.show_status.totalLate = 0;
    save.show_status.description = "";
    try{
        if(currentAudio!==undefined){
            currentAudio.kill();
        }
    }catch (e){}
}


//app.whenReady().then(createWindow);
exports.createWindow = createWindow;

function atem_mini_connect(ip){
    return new Promise(((resolve, reject) => {
        ATEM_MINI.object.on('connected',()=>{
            resolve(true);
        });
        ATEM_MINI.object.connect(ip).then();
    }));
}

app.on('window-all-closed', () => {
    app.quit()
})

setInterval(tick, 1000);

function getUUID(filename){

    let uuid = uuidv4();

    save.songs.forEach((song)=>{
        if(song.filename === filename){
            uuid = song.uuid;
        }
    });

    return uuid;
}

function tick(){
    secondsSinceStart++;

    if(save.show_status.started && !save.show_status.paused){

        save.show_status.totalTime.seconds++;
        if(save.show_status.totalTime.seconds > 59){
            save.show_status.totalTime.seconds -= 60;
            save.show_status.totalTime.minutes++;
        }

        save.show_status.segmentTime.seconds--;
        if(save.show_status.segmentTime.seconds < 0){
            save.show_status.segmentTime.seconds = 59;
            save.show_status.segmentTime.minutes--;
            if(save.show_status.segmentTime.minutes < 0){
                save.show_status.segmentTime.minutes = 0;
                save.show_status.segmentTime.seconds = 0;

                if(save.show_status.forceNext){
                    nextSegment();
                }else{
                    save.show_status.late.seconds++;
                    if(save.show_status.late.seconds > 59){
                        save.show_status.late.seconds = 0;
                        save.show_status.late.minutes++;
                    }
                }



            }
        }

    }

    let songToDisplay = "";

    for(let i=save.show_status.currentSegmentIndex;i<save.segments.length;i++){
        let segment = save.segments[i];
        if(parseInt(segment.type) === 1){
            songToDisplay = `${segment.title} - ${segment.author}`;

            break;
        }
    }


    sendMessage("tick",{
        songToDisplay: songToDisplay,
        time: secondsSinceStart,
        ... save.show_status
    })

}

function nextSegment(){
    if(save.show_status.nextSegment !== undefined){
        let late = save.show_status.late.minutes*60;
        late += save.show_status.late.seconds;

        save.show_status.totalLate += late;

        let notLate = save.show_status.segmentTime.minutes*60;
        notLate += save.show_status.segmentTime.seconds;

        save.show_status.totalLate -= notLate;

        save.show_status.late.seconds=0;
        save.show_status.late.minutes=0;

        let start = save.show_status.currentSegment.started;

        save.segments[save.show_status.currentSegmentIndex].realDuration = secondsSinceStart-start;

        saveSettingsToDisk().then();

        save.show_status.currentSegment = save.show_status.nextSegment;
        save.show_status.currentSegment.started = secondsSinceStart;
        let duration = save.show_status.currentSegment.duration.split(":");



        save.show_status.segmentTime.minutes = parseInt(duration[0]);
        save.show_status.segmentTime.seconds = parseInt(duration[1]);

        save.show_status.forceNext = save.show_status.currentSegment.type === 1;

        save.show_status.currentSegmentIndex++;

        if(save.segments.length-1 >= save.show_status.currentSegmentIndex+1){
            save.show_status.nextSegment = save.segments[save.show_status.currentSegmentIndex+1];
        }else{
            save.show_status.nextSegment = undefined;
        }
        playCurrentSong();
    }
}

function saveSettingsToDisk(){
    return new Promise((resolve => {
        fs.writeFile(path.join(DIR,"teleprompter.json"), JSON.stringify(save), (err) => {
            if (err) {
                console.error(err.message);
                resolve(false);
                return ;
            }
            resolve(true);
        });
    }));

}

function calculateDuration(durationInSeconds){
    let intDuration = parseInt(durationInSeconds+"");

    return{
        minutes: parseInt((intDuration/60)+""),
        seconds: intDuration%60
    }
}

function sendMessage(channel,data){
    webContents.forEach((webContent)=>{
        try{
            webContent.send(channel,data);
        }catch (e){}

    });
}

async function playCurrentSong(){
    try{
        if(currentAudio!==undefined){
            currentAudio.kill();
        }
    }catch (e){}
    if(save.show_status.currentSegment.type !== 1)return;
    //${__dirname}\\songs\\${save.show_status.currentSegment.filename}
    currentAudio = player.play(path.join(songsDirectory,save.show_status.currentSegment.filename), function(err){
        if (err && !err.killed) throw err
    });


}
