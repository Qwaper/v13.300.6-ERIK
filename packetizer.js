"use strict";

/**
 * Packetizer - Assembles incoming data chunks into complete packets.
 *
 * Protocol:
 *   - 2 bytes: message id
 *   - 3 bytes: payload length (unsigned, big-endian)
 *   - 2 bytes: version
 *   - payload (exactly `payloadLength` bytes)
 *
 * This class maintains state across multiple `data` events and must be
 * instantiated once per connection and reused for all data from that connection.
 */
class Packetizer {
  constructor(session) {
    this._buffer = null;
    this._packet = null;
    this.session = session;
    this.maxPacketSize = 16 * 1024 * 1024;
  }

  /**
   * Process an incoming data chunk, extract complete packets, and invoke callback for each.
   * @param {Buffer} data
   * @param {Function} callback
   */
  packetize(data, callback) {
    this._buffer = this._buffer ? Buffer.concat([this._buffer, data]) : data;

    while (this._buffer && this._buffer.length > 0) {
      if (this._packet && this._packet.length > 0) {
        const payloadLength = this._packet.readUIntBE(2, 3);

        if (this._buffer.length >= payloadLength) {
          const payload = this._buffer.slice(0, payloadLength);
          const fullPacket = Buffer.concat([this._packet, payload]);

          callback(fullPacket);

          this._packet = null;
          this._buffer = this._buffer.slice(payloadLength);
        } else {
          break;
        }
      } else if (this._buffer.length >= 7) {
        this._packet = this._buffer.slice(0, 7);
        this._buffer = this._buffer.slice(7);

        const payloadLength = this._packet.readUIntBE(2, 3);
        if (payloadLength > this.maxPacketSize) {
          console.error(
            `Packet payload length ${payloadLength} exceeds maximum ${this.maxPacketSize}`,
          );
          this._packet = null;
          break;
        }

        if (payloadLength === 0) {
          callback(this._packet);
          this._packet = null;
        }
      } else {
        break;
      }
    }
  }
}

module.exports = Packetizer;
