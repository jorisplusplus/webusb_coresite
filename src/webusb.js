/**
 * Created by Joris on 21/07/2022.
 */
import * as JSZip from 'jszip';
import CRC32 from 'crc-32';


const MAX_RETRIES = 3;
const MESSAGEHEADERSIZE = 12;
const PACKETSIZE = 80;
const FLAGNEWMESSAGE = 1;
const FLAGENDMESSAGE = 2;
const FLAGRESET = 4;
const PACKETTIMEOUT = 100;
const TXHEADER = 0xAFFA;
const RXHEADER = 0xFAAF;

const SP = {
    EXEC : 0,
    HEARTBEAT : 1,
}

const FF = {
    GETDIR : 4096,
    READFILE : 4097,
    WRITEFILE : 4098,
    DELFILE : 4099,
    DUPLFILE : 4100,
    MVFILE : 4101,
    MAKEDIR : 4102
}

let packetId = 1
let ackId = 0
let messageId = 1

class PACKET {
    header
    flags
    crc
    packet_id
    ack_id
    payload
    packettime
    length
    invalid
    
    constructor(data=null, startmessage=false, endmessage=false, reset=false) {
        if (data != null && data.byteLength == 80) {
            const view = new DataView(data.buffer);
            this.invalid = false;
            this.header = view.getUint16(0, true);
            if (this.header != RXHEADER) {
                this.invalid = true;
                console.log("Invalid header");
            }
            this.flags = view.getUint16(2, true);
            this.length = this.flags >> 9;
            this.crc = view.getInt32(4, true);
            view.setUint32(4, 0, true);
            if (this.crc != CRC32.buf(data, 0)) {
                this.invalid = true;
                console.log("invalid crc %d, %d", this.crc, CRC32.buf(data, 0));
            }
            this.packet_id = view.getUint32(8, true);
            this.ack_id = view.getUint32(12, true);
            this.payload = data.slice(16, 16+this.length);
        } else {
            this.header = TXHEADER;
            this.flags = 0;
            if (startmessage) {
                this.flags |= FLAGNEWMESSAGE;
            }
            if (endmessage) {
                this.flags |= FLAGENDMESSAGE;
            }
            if (reset) {
                this.flags |= FLAGRESET;
            }
            this.crc = 0;
            this.packet_id = 0;
            this.ack_id = 0;
            if (data != null) {
                this.payload = data;
                this.length = data.byteLength;
                this.flags |= (this.length << 9);
            }
            this.payloadBytes = null
            this.packettime = 0
        }
    }

    txPacket(resend=false) {
        if (this.payloadBytes == null) {
            if (this.payload == null) {
                this.packet_id = 0;
            } else {
                this.packet_id = packetId;
                packetId += 1;
            }
        }
        if (this.payloadBytes == null || resend) {
            this.crc = 0;
            this.ack_id = ackId;
            let data = new Uint8Array(80);
            const view = new DataView(data.buffer);
            view.setUint16(0, this.header, true);
            view.setUint16(2, this.flags, true);
            view.setUint32(4, this.crc, true);
            view.setUint32(8, this.packet_id, true);
            view.setUint32(12, this.ack_id, true);
            if (this.payload) {
                data.set(this.payload, 16);
            }
            this.crc = CRC32.buf(data, 0);
            view.setUint32(4, this.crc, true);
            this.payloadBytes = data
            this.packettime = new Date().getTime();
        }
        return this.payloadBytes
    }
}


class MESSAGE {
    command
    size
    message_id
    received
    buffer
    constructor(command, payload=null, succesCB=null, errorCB=null) {
        this.command = command;
        this.size = 0;
        this.message_id = 0;
        this.responseData = null;
        this.response = null;
        if (payload == null) {
            this.buffer = new Uint8Array(this.size);
        } else {
            this.buffer = new Uint8Array(payload);
            this.size = payload.byteLength;
        }
        this.succesCB = succesCB;
        this.errorCB = errorCB;
    }

