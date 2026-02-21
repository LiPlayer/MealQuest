function assertEntity(entity, label) {
  if (!entity) {
    throw new Error(`${label} not found`);
  }
}

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.floor(parsed);
}

function randomInt(min, max) {
  if (max <= min) {
    return min;
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createSocialService(db) {
  function ensureLogs() {
    if (!Array.isArray(db.socialTransferLogs)) {
      db.socialTransferLogs = [];
    }
    return db.socialTransferLogs;
  }

  function ensurePacketBucket(merchantId) {
    if (!db.socialRedPacketsByMerchant || typeof db.socialRedPacketsByMerchant !== "object") {
      db.socialRedPacketsByMerchant = {};
    }
    if (!db.socialRedPacketsByMerchant[merchantId]) {
      db.socialRedPacketsByMerchant[merchantId] = {};
    }
    return db.socialRedPacketsByMerchant[merchantId];
  }

  function getUser(merchantId, userId) {
    const merchant = db.merchants[merchantId];
    assertEntity(merchant, "merchant");
    const user = db.getMerchantUser(merchantId, userId);
    assertEntity(user, "user");
    return user;
  }

  function getDailyTransferSummary(merchantId, fromUserId) {
    const now = Date.now();
    const start = now - 24 * 60 * 60 * 1000;
    const rows = ensureLogs().filter(
      (item) =>
        item &&
        item.merchantId === merchantId &&
        item.fromUserId === fromUserId &&
        new Date(item.createdAt).getTime() >= start
    );
    return {
      count: rows.length,
      totalAmount: rows.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    };
  }

  function transferSilver({
    merchantId,
    fromUserId,
    toUserId,
    amount,
    idempotencyKey
  }) {
    if (!idempotencyKey) {
      throw new Error("Idempotency-Key is required");
    }
    const idemKey = `social_transfer:${merchantId}:${idempotencyKey}`;
    if (db.idempotencyMap.has(idemKey)) {
      return db.idempotencyMap.get(idemKey);
    }

    const transferAmount = toInt(amount, 0);
    if (transferAmount <= 0) {
      throw new Error("amount must be positive integer");
    }
    if (fromUserId === toUserId) {
      throw new Error("cannot transfer to self");
    }

    const summary = getDailyTransferSummary(merchantId, fromUserId);
    if (summary.count >= 20) {
      throw new Error("daily transfer count limit exceeded");
    }
    if (summary.totalAmount + transferAmount > 5000) {
      throw new Error("daily transfer amount limit exceeded");
    }

    const fromUser = getUser(merchantId, fromUserId);
    const toUser = getUser(merchantId, toUserId);
    if (Number(fromUser.wallet.silver || 0) < transferAmount) {
      throw new Error("insufficient silver balance");
    }

    fromUser.wallet.silver = Number(fromUser.wallet.silver || 0) - transferAmount;
    toUser.wallet.silver = Number(toUser.wallet.silver || 0) + transferAmount;

    const record = {
      transferId: `transfer_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      merchantId,
      fromUserId,
      toUserId,
      amount: transferAmount,
      createdAt: new Date().toISOString()
    };
    ensureLogs().push(record);
    db.save();
    const result = {
      ...record,
      fromBalance: fromUser.wallet.silver,
      toBalance: toUser.wallet.silver
    };
    db.idempotencyMap.set(idemKey, result);
    return result;
  }

  function createRedPacket({
    merchantId,
    senderUserId,
    totalAmount,
    totalSlots,
    expiresInMinutes = 30,
    idempotencyKey
  }) {
    if (!idempotencyKey) {
      throw new Error("Idempotency-Key is required");
    }
    const idemKey = `social_red_packet_create:${merchantId}:${idempotencyKey}`;
    if (db.idempotencyMap.has(idemKey)) {
      return db.idempotencyMap.get(idemKey);
    }

    const amount = toInt(totalAmount, 0);
    const slots = toInt(totalSlots, 0);
    if (amount <= 0 || slots <= 0) {
      throw new Error("totalAmount and totalSlots must be positive");
    }
    if (amount < slots) {
      throw new Error("totalAmount must be >= totalSlots");
    }
    const sender = getUser(merchantId, senderUserId);
    if (Number(sender.wallet.silver || 0) < amount) {
      throw new Error("insufficient silver balance");
    }

    sender.wallet.silver = Number(sender.wallet.silver || 0) - amount;
    const packetId = `packet_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const packet = {
      packetId,
      merchantId,
      senderUserId,
      totalAmount: amount,
      totalSlots: slots,
      remainingAmount: amount,
      remainingSlots: slots,
      claims: [],
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(
        Date.now() + Math.max(1, toInt(expiresInMinutes, 30)) * 60 * 1000
      ).toISOString()
    };
    ensurePacketBucket(merchantId)[packetId] = packet;
    db.save();
    const result = {
      packetId,
      merchantId,
      senderUserId,
      totalAmount: packet.totalAmount,
      totalSlots: packet.totalSlots,
      remainingAmount: packet.remainingAmount,
      remainingSlots: packet.remainingSlots,
      status: packet.status
    };
    db.idempotencyMap.set(idemKey, result);
    return result;
  }

  function claimRedPacket({
    merchantId,
    packetId,
    userId,
    idempotencyKey
  }) {
    if (!idempotencyKey) {
      throw new Error("Idempotency-Key is required");
    }
    const idemKey = `social_red_packet_claim:${merchantId}:${idempotencyKey}`;
    if (db.idempotencyMap.has(idemKey)) {
      return db.idempotencyMap.get(idemKey);
    }

    const packet = ensurePacketBucket(merchantId)[packetId];
    assertEntity(packet, "packet");
    if (packet.status !== "ACTIVE") {
      throw new Error("packet is not active");
    }
    if (new Date(packet.expiresAt).getTime() < Date.now()) {
      packet.status = "EXPIRED";
      db.save();
      throw new Error("packet expired");
    }
    if (packet.claims.some((item) => item.userId === userId)) {
      throw new Error("user already claimed");
    }
    if (packet.remainingSlots <= 0 || packet.remainingAmount <= 0) {
      packet.status = "FINISHED";
      db.save();
      throw new Error("packet finished");
    }

    const user = getUser(merchantId, userId);
    let claimAmount = 0;
    if (packet.remainingSlots === 1) {
      claimAmount = packet.remainingAmount;
    } else {
      const min = 1;
      const max = packet.remainingAmount - (packet.remainingSlots - 1);
      claimAmount = randomInt(min, max);
    }

    user.wallet.silver = Number(user.wallet.silver || 0) + claimAmount;
    packet.remainingAmount -= claimAmount;
    packet.remainingSlots -= 1;
    packet.claims.push({
      userId,
      amount: claimAmount,
      claimedAt: new Date().toISOString()
    });
    if (packet.remainingAmount === 0 || packet.remainingSlots === 0) {
      packet.status = "FINISHED";
    }
    db.save();

    const result = {
      packetId,
      userId,
      claimAmount,
      packetStatus: packet.status,
      remainingAmount: packet.remainingAmount,
      remainingSlots: packet.remainingSlots,
      userBalance: user.wallet.silver
    };
    db.idempotencyMap.set(idemKey, result);
    return result;
  }

  function getRedPacket({ merchantId, packetId }) {
    const packet = ensurePacketBucket(merchantId)[packetId];
    assertEntity(packet, "packet");
    return {
      ...packet
    };
  }

  return {
    transferSilver,
    createRedPacket,
    claimRedPacket,
    getRedPacket
  };
}

module.exports = {
  createSocialService
};
