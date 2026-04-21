#!/usr/bin/env node
"use strict";

const net = require("net");

function encodeVInt(value) {
  const out = [];

  let temp = (value >> 25) & 0x40;
  let flipped = value ^ (value >> 31);

  temp |= value & 0x3f;
  value >>= 6;
  flipped >>= 6;

  if (flipped === 0) {
    out.push(temp);
    return Buffer.from(out);
  }

  out.push(temp | 0x80);

  flipped >>= 7;
  let r = flipped ? 0x80 : 0;
  out.push((value & 0x7f) | r);
  value >>= 7;

  while (flipped !== 0) {
    flipped >>= 7;
    r = flipped ? 0x80 : 0;
    out.push((value & 0x7f) | r);
    value >>= 7;
  }

  return Buffer.from(out);
}

function writeInt32(value) {
  const buf = Buffer.alloc(4);
  buf.writeInt32BE(value, 0);
  return buf;
}

function writeString(value) {
  if (!value) {
    return writeInt32(0);
  }

  const body = Buffer.from(value, "utf8");
  return Buffer.concat([writeInt32(body.length), body]);
}

function framePacket(id, version, payload) {
  const header = Buffer.alloc(7);
  header.writeUInt16BE(id, 0);
  header.writeUIntBE(payload.length, 2, 3);
  header.writeUInt16BE(version, 5);
  return Buffer.concat([header, payload]);
}

function parseArgs(argv) {
  const args = {
    host: "127.0.0.1",
    port: 9330,
    highId: 0,
    lowId: 0,
    token: "",
    major: 13,
    build: 3006,
    content: 377,
    resourceSha: "dev-local-sha",
    timeoutMs: 10000,
  };

  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];

    switch (key) {
      case "--host":
        args.host = value;
        i++;
        break;
      case "--port":
        args.port = Number(value);
        i++;
        break;
      case "--high-id":
        args.highId = Number(value);
        i++;
        break;
      case "--low-id":
        args.lowId = Number(value);
        i++;
        break;
      case "--token":
        args.token = value;
        i++;
        break;
      case "--major":
        args.major = Number(value);
        i++;
        break;
      case "--build":
        args.build = Number(value);
        i++;
        break;
      case "--content":
        args.content = Number(value);
        i++;
        break;
      case "--resource-sha":
        args.resourceSha = value;
        i++;
        break;
      case "--timeout":
        args.timeoutMs = Number(value);
        i++;
        break;
      case "--help":
        console.log(`Usage:\n  node client [options]\n\nOptions:\n  --host <ip>           Default: 127.0.0.1\n  --port <number>       Default: 9330\n  --high-id <number>    Default: 0\n  --low-id <number>     Default: 0 (0+0 creates a new user)\n  --token <string>      Default: empty\n  --major <number>      Default: 13\n  --build <number>      Default: 3006\n  --content <number>    Default: 377\n  --resource-sha <str>  Default: dev-local-sha\n  --timeout <ms>        Default: 10000\n`);
        process.exit(0);
        break;
      default:
        break;
    }
  }

  return args;
}

function decodeLoginOk(payload) {
  if (payload.length < 16) return null;

  const high = payload.readInt32BE(0);
  const low = payload.readInt32BE(4);

  const tokenLen = payload.readInt32BE(16);
  let token = "";
  if (tokenLen > 0 && payload.length >= 20 + tokenLen) {
    token = payload.slice(20, 20 + tokenLen).toString("utf8");
  }

  return { id: { high, low }, token };
}

const options = parseArgs(process.argv);

const clientHello = framePacket(10100, 0, Buffer.alloc(0));
const loginPayload = Buffer.concat([
  writeInt32(options.highId),
  writeInt32(options.lowId),
  writeString(options.token),
  encodeVInt(options.major),
  encodeVInt(options.build),
  encodeVInt(options.content),
  writeString(options.resourceSha),
]);
const loginPacket = framePacket(10101, 1, loginPayload);

let inbound = Buffer.alloc(0);
const seen = new Set();

const socket = net.createConnection(
  {
    host: options.host,
    port: options.port,
  },
  () => {
    console.log(`[client] connected to ${options.host}:${options.port}`);
    socket.write(clientHello);
    socket.write(loginPacket);
  },
);

const deadline = setTimeout(() => {
  console.error("[client] timeout waiting for login flow");
  socket.destroy();
  process.exit(1);
}, options.timeoutMs);

socket.on("data", (chunk) => {
  inbound = Buffer.concat([inbound, chunk]);

  while (inbound.length >= 7) {
    const id = inbound.readUInt16BE(0);
    const len = inbound.readUIntBE(2, 3);
    const version = inbound.readUInt16BE(5);
    const size = 7 + len;

    if (inbound.length < size) break;

    const payload = inbound.slice(7, size);
    inbound = inbound.slice(size);

    seen.add(id);
    console.log(`[client] <- id=${id} version=${version} len=${len}`);

    if (id === 21435) {
      const info = decodeLoginOk(payload);
      if (info) {
        console.log(`[client] login ok user=${info.id.high}:${info.id.low}`);
        console.log(`[client] token=${info.token}`);
      }
    }

    if (seen.has(20100) && seen.has(21435) && seen.has(25865)) {
      clearTimeout(deadline);
      console.log("[client] login flow complete (20100, 21435, 25865)");
      socket.end();
      return;
    }
  }
});

socket.on("error", (err) => {
  clearTimeout(deadline);
  console.error("[client] socket error:", err.message);
  process.exit(1);
});

socket.on("close", () => {
  if (seen.has(20100) && seen.has(21435) && seen.has(25865)) {
    process.exit(0);
  }

  clearTimeout(deadline);
  console.error("[client] connection closed before full login flow");
  process.exit(1);
});
