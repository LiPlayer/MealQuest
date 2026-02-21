const test = require("node:test");
const assert = require("node:assert/strict");

const { runTcaEngine } = require("../src/core/tcaEngine");

test("tca engine executes matched campaign with valid budget", () => {
  const campaigns = [
    {
      id: "c1",
      status: "ACTIVE",
      priority: 10,
      trigger: { event: "WEATHER_CHANGE" },
      conditions: [{ field: "weather", op: "eq", value: "RAIN" }],
      budget: { used: 0, cap: 100, costPerHit: 15 },
      action: {
        type: "STORY_CARD",
        story: {
          templateId: "rain_tpl",
          narrative: "下雨天热汤券掉落",
          assets: [{ id: "hot_soup" }],
          triggers: ["tap_claim"]
        }
      }
    }
  ];

  const result = runTcaEngine({
    campaigns,
    event: "WEATHER_CHANGE",
    context: { weather: "RAIN" }
  });

  assert.deepEqual(result.executed, ["c1"]);
  assert.equal(result.storyCards.length, 1);
  assert.equal(campaigns[0].budget.used, 15);
});

test("tca engine blocks all actions when kill switch is enabled", () => {
  const campaigns = [
    {
      id: "c1",
      status: "ACTIVE",
      priority: 10,
      trigger: { event: "ANY_EVENT" },
      conditions: [],
      budget: { used: 0, cap: 100, costPerHit: 15 },
      action: {
        type: "STORY_CARD",
        story: {
          templateId: "tpl",
          narrative: "blocked",
          assets: [],
          triggers: []
        }
      }
    }
  ];

  const result = runTcaEngine({
    campaigns,
    event: "ANY_EVENT",
    context: {},
    killSwitchEnabled: true
  });

  assert.equal(result.blockedByKillSwitch, true);
  assert.deepEqual(result.executed, []);
});
