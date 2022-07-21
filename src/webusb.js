/**
 * Created by Joris on 21/07/2022.
 */
import * as JSZip from 'jszip';

const MAX_RETRIES = 3;
const PACKETHEADERSIZE = 12;

class PACKET {
    command
    size
    message_id
    received
    buffer
    constructor(command, size, message_id) {
        this.command = command;
        this.size = size;
        this.message_id = message_id;
        this.received = 0;
        this.buffer = new Uint8Array(this.size);
    }

    ingest(buffer) {
        const ingest = Math.min(this.size-this.received, buffer.byteLength);
        this.buffer.set(buffer.slice(0, ingest), this.received);
        this.received += ingest;
        if (ingest == buffer.byteLength) {
            return new Uint8Array(0);
        } else {
            return buffer.slice(ingest)
        }
    }

    isDone() {
        return this.received == this.size
    }
}

export class WEBUSB {
    vendorId;
    interface_fsob;
    buffer_fsob;
    packet_fsob;
    interface_serial;
    stdout_callback;
    device;
    requests;
    current_message_id;
    
    /**
     * Create the webusb class for communicating with fsob and serial
     *  
     * @param {int} vendorId - vendorid of the webusb device
     * @param {array} interface_fsob - usb interface number and endpoint for fsob
     * @param {array} interface_serial - usb interface number and endpoint for serial, null for not available
     */
    constructor(vendorId = 0xcafe, interface_fsob = [2, 3], interface_serial = [3, 4]) {
        this.vendorId = vendorId;
        this.interface_fsob = interface_fsob;
        this.interface_serial = interface_serial;
        if (interface_fsob.length != 2) {
            console.log("Invalid interface_fsob config");
            this.interface_fsob = null;
        }
        if (interface_serial.length != 2) {
            console.log("Invalid serial config");
            this.interface_serial = null;
        }
        this.buffer_fsob = new Uint8Array(0);
        this.packet_fsob = null;
        this.stdout_callback = null;
        this.device = null;
        this.requests = {};
        this.current_message_id = 1;
    }

    static parsepacketheader(data) {
        let response = {};
        let view = new DataView(data);
        response["command"] = view.getUint16(0, true);
        response["size"] = view.getUint32(2, true);
        let verif = view.getUint16(6);
        response["message_id"] = view.getUint32(8, true);        
        response["valid"] = (verif == 57005);
        
        return response;
    }

    buildpacket(size, command) {
        //console.log(packetheadersize+size);
        this.current_message_id++;
        let arraybuffer = new ArrayBuffer(12+size);
        let buffer = new Uint8Array(arraybuffer);
        new DataView(arraybuffer).setUint16(0, command, true);
        new DataView(arraybuffer).setUint32(2, size, true);
        new DataView(arraybuffer).setUint32(8, this.current_message_id, true);
        buffer[6] = 0xDE;
        buffer[7] = 0xAD;
        return {buffer: buffer, message_id: this.current_message_id};
    }

    buildpacketWithFilename(size, command, filename) {
        let {buffer, message_id} = this.buildpacket(filename.length+1+size, command, message_id);
        for(let i = 0; i<filename.length; i++) {
            buffer[PACKETHEADERSIZE+i] = filename.charCodeAt(i);
        }
        buffer[PACKETHEADERSIZE+filename.length] = 0;
        return {buffer, message_id: message_id};
    }

    rewritemessageid(buffer) {
        if (buffer instanceof Uint8Array || buffer instanceof Uint16Array || buffer instanceof Uint32Array) {
            // If buffer is not an ArrayBuffer, get its ArrayBuffer property
            buffer = buffer.buffer;
        }
        console.log(buffer);
        this.current_message_id++;
        new DataView(buffer).setUint32(8, this.current_message_id, true);
        return this.current_message_id;
    }