    receiveResponse(packet) {
        if (packet.flags & FLAGNEWMESSAGE && this.responseData != null) {
            console.error("Packet received, transmission already started")
        }
        if (this.responseData == null) {
            this.responseData = packet.payload
        } else {
            console.log("Appending: "+packet.payload.byteLength);
            let newResponseData = new Uint8Array(this.responseData.byteLength + packet.payload.byteLength);
            newResponseData.set(this.responseData);
            newResponseData.set(packet.payload, this.responseData.byteLength);
            this.responseData = newResponseData
        }
        if (packet.flags & FLAGENDMESSAGE) {
            if (this.parseResponse()) {
                console.log("Succes");
                console.log(this);
                this.succesCB(this);
            } else {
                console.log("Fail");
                this.errorCB(this);
            }
            return true
        }
        return false
    }

    parseResponse() {
        if (this.responseData == null || this.responseData.byteLength < 12) {
            console.log("Not enough data");
            return false
        }
        const view = new DataView(this.responseData.buffer);
        const command = view.getUint16(0, true);
        const messageLen = view.getUint32(2, true);
        const verif = view.getUint16(6, true);
        const mId = view.getUint32(8, true);
        if (verif != 44510) {
            console.log(`Verif failed $outlo{verif}`);
            return false;
        }
        if (mId != this.message_id) {
            console.log("Message id incorrect");
            return false;
        }
        if (command != this.command) {
            console.log("Command incorrect");
            return false;
        }
        if (messageLen != this.responseData.byteLength-12) {
            console.log("Not all data received %d %d", messageLen, this.responseData.byteLength-12);
            return false;
        }
        this.response = this.responseData.slice(12);
        return true;
    }

    generatePackets() {
        this.message_id = messageId
        messageId += 1
        let message = new Uint8Array(this.buffer.byteLength+12);
        const view = new DataView(message.buffer);
        view.setUint16(0, this.command, true);
        view.setUint32(2, this.size, true);
        view.setUint16(6, 0xADDE, true);
        view.setUint32(8, this.message_id, true);
        message.set(this.buffer, 12);
        let packets = [];
        for (let i = 0; i < message.byteLength; i += 64) {
            let start = (i == 0);
            let end = ((i+64) >= message.byteLength);
            let payload = message.slice(i, i+64);
            packets.push(new PACKET(payload, start, end));
        }
        console.log(packets[0]);
        console.log(packets);
        return packets;
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
    activeMessage;
    messageQueue;
    packetsSend;
    packetsToSend;
    rxPacketID;
    lastAck;
    rxbuffer;
    
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
        this.activeMessage = null;
        this.messageQueue = [];
        this.packetsSend = [];
        this.packetsToSend = [];
        this.rxPacketID = 0;
        this.lastAck = 0;
        this.txThreadId = 0;
        this.rxbuffer = new Uint8Array(0);
    }

    static nullTerminatedString(text) {
        let encoder = new TextEncoder();
        return encoder.encode(text+"\0");
    }

    static nonTerminatedString(text) {
        let encoder = new TextEncoder();
        return encoder.encode(text);
    }

    async connect() {
        console.log(this);
        this.reset();

        if (this.device) {
            await this.device.close();
        }
        this.reset();
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
        var t = this;
        this.txNackPacket(new PACKET(null, false, false, true));
        this.txThreadId = setInterval(function(){t.txThread();}, 500);
        this.rxbuffer = new Uint8Array(0);
    }

    readfsob() {
        this.device.transferIn(this.interface_fsob[1], 80).then(result => {
            console.log("WebUSB data in: len %d", result.data.buffer.byteLength);
            console.log(result.data.buffer);
            let newbuffer = new Uint8Array(this.rxbuffer.byteLength + result.data.buffer.byteLength);
            newbuffer.set(this.rxbuffer);
            newbuffer.set(new Uint8Array(result.data.buffer), this.rxbuffer.byteLength);
            this.rxbuffer = newbuffer;
            //console.log(this.rxbuffer);
            //console.log(this.rxbuffer.byteLength);
            while (this.rxbuffer.byteLength >= 80) {
                let packet = new PACKET(this.rxbuffer.slice(0, 80));
                if (!packet.invalid) {
                    console.log("Processing packet");
                    this.handlePacket(packet);
                } else {
                    console.log("Packet invalid");
                }
                this.rxbuffer = this.rxbuffer.slice(80);
            }
            if (this.rxbuffer.byteLength > 0) {
                let view = new DataView(this.rxbuffer.buffer);
                if (view.getUint16(0, true) != 0xFAAF) {
                    console.log("ERROR: Invalid buffer");
                    this.rxbuffer = new Uint8Array(0);
                }
            }
            //console.log(this.rxbuffer);
            this.readfsob();    
        }, error => {
            console.log(error);
        });
    }

