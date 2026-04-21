const fs = require("fs");
const path = require("path");

class MessageFactory {
  constructor() {
    this.packets = {};

    const messagesDir = path.join(__dirname, "Messages", "Client");
    const files = fs
      .readdirSync(messagesDir)
      .filter((file) => file.endsWith(".js"));

    for (const file of files) {
      const packetName = file.replace(".js", "");
      try {
        const Packet = require(path.join(messagesDir, packetName));
        const packetClass = new Packet();
        this.packets[packetClass.id] = Packet;
      } catch (err) {
        console.log(
          `[SERVER] >> A wild error while initializing "${packetName}" packet!`,
        );
        console.log(err);
      }
    }
  }

  handle(id) {
    return this.packets[id];
  }

  getPackets() {
    return Object.keys(this.packets);
  }
}

module.exports = MessageFactory;
