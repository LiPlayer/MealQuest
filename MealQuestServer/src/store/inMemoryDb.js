function createIdGenerator(prefix) {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}_${Date.now()}_${counter}`;
  };
}

function createInMemoryDb() {
  const nextLedgerId = createIdGenerator("txn");

  const db = {
    merchants: {
      m_demo: {
        merchantId: "m_demo",
        name: "探味轩",
        killSwitchEnabled: false,
        budgetCap: 300,
        budgetUsed: 0,
        staff: [{ uid: "staff_owner", role: "OWNER" }]
      }
    },
    users: {
      u_demo: {
        uid: "u_demo",
        displayName: "常客阿青",
        wallet: {
          principal: 120,
          bonus: 36,
          silver: 88
        },
        tags: ["周二常客", "嗜辣狂魔"],
        fragments: {
          spicy: 2,
          noodle: 3
        },
        vouchers: [
          {
            id: "voucher_soon",
            type: "ITEM_WARRANT",
            name: "葱油拌面券",
            value: 18,
            minSpend: 0,
            status: "ACTIVE",
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
          },
          {
            id: "voucher_big",
            type: "NO_THRESHOLD_VOUCHER",
            name: "无门槛红包",
            value: 30,
            minSpend: 20,
            status: "ACTIVE",
            expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
          }
        ]
      }
    },
    payments: {},
    ledger: [],
    campaigns: [
      {
        id: "campaign_welcome",
        merchantId: "m_demo",
        name: "新人见面礼",
        status: "ACTIVE",
        priority: 20,
        trigger: { event: "USER_ENTER_SHOP" },
        conditions: [{ field: "isNewUser", op: "eq", value: true }],
        budget: {
          used: 0,
          cap: 80,
          costPerHit: 8
        },
        action: {
          type: "STORY_CARD",
          story: {
            templateId: "tpl_welcome",
            narrative: "欢迎入席，先收下一份口福红包。",
            assets: [{ kind: "voucher", id: "voucher_welcome_noodle" }],
            triggers: ["tap_claim"]
          }
        }
      }
    ],
    proposals: [
      {
        id: "proposal_rainy",
        merchantId: "m_demo",
        status: "PENDING",
        title: "暴雨急售策略",
        createdAt: new Date().toISOString(),
        suggestedCampaign: {
          id: "campaign_rainy_hot_soup",
          merchantId: "m_demo",
          name: "雨天热汤投放",
          status: "ACTIVE",
          priority: 90,
          trigger: { event: "WEATHER_CHANGE" },
          conditions: [{ field: "weather", op: "eq", value: "RAIN" }],
          budget: {
            used: 0,
            cap: 60,
            costPerHit: 12
          },
          action: {
            type: "STORY_CARD",
            story: {
              templateId: "tpl_rain",
              narrative: "下雨天来一碗热汤，暖胃也暖心。",
              assets: [{ kind: "voucher", id: "voucher_hot_soup" }],
              triggers: ["tap_pay"]
            }
          },
          ttlUntil: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
        }
      }
    ],
    idempotencyMap: new Map(),
    nextLedgerId
  };

  return db;
}

module.exports = {
  createInMemoryDb
};
