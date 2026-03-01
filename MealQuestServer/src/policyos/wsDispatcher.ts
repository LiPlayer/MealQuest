const { ensurePolicyOsState } = require("./state");

function createWsDispatcher({ db, wsHub, now = () => Date.now() }) {
  const queues = new Map();

  function enqueue(merchantId, runner) {
    const key = String(merchantId || "");
    const previous = queues.get(key) || Promise.resolve();
    const current = previous.then(runner, runner);
    queues.set(
      key,
      current.finally(() => {
        if (queues.get(key) === current) {
          queues.delete(key);
        }
      })
    );
    return current;
  }

  async function dispatch({
    merchantId,
    event,
    payload,
    messageId = ""
  }) {
    return enqueue(merchantId, async () => {
      const state = ensurePolicyOsState(db);
      const dedupeMap = state.dispatcher.dedupe;
      const dedupeKey = messageId ? `${merchantId}|${messageId}` : "";
      if (dedupeKey && dedupeMap[dedupeKey]) {
        return {
          duplicated: true,
          sequence: dedupeMap[dedupeKey].sequence
        };
      }
      const currentSeq = Number(state.dispatcher.sequenceByMerchant[merchantId] || 0);
      const sequence = currentSeq + 1;
      state.dispatcher.sequenceByMerchant[merchantId] = sequence;
      if (dedupeKey) {
        dedupeMap[dedupeKey] = {
          sequence,
          createdAt: new Date(now()).toISOString()
        };
      }
      if (wsHub && typeof wsHub.broadcast === "function") {
        wsHub.broadcast(merchantId, event, {
          sequence,
          ...payload
        });
      }
      db.save();
      return {
        duplicated: false,
        sequence
      };
    });
  }

  return {
    dispatch
  };
}

module.exports = {
  createWsDispatcher
};
