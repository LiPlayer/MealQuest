function createPluginRegistry() {
  const buckets = {
    trigger: new Map(),
    segment: new Map(),
    constraint: new Map(),
    scorer: new Map(),
    action: new Map()
  };

  function register(type, name, plugin) {
    const bucket = buckets[type];
    if (!bucket) {
      throw new Error(`unsupported plugin type: ${type}`);
    }
    if (!name || typeof name !== "string") {
      throw new Error("plugin name is required");
    }
    if (!plugin || typeof plugin !== "object") {
      throw new Error("plugin must be an object");
    }
    bucket.set(name, plugin);
  }

  function get(type, name) {
    const bucket = buckets[type];
    if (!bucket) {
      return null;
    }
    return bucket.get(name) || null;
  }

  function list(type) {
    const bucket = buckets[type];
    if (!bucket) {
      return [];
    }
    return Array.from(bucket.keys());
  }

  return {
    register,
    get,
    list
  };
}

module.exports = {
  createPluginRegistry
};