    txThread() {
        if (this.activeMessage == null && this.messageQueue.length > 0) {
            this.activeMessage = this.messageQueue.shift();
            this.packetsToSend = this.activeMessage.generatePackets();
            console.log("Message loaded");
        }

        while (this.packetsSend.length < 5 && this.packetsToSend.length > 0) {
            this.txPacket(this.packetsToSend.shift());
        }

        for (const packet of this.packetsSend) {
            if ( (new Date().getTime() - packet.packettime ) > PACKETTIMEOUT) {
                console.log("Packet Timeout");
            }
        }

        if ((this.rxPacketID - ackId) > 2) {
            this.txNackPacket(new PACKET());
        }
        else if (this.rxPacketID != ackId && (new Date().getTime() - this.lastAck) > 0.2) {
            this.txNackPacket(new PACKET());
        }
    }

    handlePacket(packet) {
        let res = false;
        if (packet.packet_id == 0) {
            console.log("Processed nack packet");
            this.handleAck(packet.ack_id);
            return false;
        }
        if (packet.packet_id != (this.rxPacketID + 1) && packet.packet_id > 0) {
            console.warn("Unexpected packet %d %d", packet.packet_id, this.rxPacketID);
            return false;
        }
        this.handleAck(packet.ack_id);
        if (packet.payload && packet.packet_id != this.rxPacketID && this.activeMessage) {
            res = this.activeMessage.receiveResponse(packet);
            if (res) {
                console.log("Clearing active message");
                this.activeMessage = null;
            }
        }
        this.rxPacketID = packet.packet_id;
        console.log("Processed packet, %d", packet.packet_id);
        return res;
    }

    registerstdout(func) {
        this.stdout_callback = func;
    }

    readserial() {
        this.device.transferIn(this.interface_serial[1], 64).then(result => {
            //console.log("Serial in");
            if (this.stdout_callback != null) {
                let textdecoder = new TextDecoder("ascii");
                this.stdout_callback(textdecoder.decode(result.data));
            }
            this.readserial();    
        }, error => {
            console.log(error);
        });
    }

    writeserial(data) {
        console.log("Writing: "+data);
        
        if (this.interface_serial != null && this.device != null) {
            let textencoder = new TextEncoder();
            let encodeData = textencoder.encode(data);
            console.log(encodeData);
            this.device.transferOut(this.interface_serial[1], encodeData);
        }
    }

    sendMessage(command, payload) {
        let promise = new Promise((resolve, reject) => {
            let message = new MESSAGE(command, payload, resolve, reject);
            this.queueMessage(message);
        });
        return promise;
    }

    queueMessage(message) {
        this.messageQueue.push(message);
    }

    txNackPacket(packet) {
        ackId = this.rxPacketID;
        this.lastAck = new Date().getTime();
        this.device.transferOut(this.interface_fsob[1], packet.txPacket());
        console.log("Nack packet send, %d", packet.ack_id);
    }

    txPacket(packet) {
        ackId = this.rxPacketID;
        this.lastAck = new Date().getTime();
        this.device.transferOut(this.interface_fsob[1], packet.txPacket());
        this.packetsSend.push(packet);
    }

    handleAck(ackId) {
        console.log("Received ack: %d", ackId);
        while (this.packetsSend.length > 0 && this.packetsSend[0].packet_id <= ackId) {
            this.packetsSend.shift()
        }
    }

    async fetchdir(dir_name) {
        console.log('Fetching', dir_name);
        if(dir_name === undefined || dir_name === '') {
            dir_name = '/';
        }
        const payload = WEBUSB.nullTerminatedString(dir_name);
        let message = await this.sendMessage(FF.GETDIR, payload);
        let decoder = new TextDecoder();
        let data = decoder.decode(message.response).split("\n");
        let contents = [{"request":data[0]}]
        for (const entry of data.slice(1)) {
            let type = entry.substring(0, 1) == "d" ? "folder" : "file";
            let filename = entry.substring(1);
            contents.push({"type":type, "filename":filename})
        }
        return contents;
    }