    send_buffer(buffer, message_id, return_string=true) {
        let resolve, reject;
        let promise = new Promise((_resolve, _reject) => {resolve = _resolve; reject = _reject;});
        let request = {
            buffer, // For retransmit
            resolve: (data) => {
                if(return_string) {
                    if(data.byteLength === 0) {
                        resolve("");
                        return true;
                    } else {
                        let textdecoder = new TextDecoder("ascii");
                        resolve(textdecoder.decode(data));
                        return true
                    }
                } else {
                    resolve(data);
                    return true;
                }
            },
            reject: (reason, immediate_reject=false) => {
                if(!immediate_reject && request.retries <= MAX_RETRIES) {
                    request.retries++;
                    console.log(buffer);
                    this.rewritemessageid(buffer);
                    this.device.transferOut(3, buffer);
                    return false;
                } else {
                    reject(reason);
                    return true;
                }
            },
            retries: 0 // Number of times this request has been retransmitted already
        };
        this.requests[message_id] = request;
        this.device.transferOut(3, buffer);
        return promise;
    }

    fetch_dir(dir_name) {
        console.log('Fetching', dir_name);
        if(dir_name === undefined || dir_name === '') {
            dir_name = '/';
        }
        let {buffer, message_id} = this.buildpacket(dir_name.length+1, 4096);
        for(let i = 0; i<dir_name.length; i++) {
            buffer[PACKETHEADERSIZE+i] = dir_name.charCodeAt(i);
        }
        buffer[PACKETHEADERSIZE+dir_name.length] = 0;
        return this.send_buffer(buffer, message_id, true);
    }

    async readfile(file_name, return_string=true) {
        let {buffer, message_id} = this.buildpacketWithFilename(0, 4097, file_name);
        let contents = await this.send_buffer(buffer, message_id, return_string);
        if(contents === 'Can\'t open file') {
            contents = undefined;
        }
        return contents;
    }
    
    createfile(dir_name) {
        let {buffer, message_id} = this.buildpacketWithFilename(0, 4098, dir_name);
        return this.send_buffer(buffer, message_id);
    }

    async deldir(dir_name) {
        let dir = await this.fetch_dir(dir_name)
        let dirlist = dir.split('\n');
        dirlist.unshift();
        console.log(dirlist);
        for(let i = 1; i < dirlist.length; i++) {
            let item = dirlist[i];
            if(item.charAt(0) == 'd') {
                await this.deldir(dir_name + "/" + item.substr(1));
            } else {
                await this.delfile(dir_name + "/" + item.substr(1));
            }
        }
        await this.delfile(dir_name);
    }

    async downloaddir(dir_name, zip=undefined) {
        if(zip === undefined) {
            zip = new JSZip();
        }
    
        let dir = await this.fetch_dir(dir_name)
        let dirlist = dir.split('\n');
        dirlist.unshift();
        console.log(dirlist);
        for(let i = 1; i < dirlist.length; i++) {
            let item = dirlist[i];
            if(item.charAt(0) == 'd') {
                await this.downloaddir(dir_name + "/" + item.substr(1), zip.folder(item.substr(1)));
            } else {
                let data = await this.readfile(dir_name + "/" + item.substr(1));
                zip.file(item.substr(1), data);
            }
        }
        return zip;
    }

    delfile(dir_name) {
        console.log("Deleting: "+dir_name);
        let {buffer, message_id} = this.buildpacketWithFilename(0, 4099, dir_name);
        return this.send_buffer(buffer, message_id);
    }

    runfile(file_path) {
        if(file_path.startsWith('/flash')) {
            file_path = file_path.slice('/flash'.length);
        }
        let {buffer, message_id} = this.buildpacketWithFilename(0, 0, file_path);
        return this.send_buffer(buffer, message_id);
    }

