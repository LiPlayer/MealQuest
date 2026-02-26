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

function createWebSocketHub() {
  const clients = new Set();

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
      role: auth.role
    };
    clients.add(client);

    socket.on("data", (buffer) => {
      // minimal handling: close frame / ping frame
      if (!Buffer.isBuffer(buffer) || buffer.length < 2) {
        return;
      }
      const opcode = buffer[0] & 0x0f;
      if (opcode === 0x8) {
        cleanupClient(client);
      }
      if (opcode === 0x9) {
        // pong
        socket.write(Buffer.from([0x8a, 0x00]));
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

    let sentCount = 0;
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
        sentCount++;
      } catch {
        cleanupClient(client);
      }
    }
    if (event === "STRATEGY_CHAT_DELTA") {
      console.log(`[ws-hub] Broadcast ${event} to merchant=${merchantId}, sentCount=${sentCount}/${clients.size}`);
    }
  }

  function getOnlineCount(merchantId) {
    let count = 0;
    for (const client of clients) {
      if (!client.socket.destroyed && client.merchantId === merchantId) {
        count += 1;
      }
    }
    return count;
  }

  function closeAll() {
    for (const client of [...clients]) {
      cleanupClient(client);
    }
  }

  return {
    handleUpgrade,
    broadcast,
    getOnlineCount,
    closeAll
  };
}

module.exports = {
  createWebSocketHub
};
