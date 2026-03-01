function assertStoryPayload(story) {
  if (!story || typeof story !== "object") {
    throw new Error("Story JSON must be an object");
  }

  const requiredKeys = ["templateId", "narrative", "assets", "triggers"];
  for (const key of requiredKeys) {
    if (!(key in story)) {
      throw new Error(`Story JSON missing required key: ${key}`);
    }
  }

  if (!Array.isArray(story.assets)) {
    throw new Error("Story JSON assets must be an array");
  }

  if (!Array.isArray(story.triggers)) {
    throw new Error("Story JSON triggers must be an array");
  }
}

module.exports = {
  assertStoryPayload
};
