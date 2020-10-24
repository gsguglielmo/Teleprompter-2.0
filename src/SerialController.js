const SerialPort = require('serialport');

class SerialController{

    #vendor;
    #product;
    #mappings;
    #port;

    #cc;

    #connection;

    constructor(vendor="3031",product="3031",mapping={next: "1",reset: "2",pause:"3",prepare:"4",start:"4"}) {

        this.#vendor = vendor.toUpperCase();
        this.#product = product.toUpperCase();
        this.#mappings = mapping;

        this.identify().then((port)=>{
            this.#port = port["path"];
            this.#connection = new SerialPort(this.#port,{ baudRate: 9600, autoOpen: false });
            if(this.#cc !== undefined){
                this.#connection.open((err) => {
                    if (err) {
                        return console.log('Error opening port: ', err.message)
                    }

                    this.#connection.on("data",this.#cc);
                })
            }
        }).catch((e)=>{
            console.error(e);
        })

    }

    identify() {
        return new Promise(((resolve, reject) => {
            SerialPort.list().then((ports)=>{

                for(let i=0;i<ports.length;i++){
                    if(ports[i]["vendorId"] === undefined || ports[i]["productId"] === undefined)continue;
                    let vendor = ports[i]["vendorId"].toUpperCase();
                    let product = ports[i]["productId"].toUpperCase();

                    if(vendor === this.#vendor && product === this.#product){
                        resolve(ports[i]);
                        return;
                    }
                }

                console.log(ports);

            }).catch(reject);
        }));
    }

    close(){
        if(this.#connection !== undefined){
            this.#connection.close();
        }
    }

    onKeyPressedCallback(cb){
        let call = (byte)=>{
            let index = byte.readUInt8();

            switch (index){
                case this.#mappings.next.charCodeAt(0):
                    cb("next");
                    break;
                case this.#mappings.reset.charCodeAt(0):
                    cb("reset");
                    break;
                case this.#mappings.pause.charCodeAt(0):
                    cb("pause");
                    break;
                case this.#mappings.prepare.charCodeAt(0):
                    cb("prepare");
                    break;
                case this.#mappings.start.charCodeAt(0):
                    cb("start");
                    break;
            }
        };
        if(this.#connection===undefined){
            this.#cc = call;
        }else{
            this.#connection.on("data",call);
        }

    }


}
exports.SerialController = SerialController;

