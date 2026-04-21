const fs = require("fs");
const path = require("path");

class CommandManager {
  constructor() {
    this.commands = {};

    const commandsDir = path.join(__dirname, "Commands", "Client");
    const files = fs
      .readdirSync(commandsDir)
      .filter((file) => file.endsWith(".js"));

    files.forEach((e) => {
      const Command = require(path.join(commandsDir, e.replace(".js", "")));
      const commandClass = new Command();

      this.commands[commandClass.commandID] = Command;
    });
  }

  handle(id) {
    return this.commands[id];
  }

  getCommands() {
    return Object.keys(this.commands);
  }
}

module.exports = CommandManager;