    duplicatefile(source, destination) {
        let {buffer, message_id} = this.buildpacket(source.length+1+destination.length+1, 4100);
        for(let i = 0; i<source.length; i++) {
            buffer[PACKETHEADERSIZE+i] = source.charCodeAt(i);
        }
        buffer[PACKETHEADERSIZE+source.length] = 0;
    
        for(let i = 0; i<destination.length; i++) {
            buffer[PACKETHEADERSIZE+source.length+1+i] = destination.charCodeAt(i);
        }
        buffer[PACKETHEADERSIZE+source.length+1+destination.length] = 0;
        return this.send_buffer(buffer, message_id);
    }

    movefile(source, destination) {
        let {buffer, message_id} = this.buildpacket(source.length+1+destination.length+1, 4101);
        for(let i = 0; i<source.length; i++) {
            buffer[PACKETHEADERSIZE+i] = source.charCodeAt(i);
        }
        buffer[PACKETHEADERSIZE+source.length] = 0;
    
        for(let i = 0; i<destination.length; i++) {
            buffer[PACKETHEADERSIZE+source.length+1+i] = destination.charCodeAt(i);
        }
        buffer[PACKETHEADERSIZE+source.length+1+destination.length] = 0;
    
        return this.send_buffer(buffer, message_id);
    }

    copyfile(source, destination) {
        let {buffer, message_id} = this.buildpacket(source.length+1+destination.length+1, 4100);
        for(let i = 0; i<source.length; i++) {
            buffer[PACKETHEADERSIZE+i] = source.charCodeAt(i);
        }
        buffer[PACKETHEADERSIZE+source.length] = 0;
    
        for(let i = 0; i<destination.length; i++) {
            buffer[PACKETHEADERSIZE+source.length+1+i] = destination.charCodeAt(i);
        }
        buffer[PACKETHEADERSIZE+source.length+1+destination.length] = 0;
    
        return this.send_buffer(buffer, message_id);
    }

    savetextfile(filename, contents) {
        console.log(filename);
        let {buffer, message_id} = this.buildpacketWithFilename(contents.length, 4098, filename);
        for(let i = 0; i<contents.length; i++) {
            buffer[PACKETHEADERSIZE+filename.length+1+i] = contents.charCodeAt(i);
        }
    
        return this.send_buffer(buffer, message_id);
    }
    
    savefile(filename, contents) {
        let {buffer, message_id} = this.buildpacketWithFilename(contents.byteLength, 4098, filename);
        let uint8 = new Uint8Array(buffer);
        uint8.set(new Uint8Array(contents), PACKETHEADERSIZE+filename.length+1);
        buffer = uint8.buffer;
        return this.send_buffer(buffer, message_id);
    }
    
    createfolder(folder) {
        let {buffer, message_id} = this.buildpacketWithFilename(0, 4102, folder);
        return this.send_buffer(buffer, message_id);
    }

    registerstdout(func) {
        this.stdout_callback = func;
    }
    
    sendHeartbeat() {
        let {buffer, message_id} = this.buildpacketWithFilename(0, 1, "beat");
        this.send_buffer(buffer, message_id, true).then(data => {console.debug("Heartbeat")}, reason => {console.log("Heartbeat no response")});
    }

    reset() {
        this.current_message_id = 1;
        this.buffer_fsob = new Uint8Array(0);
        this.requests = {};
        this.packet_fsob = null;
    }

    async connect() {
        console.log(this);
        this.reset();

        if (this.device) {
            await this.device.close();
        }
        
        let res = await navigator.usb.requestDevice({ filters: [{ vendorId: this.vendorId}] });
        this.device = res;
        window.dev = res;
        await this.device.open();
        await this.device.selectConfiguration(1);
        if (this.interface_fsob != null) {
            await this.device.claimInterface(this.interface_fsob[0]);
            this.readfsob();
        }
        if (this.interface_serial != null) {
            await this.device.claimInterface(this.interface_serial[0]);
            this.readserial();
        }
    }

