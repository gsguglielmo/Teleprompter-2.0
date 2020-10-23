const { app } = require('electron');
const fs = require("fs");
const path = require("path");

class GlobalConfig{

    #config = {
        services: [],
        dveStyles: []
    }

    #defaults;

    #configPath;

    constructor() {
        this.#configPath = path.join(app.getPath("userData"),"config.json");
        if(fs.existsSync(this.#configPath)){
            this.#config = JSON.parse(fs.readFileSync(this.#configPath));
        }else{
            this.#saveToDisk();
        }
        this.#compatibilityChecks();
        this.#defaults = require(path.join(__dirname,"defaults.json"));
    }

    #compatibilityChecks(){

    }

    #saveToDisk(){
        fs.writeFileSync(this.#configPath,JSON.stringify(this.#config));
    }

    getServices(){
        return [
            ...this.#defaults.services,
            ...this.#config.services
        ]
    }

    getDVEStyles(){
        return [
            ...this.#defaults.dveStyles,
            ...this.#config.dveStyles
        ]
    }

    addService(name, server){
        this.#config.services.push({
            name: name,
            server: server
        })
        this.#saveToDisk();
    }

    removeService(index){
        if(index<this.#defaults.services.length)return false;
        this.#config.services.splice(index-this.#defaults.services.length, 1);
    }

}

exports.GlobalConfig = GlobalConfig;
