const { Atem } = require('atem-connection');
const Jimp = require('jimp');
const PATH = require("path");
const fs = require("fs");

class AtemController{

    #atem;
    connected;

    onConnectedCallbacks;

    constructor() {
        this.#atem = new Atem();
        this.connected = false;
        this.onConnectedCallbacks = [];
        let _this = this;
        this.#atem.on("connected",()=>{
            _this.connected = true;
            fs.writeFileSync(PATH.join(__dirname,"debug_new.json"),JSON.stringify(this.#atem.state));
            _this.#onConnected(_this);
        });
        this.#atem.on("disconnected",()=>{
            _this.#onDisconnected(_this);
        })
    }

    connect(ipAddress){
        return new Promise(((resolve) => {
            if(this.connected){
                resolve();
            }else{
                this.addOnConnectedOnce(resolve);
                this.#atem.connect(ipAddress);
            }
        }));
    }

    #onDisconnected(_this){
        _this.connected = false;
    }

    async disconnect(){
        this.connected = false;
        await this.#atem.disconnect();
    }

    addOnConnected(callback){
        this.onConnectedCallbacks.push({
            cb: callback,
            once: false
        });
        return this.onConnectedCallbacks.length-1;
    }

    addOnConnectedOnce(callback){
        this.onConnectedCallbacks.push({
            cb: callback,
            once: true
        });
        return this.onConnectedCallbacks.length-1;
    }

    removeOnConnected(index){
        this.onConnectedCallbacks.splice(index, 1);
    }

    async #onConnected(_this){
        let toDelete = [];
        for(let i=0;i<_this.onConnectedCallbacks.length;i++){
            let item = _this.onConnectedCallbacks[i];
            try{
                if(item.once){
                    toDelete.push(i);
                }
                item.cb();
            }catch (e){}
        }
        for(let i=0;i<toDelete.length;i++){
            _this.removeOnConnected(toDelete[i]);
        }
    }

    onError(callback){
        this.#atem.on("error",callback);
    }

    uploadStill(path,index){
        if(!this.connected)return;
        return new Promise(async (resolve, reject) => {
            try{
                let file = await this.readImage(path);

                this.#atem.uploadStill(index % this.#atem.state.media.stillPool.length, file, PATH.basename(path), '').then(
                    async _res => {
                        resolve(true);
                    },
                    e => {
                        reject(e);
                    }
                );
            }catch (e){
                reject(e);
            }
        });
    }

    switchStill(index){
        if(!this.connected)return;
        return this.#atem.setMediaPlayerSource({
            sourceType: 1,
            clipIndex: 0,
            stillIndex: index % this.#atem.state.media.stillPool.length
        });
    }

    stillToPreview(){
        if(!this.connected)return;
        return this.#atem.changePreviewInput(3010);
    }

    key1(){
        if(!this.connected)return;
        return this.#atem.macroRun(0);
    }

    checkStreamingService(url,key){
        if(!this.connected)return false;
        let service = this.#atem.state.streaming.service;

        return service.key === key && service.url === url;
    }

    checkMacro(){
        if(!this.connected)return false;
        return this.#atem.state.macro.macroProperties[0].isUsed;
    }

    checkDVE(DVE){
        if(!this.connected)return false;
        let saved = DVE.settings;
        let current = this.#atem.state.video.mixEffects[0].upstreamKeyers[0].dveSettings;

        let keys = Object.keys(saved);
        for(let i=0;i<keys.length;i++){
            if(saved[keys[i]] !== current[keys[i]]){
                return false;
            }
        }
        return true;
    }

    setStreamingService(url, key){
        if(!this.connected)return;
        return this.#atem.setStreamingService({
            serviceName: "Teleprompter defined",
            url: url,
            key: key
        });
    }

    setDVE(settings){
        if(!this.connected)return;
        return this.#atem.setUpstreamKeyerDVESettings({
            ...settings["settings"]
        })
    }

    readImage(path){
        return new Promise(((resolve, reject) => {
            Jimp.read(path).then(async (image)=>{

                let data = Buffer.alloc(image.getWidth()*image.getHeight()*4);

                let index = 0;

                for(let y=0;y<image.getHeight();y++){
                    for(let x=0;x<image.getWidth();x++){
                        let pixel = Jimp.intToRGBA(image.getPixelColor(x,y));

                        data.writeUInt8(pixel["r"],index);
                        data.writeUInt8(pixel["g"],index+1);
                        data.writeUInt8(pixel["b"],index+2);
                        data.writeUInt8(pixel["a"],index+3);
                        index += 4;
                    }
                }

                resolve(data);
            }).catch(reject);
        }));
    }
}

exports.AtemController = AtemController;
