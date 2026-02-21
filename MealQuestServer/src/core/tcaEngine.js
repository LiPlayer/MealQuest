const { assertStoryPayload } = require("./storyProtocol");

function matchCondition(condition, context) {
  const actual = context[condition.field];
  const expected = condition.value;

  switch (condition.op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gte":
      return Number(actual) >= Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "includes":
      return Array.isArray(actual) && actual.includes(expected);
    default:
      return false;
  }
}

function isCampaignMatch({ campaign, event, context, now }) {
  if (campaign.status !== "ACTIVE") {
    return false;
  }
  if (campaign.trigger?.event !== event) {
    return false;
  }
  if (campaign.ttlUntil && new Date(campaign.ttlUntil).getTime() < now.getTime()) {
    return false;
  }

  const conditions = campaign.conditions ?? [];
  return conditions.every((condition) => matchCondition(condition, context));
}

function runTcaEngine({ campaigns, event, context, now = new Date(), killSwitchEnabled = false }) {
  if (killSwitchEnabled) {
    return {
      executed: [],
      storyCards: [],
      blockedByKillSwitch: true
    };
  }

  const sortedCampaigns = [...campaigns].sort(
    (a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0)
  );

  const executed = [];
  const storyCards = [];

  for (const campaign of sortedCampaigns) {
    if (!isCampaignMatch({ campaign, event, context, now })) {
      continue;
    }

    const budget = campaign.budget ?? { used: 0, cap: Number.MAX_SAFE_INTEGER, costPerHit: 0 };
    const nextUsed = Number(budget.used ?? 0) + Number(budget.costPerHit ?? 0);
    if (nextUsed > Number(budget.cap ?? 0)) {
      continue;
    }

    campaign.budget.used = nextUsed;
    executed.push(campaign.id);

    if (campaign.action?.type === "STORY_CARD") {
      assertStoryPayload(campaign.action.story);
      storyCards.push(campaign.action.story);
    }
  }

  return {
    executed,
    storyCards,
    blockedByKillSwitch: false
  };
}

module.exports = {
  runTcaEngine
};