    async readfile(file_name, return_string=true) {
        console.log("Reading: "+file_name);
        const payload = WEBUSB.nullTerminatedString(file_name);
        let message = await this.sendMessage(FF.READFILE, payload);
        let data = null;
        if (return_string) {
            let decoder = new TextDecoder();
            data = decoder.decode(message.response)
            console.log(data);
        } else {
            data = message.response;
        }
        return data;
    }
    
    async createfile(file_name) {
        const payload = WEBUSB.nullTerminatedString(file_name);
        let contents = await this.sendMessage(FF.WRITEFILE, payload);
        return contents;
    }

    async delfile(dir_name) {
        console.log("Deleting: "+dir_name);
        const payload = WEBUSB.nullTerminatedString(dir_name);
        let contents = await this.sendMessage(FF.DELFILE, payload);
        return contents
    }

    async runfile(file_path) {
        if(file_path.startsWith('/flash')) {
            file_path = file_path.slice('/flash'.length);
        }
        const payload = WEBUSB.nullTerminatedString(file_path);
        let contents = await this.sendMessage(SP.EXEC, payload);
        return contents;
    }

    async duplicatefile(source, destination) {
        const payload = WEBUSB.nullTerminatedString(source+"\0"+destination);
        let contents = await this.sendMessage(FF.DUPLFILE, payload);
        return contents;
    }

    async movefile(source, destination) {
        const payload = WEBUSB.nullTerminatedString(source+"\0"+destination);
        let contents = await this.sendMessage(FF.MVFILE, payload);
        return contents;
    }

    async copyfile(source, destination) {
        const payload = WEBUSB.nullTerminatedString(source+"\0"+destination);
        let contents = await this.sendMessage(FF.DUPLFILE, payload);
        return contents;
    }

    async savetextfile(filename, content) {
        const payload = WEBUSB.nonTerminatedString(filename+"\0"+content);
        let contents = await this.sendMessage(FF.WRITEFILE, payload);
        return contents;
    }
    
    async savefile(filename, content) {
        const payload = WEBUSB.nonTerminatedString(filename+"\0"+content);
        let contents = await this.sendMessage(FF.WRITEFILE, payload);
        return contents;
    }
    
    async createfolder(folder) {
        const payload = WEBUSB.nullTerminatedString(folder);
        let contents = await this.sendMessage(FF.MAKEDIR, payload);
        return contents;
    }
    
    async sendHeartbeat() {
        const payload = WEBUSB.nullTerminatedString("beat");
        let contents = await this.sendMessage(SP.HEARTBEAT, payload);
        console.log("Heartbeat");
        return contents;
    }

    async deldir(dir_name) {
        let dirlist = await this.fetchdir(dir_name)
        console.log(dirlist);
        for(let i = 1; i < dirlist.length; i++) {
            let item = dirlist[i];
            if(item["type"] == "folder") {
                await this.deldir(dir_name + "/" + item["filename"]);
            } else {
                await this.delfile(dir_name + "/" + item["filename"]);
            }
        }
        await this.delfile(dir_name);
    }

    async downloaddir(dir_name, zip=undefined) {
        if(zip === undefined) {
            zip = new JSZip();
        }
    
        let dir = await this.fetchdir(dir_name)
        let dirlist = dir.split('\n');
        dirlist.unshift();
        console.log(dirlist);
        for(let i = 1; i < dirlist.length; i++) {
            let item = dirlist[i];
            if(item["type"] == "folder") {
                await this.downloaddir(dir_name + "/" + item.substr(1), zip.folder(item.substr(1)));
            } else {
                let data = await this.readfile(dir_name + "/" + item.substr(1));
                zip.file(item.substr(1), data);
            }
        }
        return zip;
    }

    reset() {
        this.buffer_fsob = new Uint8Array(0);
        this.requests = {};
        this.packet_fsob = null;
        packetId = 1;
        ackId = 0;
        messageId = 1;
        this.rxPacketID = 0;
    }
}