    handlePacket(packet) {
        let message_type = packet.command
        let message_id = packet.message_id
        let data = packet.buffer
        let textdecoder = undefined;
        let file_contents = undefined;
    
        if (message_type === 1 && message_id === 0) {
            textdecoder = new TextDecoder("ascii");
            file_contents = textdecoder.decode(data);
            file_contents = file_contents.substring(0, 2);
            if (file_contents === "to") {
                for(let key in this.requests) {
                    let request = this.requests[key];
                    if(!request.reject('Timeout')) {
                        this.requests[this.current_message_id] = request;
                    }
                    delete this.requests[key];
                }
            } else if (file_contents === "te") {
                for(let key in this.requests) {
                    let request = this.requests[key];
                    if(!request.reject('Timeout')) {
                        this.requests[this.current_message_id] = request;
                    }
                    delete this.requests[key];
                }
            }
            return;
        }
    
        for(let key in this.requests) {
            let request = this.requests[key];
            if(key < message_id) {
                request.reject('No response');
                delete this.requests[key];
            } else if(key == message_id) {
                if(data.byteLength === 3) {
                    let textdecoder = new TextDecoder("ascii");
                    let text_content = textdecoder.decode(data.slice(0, 2));
                    if(text_content === 'er') {
                        request.reject('Unspecified error', true);  //Immediate reject when proper error is received
                    } else {
                        request.resolve(data, true);
                    }
                } else {
                    request.resolve(data);
                }
                delete this.requests[key];
            }
        }
    }

    readfsob() {
        this.device.transferIn(this.interface_fsob[1], 64).then(result => {
            // console.log("Tick");
            const totalbytes = result.data.byteLength;
            let tmp = new Uint8Array(this.buffer_fsob.byteLength+result.data.byteLength);
            tmp.set(new Uint8Array(this.buffer_fsob), 0);
            tmp.set(new Uint8Array(result.data), this.buffer_fsob.byteLength);
            this.buffer_fsob = tmp

            for (;;) {
                if (this.buffer_fsob.byteLength < 12 && this.packet_fsob == null) { //Need new packet header but not enough data so breaking the loop
                    break;
                }
                if (this.packet_fsob == null) { //Need to receive a new packet header
                    const packetdata = this.parsepacketheader(this.buffer_fsob.slice(0, 12));
                    if (packetdata["valid"] == false) {
                        console.log("Error in parsing header");
                    } else {
                        this.packet_fsob = new PACKET(packetdata["command"], packetdata["size"], packetdata["message_id"]);
                    }
                    this.buffer_fsob = this.buffer_fsob.slice(12);
                } else {
                    this.buffer_fsob = this.packet_fsob.ingest(this.buffer_fsob);
                    if (this.packet_fsob.isDone()) {
                        this.handlePacket(this.packet_fsob);
                        this.packet_fsob = null;
                    }
                }
            }
            this.readfsob();    
        }, error => {
            this.onReceiveError(error);
        });
    }

    readserial() {
        this.device.transferIn(this.interface_serial[1], 64).then(result => {
            console.log("Serial in");
            if (this.stdout_callback != null) {
                let textdecoder = new TextDecoder("ascii");
                this.stdout_callback(textdecoder.decode(result.data));
            }
            this.readserial();    
        }, error => {
            this.onReceiveError(error);
        });
    }

    writeserial(data) {
        if (this.interface_serial != null && this.device != null) {
            this.device.transferOut(this.interface_serial[1], data);
        }
    }
}

let connect_resolves = [];
// function connect_check() {
//     if(device !== undefined && device.opened) {
//         for(let resolve of connect_resolves) {
//             resolve();
//         }
//         connect_resolves = [];
//     }
// }
// setInterval(connect_check, 500);
// setInterval(function(){
//     if(device.opened) {
//         if(Object.keys(requests).length < 5)
//             sendHeartbeat();
//     }
// }, 500);


export function on_connect() {
    return new Promise((resolve) => connect_resolves.push(resolve));
}
