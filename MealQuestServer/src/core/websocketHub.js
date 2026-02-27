const crypto = require("node:crypto");

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function createAcceptKey(secWebSocketKey) {
  return crypto
    .createHash("sha1")
    .update(secWebSocketKey + WS_GUID, "utf8")
    .digest("base64");
}

function encodeTextFrame(payloadText) {
  const payload = Buffer.from(payloadText, "utf8");
  const length = payload.length;
  let header;

  if (length < 126) {
    header = Buffer.from([0x81, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  return Buffer.concat([header, payload]);
}

function decodeFrame(buffer) {
  if (buffer.length < 2) return null;
  const byte0 = buffer[0];
  const byte1 = buffer[1];
  const opcode = byte0 & 0x0f;
  const isMasked = (byte1 & 0x80) !== 0;
  let payloadLen = byte1 & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buffer.length < 4) return null;
    payloadLen = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buffer.length < 10) return null;
    payloadLen = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  let mask;
  if (isMasked) {
    if (buffer.length < offset + 4) return null;
    mask = buffer.slice(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + payloadLen) return null;
  const data = buffer.slice(offset, offset + payloadLen);
  if (isMasked) {
    for (let i = 0; i < data.length; i++) {
      data[i] = data[i] ^ mask[i % 4];
    }
  }

  return { opcode, payload: data.toString("utf8") };
}

function createWebSocketHub() {
  const clients = new Set();
  let messageHandler = null;

  function cleanupClient(client) {
    clients.delete(client);
    if (!client.socket.destroyed) {
      try {
        client.socket.end();
      } catch {
        // ignore
      }
    }
  }

  function handleUpgrade(req, socket, auth) {
    const key = req.headers["sec-websocket-key"];
    if (!key || typeof key !== "string") {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    const acceptKey = createAcceptKey(key);
    const responseHeaders = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
      "\r\n"
    ];
    socket.write(responseHeaders.join("\r\n"));

    const client = {
      socket,
      merchantId: auth.merchantId,
      role: auth.role,
      auth
    };
    clients.add(client);

    socket.on("data", (buffer) => {
      const decoded = decodeFrame(buffer);
      if (!decoded) return;

      const { opcode, payload } = decoded;
      if (opcode === 0x8) {
        cleanupClient(client);
      } else if (opcode === 0x9) {
        // ping -> pong
        socket.write(Buffer.from([0x8a, 0x00]));
      } else if (opcode === 0x1) {
        // text frame
        if (messageHandler) {
          try {
            const data = JSON.parse(payload);
            messageHandler(client, data);
          } catch (err) {
            console.error("[ws-hub] Failed to parse payload:", err.message);
          }
        }
      }
    });

    socket.on("close", () => cleanupClient(client));
    socket.on("error", () => cleanupClient(client));
    socket.on("end", () => cleanupClient(client));
  }

  function broadcast(merchantId, event, payload) {
    const message = JSON.stringify({
      type: event,
      merchantId,
      payload,
      timestamp: new Date().toISOString()
    });
    const frame = encodeTextFrame(message);

    for (const client of clients) {
      if (client.socket.destroyed) {
        clients.delete(client);
        continue;
      }
      if (client.merchantId !== merchantId) {
        continue;
      }
      try {
        client.socket.write(frame);
      } catch {
      }
    }
  }

  function onMessage(handler) {
    messageHandler = handler;
  }

  function closeAll() {
    for (const client of [...clients]) {
      cleanupClient(client);
    }
  }

  return {
    handleUpgrade,
    broadcast,
    onMessage,
    closeAll
  };
}

module.exports = {
  createWebSocketHub
};
