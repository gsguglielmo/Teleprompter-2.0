const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const SerialPort = require('serialport')

const player = require('play-sound')(opts = {
    player: `${__dirname}\\mpg123\\mpg123.exe`
})

const path = require('path');
const fs = require('fs');

let songsDirectory;
const serialConfig = require("./serialConfig.json");

let save = {
    "display_index": 0,
    "songs": [

    ],
    "segments": [

    ]
};

let secondsSinceStart = 0;

let currentAudio;


SerialPort.list().then((ports)=>{

    for(let i=0;i<ports.length;i++){
        let vendor = serialConfig[ports[i]["vendorId"]];
        if(vendor === undefined){
            ports[i]["identification"] = {
                "vendor" : undefined,
                "product" : undefined
            }
        }else{
            ports[i]["identification"] = {
                "vendor" : vendor["NAME"],
                "product" : undefined
            }

            let product = vendor[ports[i]["productId"]];
            if(product !== undefined){
                ports[i]["identification"]["product"] = product["NAME"];
            }
        }
    }

});


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

let DIR;

function createWindow (config,oldWindow) {

    DIR = config.dir;

    save.name = config.config.name;
    save.date = config.config.date;
    save.isInitialized = config.config.isInitialized;

    if(save.isInitialized){
        save = config.config;
    }else{
        save.isInitialized = true;
        saveSettingsToDisk().then();

    }

    songsDirectory = path.join(DIR, 'songs');
    if(!fs.existsSync(songsDirectory)){
        fs.mkdirSync(songsDirectory);
    }

    save.show_status.paused = true;

    const win2 = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true
        }
    })

    // and load the index.html of the app.
    win2.loadFile('src/www/main.html')
    //win2.removeMenu();
    win2.maximize();
    webContents.push(win2.webContents);
    oldWindow.close();

    let displays = screen.getAllDisplays()


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
                    duration: calculateDuration(duration)
                });
            }

            save.songs = details;
            saveSettingsToDisk().then();

            event.sender.send('getSongs', details);
        });


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

    ipcMain.on('timer-play', async (event, segments) => {

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
    });

    ipcMain.on('timer-pause', async (event, segments) => {
        save.show_status.paused = true;
    });

    ipcMain.on('timer-next', async (event, segments) => {
        nextSegment();
    });

    ipcMain.on('timer-reset', async (event, segments) => {
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
}

//app.whenReady().then(createWindow);
exports.createWindow = createWindow;


app.on('window-all-closed', () => {
    app.quit()
})

setInterval(tick, 1000);


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
        if(segment.type === 1){
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
