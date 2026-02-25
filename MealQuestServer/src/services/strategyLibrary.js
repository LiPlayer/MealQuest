const STRATEGY_TEMPLATES = [
  {
    templateId: "acquisition_welcome_gift",
    category: "ACQUISITION",
    phase: "P1",
    name: "新人见面礼",
    description: "用户首次进店绑定时发放欢迎资产",
    triggerEvent: "USER_ENTER_SHOP",
    defaultBranchId: "DEFAULT",
    branches: [
      {
        branchId: "DEFAULT",
        name: "默认奖励",
        description: "自然进店触发标准欢迎礼",
        campaign: {
          priority: 70,
          conditions: [
            { field: "isNewUser", op: "eq", value: true },
            { field: "hasReferral", op: "eq", value: false }
          ],
          budget: { cap: 120, used: 0, costPerHit: 6 },
          action: {
            type: "GRANT_VOUCHER",
            voucher: {
              type: "ITEM_WARRANT",
              name: "新人葱油拌面券",
              value: 18,
              minSpend: 0
            }
          }
        }
      },
      {
        branchId: "CHANNEL",
        name: "渠道奖励",
        description: "通过邀请或分享渠道进店时发放渠道礼",
        campaign: {
          priority: 72,
          conditions: [
            { field: "isNewUser", op: "eq", value: true },
            { field: "hasReferral", op: "eq", value: true }
          ],
          budget: { cap: 140, used: 0, costPerHit: 8 },
          action: {
            type: "GRANT_VOUCHER",
            voucher: {
              type: "NO_THRESHOLD_VOUCHER",
              name: "新人渠道红包",
              value: 10,
              minSpend: 20
            }
          }
        }
      }
    ]
  },
  {
    templateId: "acquisition_first_buy",
    category: "ACQUISITION",
    phase: "P1",
    name: "首单破冰",
    description: "针对首单用户降低支付门槛或提供后返",
    triggerEvent: "PAYMENT_PRECHECK",
    defaultBranchId: "DIRECT_DEDUCTION",
    branches: [
      {
        branchId: "DIRECT_DEDUCTION",
        name: "本单立减",
        description: "支付前直接减免",
        campaign: {
          priority: 75,
          conditions: [
            { field: "orderCount", op: "eq", value: 0 },
            { field: "orderAmount", op: "gte", value: 20 }
          ],
          budget: { cap: 180, used: 0, costPerHit: 5 },
          action: {
            type: "GRANT_VOUCHER",
            voucher: {
              type: "NO_THRESHOLD_VOUCHER",
              name: "首单立减券",
              value: 5,
              minSpend: 20
            }
          }
        }
      },
      {
        branchId: "BALANCE_CASHBACK",
        name: "全额返金库",
        description: "支付后返至聚宝金库",
        campaign: {
          trigger: { event: "PAYMENT_SUCCESS" },
          priority: 74,
          conditions: [
            { field: "orderCount", op: "eq", value: 0 },
            { field: "orderAmount", op: "gte", value: 20 }
          ],
          budget: { cap: 220, used: 0, costPerHit: 8 },
          action: {
            type: "GRANT_BONUS",
            amount: 12
          }
        }
      }
    ]
  },
  {
    templateId: "acquisition_referral",
    category: "ACQUISITION",
    phase: "P1",
    name: "面对面邀请",
    description: "邀请裂变奖励",
    triggerEvent: "REFERRAL_SCAN",
    defaultBranchId: "LOW_BARRIER",
    branches: [
      {
        branchId: "LOW_BARRIER",
        name: "低门槛",
        description: "扫码即得软通货奖励",
        campaign: {
          priority: 68,
          conditions: [{ field: "isReferral", op: "eq", value: true }],
          budget: { cap: 90, used: 0, costPerHit: 2 },
          action: {
            type: "GRANT_SILVER",
            amount: 30
          }
        }
      },
      {
        branchId: "VALUE_DRIVEN",
        name: "高价值",
        description: "首单后发放高价值资产",
        campaign: {
          trigger: { event: "REFERRAL_FIRST_BUY" },
          priority: 76,
          conditions: [{ field: "isReferral", op: "eq", value: true }],
          budget: { cap: 160, used: 0, costPerHit: 10 },
          action: {
            type: "GRANT_VOUCHER",
            voucher: {
              type: "DISCOUNT_CARD",
              name: "邀请高价值折扣卡",
              value: 0,
              discountRate: 0.88,
              minSpend: 30
            }
          }
        }
      }
    ]
  },
  {
    templateId: "acquisition_cross_promo",
    category: "ACQUISITION",
    phase: "P1",
    name: "异业联盟",
    description: "跨商家导流与消费互认",
    triggerEvent: "PARTNER_ORDER_VERIFIED",
    defaultBranchId: "TRAFFIC",
    branches: [
      {
        branchId: "TRAFFIC",
        name: "流量互导",
        description: "验证通过后发放寻味碎银",
        campaign: {
          priority: 64,
          conditions: [
            { field: "partnerOrderVerified", op: "eq", value: true }
          ],
          budget: { cap: 70, used: 0, costPerHit: 2 },
          action: {
            type: "GRANT_SILVER",
            amount: 25
          }
        }
      },
      {
        branchId: "CONSUMPTION_RECIPROCITY",
        name: "消费互认",
        description: "对方真实交易后发放高价值资产",
        campaign: {
          priority: 78,
          conditions: [
            { field: "partnerOrderVerified", op: "eq", value: true },
            { field: "partnerOrderAmount", op: "gte", value: 30 }
          ],
          budget: { cap: 180, used: 0, costPerHit: 12 },
          action: {
            type: "GRANT_VOUCHER",
            voucher: {
              type: "ITEM_WARRANT",
              name: "联盟高价值菜品券",
              value: 28,
              minSpend: 0
            }
          }
        }
      }
    ]
  },
  {
    templateId: "activation_member_day",
    category: "ACTIVATION",
    phase: "P1",
    name: "周期会员日",
    description: "固定周期提升活跃",
    triggerEvent: "MEMBER_DAY",
    defaultBranchId: "ASSET_BOOM",
    branches: [
      {
        branchId: "ASSET_BOOM",
        name: "资产翻倍",
        description: "会员日软通货加倍掉落",
        campaign: {
          priority: 60,
          conditions: [{ field: "isMemberDay", op: "eq", value: true }],
          budget: { cap: 60, used: 0, costPerHit: 1 },
          action: {
            type: "GRANT_SILVER",
            amount: 60
          }
        }
      },
      {
        branchId: "DISCOUNT_DAY",
        name: "全场折扣",
        description: "会员日发放折扣卡",
        campaign: {
          priority: 73,
          conditions: [{ field: "isMemberDay", op: "eq", value: true }],
          budget: { cap: 260, used: 0, costPerHit: 14 },
          action: {
            type: "GRANT_VOUCHER",
            voucher: {
              type: "DISCOUNT_CARD",
              name: "会员日88折卡",
              value: 0,
              discountRate: 0.88,
              minSpend: 20
            }
          }
        }
      }
    ]
  },
  {
    templateId: "activation_walk_to_earn",
    category: "ACTIVATION",
    phase: "P1",
    name: "步数换钱",
    description: "步数兑换与步数盲盒",
    triggerEvent: "STEP_SYNC",
    defaultBranchId: "EXCHANGE",
    branches: [
      {
        branchId: "EXCHANGE",
        name: "稳定兑换",
        description: "步数按汇率兑换碎银",
        campaign: {
          priority: 55,
          conditions: [{ field: "steps", op: "gte", value: 1000 }],
          budget: { cap: 40, used: 0, costPerHit: 1 },
          action: {
            type: "GRANT_SILVER",
            amount: 10
          }
        }
      },
      {
        branchId: "LOTTO",
        name: "步数夺宝",
        description: "盲盒概率奖励",
        campaign: {
          priority: 69,
          conditions: [{ field: "steps", op: "gte", value: 3000 }],
          budget: { cap: 120, used: 0, costPerHit: 4 },
          action: {
            type: "GRANT_SILVER",
            amount: 80
          }
        }
      }
    ]
  },
  {
    templateId: "activation_contextual_drop",
    category: "ACTIVATION",
    phase: "P1",
    name: "环境关怀",
    description: "天气与温度触发动态投放",
    triggerEvent: "APP_OPEN",
    defaultBranchId: "COMFORT",
    branches: [
      {
        branchId: "COMFORT",
        name: "雨天慰藉",
        description: "雨天/降温投放热食券",
        campaign: {
          priority: 90,
          conditions: [
            { field: "weather", op: "eq", value: "RAIN" }
          ],
          budget: { cap: 120, used: 0, costPerHit: 12 },
          action: {
            type: "STORY_CARD",
            story: {
              templateId: "tpl_context_rain",
              narrative: "雨天来碗热汤，给你一点暖意。",
              assets: [{ kind: "voucher", id: "voucher_hot_soup" }],
              triggers: ["tap_pay"]
            }
          },
          ttlHours: 2
        }
      },
      {
        branchId: "COOLING",
        name: "高温清凉",
        description: "高温天气投放冰饮券",
        campaign: {
          priority: 86,
          conditions: [{ field: "temperature", op: "gte", value: 32 }],
          budget: { cap: 120, used: 0, costPerHit: 10 },
          action: {
            type: "GRANT_VOUCHER",
            voucher: {
              type: "ITEM_WARRANT",
              name: "高温清凉冰饮券",
              value: 16,
              minSpend: 0
            }
          },
          ttlHours: 2
        }
      }
    ]
  },
  {
    templateId: "activation_streak_bonus",
    category: "ACTIVATION",
    phase: "P1",
    name: "连续打卡",
    description: "累计或连续签到激励",
    triggerEvent: "DAILY_CHECKIN",
    defaultBranchId: "CUMULATIVE",
    branches: [
      {
        branchId: "CUMULATIVE",
        name: "累计签到",
        description: "周期内达到次数即发奖",
        campaign: {
          priority: 58,
          conditions: [{ field: "checkinCountInWindow", op: "gte", value: 5 }],
          budget: { cap: 70, used: 0, costPerHit: 3 },
          action: {
            type: "GRANT_SILVER",
            amount: 50
          }
        }
      },
      {
        branchId: "CHALLENGE",
        name: "连签挑战",
        description: "连续满天数发放稀有资产",
        campaign: {
          priority: 70,
          conditions: [{ field: "streakDays", op: "gte", value: 7 }],
          budget: { cap: 130, used: 0, costPerHit: 9 },
          action: {
            type: "GRANT_VOUCHER",
            voucher: {
              type: "ITEM_WARRANT",
              name: "连签稀有口福券",
              value: 22,
              minSpend: 0
            }
          }
        }
      }
    ]
  },
  {
    templateId: "revenue_recharge_bonus",
    category: "REVENUE",
    phase: "P1",
    name: "充值有礼",
    description: "提升预存资金",
    triggerEvent: "RECHARGE",
    defaultBranchId: "TIERED_CASHBACK",
    branches: [
      {
        branchId: "TIERED_CASHBACK",
        name: "阶梯返现",
        description: "按充值档位发放赠送金",
        campaign: {
          priority: 62,
          conditions: [{ field: "rechargeAmount", op: "gte", value: 100 }],
          budget: { cap: 320, used: 0, costPerHit: 20 },
          action: {
            type: "GRANT_BONUS",
            amount: 10
          }
        }
      },
      {
        branchId: "ASSET_BUNDLE",
        name: "资产礼包",
        description: "充值赠送稀有资产包",
        campaign: {
          priority: 66,
          conditions: [{ field: "rechargeAmount", op: "gte", value: 100 }],
          budget: { cap: 260, used: 0, costPerHit: 16 },
          action: {
            type: "GRANT_VOUCHER",
            voucher: {
              type: "ITEM_WARRANT",
              name: "充值稀有碎片包",
              value: 20,
              minSpend: 0
            }
          }
        }
      }
    ]
  },
  {
    templateId: "revenue_paybox",
    category: "REVENUE",
    phase: "P1",
    name: "支付盲盒",
    description: "实付满额后支付反馈奖励",
    triggerEvent: "PAYMENT_SUCCESS",
    defaultBranchId: "REBATE",
    branches: [
      {
        branchId: "REBATE",
        name: "保底返利",
        description: "按实付比例返碎银",
        campaign: {
          priority: 57,
          conditions: [{ field: "orderAmount", op: "gte", value: 30 }],
          budget: { cap: 100, used: 0, costPerHit: 2 },
          action: {
            type: "GRANT_SILVER",
            amount: 20
          }
        }
      },
      {
        branchId: "JACKPOT",
        name: "彩蛋免单",
        description: "低概率高额奖励",
        campaign: {
          priority: 71,
          conditions: [{ field: "orderAmount", op: "gte", value: 30 }],
          budget: { cap: 240, used: 0, costPerHit: 15 },
          action: {
            type: "GRANT_BONUS",
            amount: 30
          }
        }
      }
    ]
  },
  {
    templateId: "revenue_dynamic_drop",
    category: "REVENUE",
    phase: "P1",
    name: "AI 暴击掉落",
    description: "针对积压 SKU 的动态去库存",
    triggerEvent: "INVENTORY_ALERT",
    defaultBranchId: "TARGETED_DROP",
    branches: [
      {
        branchId: "TARGETED_DROP",
        name: "定向掉落",
        description: "提升目标 SKU 对应资产掉率",
        campaign: {
          priority: 92,
          conditions: [
            { field: "targetSku", op: "eq", value: "sku_hot_soup" },
            { field: "inventoryBacklog", op: "gte", value: 10 }
          ],
          budget: { cap: 150, used: 0, costPerHit: 8 },
          action: {
            type: "GRANT_VOUCHER",
            voucher: {
              type: "ITEM_WARRANT",
              name: "库存定向菜品券",
              value: 14,
              minSpend: 0
            }
          },
          ttlHours: 1
        }
      },
      {
        branchId: "BUNDLE_BINDING",
        name: "关联捆绑",
        description: "主食消费绑定目标 SKU 半价券",
        campaign: {
          priority: 93,
          conditions: [
            { field: "targetSku", op: "eq", value: "sku_hot_soup" },
            { field: "inventoryBacklog", op: "gte", value: 10 }
          ],
          budget: { cap: 200, used: 0, costPerHit: 9 },
          action: {
            type: "GRANT_VOUCHER",
            voucher: {
              type: "DISCOUNT_CARD",
              name: "目标 SKU 半价券",
              value: 0,
              discountRate: 0.5,
              minSpend: 20
            }
          },
          ttlHours: 1
        }
      }
    ]
  },
  {
    templateId: "retention_birthday_gift",
    category: "RETENTION",
    phase: "P1",
    name: "生日关怀",
    description: "生日礼遇与会员权益提升",
    triggerEvent: "BIRTHDAY",
    defaultBranchId: "ASSET_GIFT",
    branches: [
      {
        branchId: "ASSET_GIFT",
        name: "资产礼包",
        description: "生日当天发放生日券",
        campaign: {
          priority: 65,
          conditions: [{ field: "isBirthday", op: "eq", value: true }],
          budget: { cap: 140, used: 0, costPerHit: 8 },
          action: {
            type: "GRANT_VOUCHER",
            voucher: {
              type: "ITEM_WARRANT",
              name: "生日长寿面券",
              value: 20,
              minSpend: 0
            }
          }
        }
      },
      {
        branchId: "PRIVILEGE_UPGRADE",
        name: "权益升级",
        description: "生日月权益升级",
        campaign: {
          priority: 67,
          conditions: [{ field: "isBirthdayMonth", op: "eq", value: true }],
          budget: { cap: 180, used: 0, costPerHit: 10 },
          action: {
            type: "GRANT_VOUCHER",
            voucher: {
              type: "DISCOUNT_CARD",
              name: "生日月权益折扣卡",
              value: 0,
              discountRate: 0.85,
              minSpend: 0
            }
          }
        }
      }
    ]
  },
  {
    templateId: "retention_recall_injection",
    category: "RETENTION",
    phase: "P1",
    name: "沉默唤醒",
    description: "针对沉默用户定向召回",
    triggerEvent: "USER_INACTIVE",
    defaultBranchId: "LOSS_AVERSION",
    branches: [
      {
        branchId: "LOSS_AVERSION",
        name: "损失厌恶",
        description: "提醒即将过期资源",
        campaign: {
          priority: 61,
          conditions: [{ field: "inactiveDays", op: "gte", value: 30 }],
          budget: { cap: 60, used: 0, costPerHit: 1 },
          action: {
            type: "STORY_CARD",
            story: {
              templateId: "tpl_recall_notice",
              narrative: "你的碎银快过期了，回来看看吧。",
              assets: [],
              triggers: ["tap_open"]
            }
          }
        }
      },
      {
        branchId: "FREE_GRANT",
        name: "无偿赠予",
        description: "高价值沉默用户直接发放无门槛券",
        campaign: {
          priority: 77,
          conditions: [
            { field: "inactiveDays", op: "gte", value: 30 },
            { field: "isHighValueUser", op: "eq", value: true }
          ],
          budget: { cap: 220, used: 0, costPerHit: 16 },
          action: {
            type: "GRANT_VOUCHER",
            voucher: {
              type: "NO_THRESHOLD_VOUCHER",
              name: "召回无门槛红包",
              value: 12,
              minSpend: 0
            }
          }
        }
      }
    ]
  }
];

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObjectLike(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function mergePatch(base, patch) {
  if (!isObjectLike(patch)) {
    return patch === undefined ? deepClone(base) : deepClone(patch);
  }
  const result = isObjectLike(base) ? deepClone(base) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (isObjectLike(value) && isObjectLike(result[key])) {
      result[key] = mergePatch(result[key], value);
    } else {
      result[key] = deepClone(value);
    }
  }
  return result;
}

function toNumberOr(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function sanitizeCampaign(campaignDraft, now = new Date()) {
  const draft = deepClone(campaignDraft);
  const budget = draft.budget || {};
  draft.status = draft.status || "ACTIVE";
  draft.priority = Math.floor(toNumberOr(draft.priority, 50));
  draft.budget = {
    cap: Math.max(0, Math.floor(toNumberOr(budget.cap, 0))),
    used: Math.max(0, Math.floor(toNumberOr(budget.used, 0))),
    costPerHit: Math.max(0, Math.floor(toNumberOr(budget.costPerHit, 0)))
  };
  draft.conditions = Array.isArray(draft.conditions) ? draft.conditions : [];
  draft.trigger = draft.trigger || {};
  if (!draft.trigger.event) {
    throw new Error("trigger event is required");
  }

  if (draft.ttlHours !== undefined) {
    const ttlHours = toNumberOr(draft.ttlHours, 0);
    if (ttlHours > 0) {
      draft.ttlUntil = new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString();
    }
    delete draft.ttlHours;
  }

  if (draft.action && draft.action.type === "GRANT_VOUCHER") {
    draft.action.voucher = draft.action.voucher || {};
    if (!draft.action.voucher.id) {
      draft.action.voucher.id = `voucher_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }
  }

  return draft;
}

function listStrategyTemplates() {
  return STRATEGY_TEMPLATES.map((template) => ({
    templateId: template.templateId,
    category: template.category,
    phase: template.phase,
    name: template.name,
    description: template.description,
    triggerEvent: template.triggerEvent,
    defaultBranchId: template.defaultBranchId,
    branches: template.branches.map((branch) => ({
      branchId: branch.branchId,
      name: branch.name,
      description: branch.description,
      recommendedBudgetCap: branch.campaign.budget.cap,
      recommendedCostPerHit: branch.campaign.budget.costPerHit,
      recommendedPriority: branch.campaign.priority
    }))
  }));
}

function findTemplate(templateId) {
  return STRATEGY_TEMPLATES.find((item) => item.templateId === templateId) || null;
}

function resolveTemplateBranch(template, branchId) {
  const requested = branchId || template.defaultBranchId;
  const branch = template.branches.find((item) => item.branchId === requested);
  if (!branch) {
    throw new Error("strategy branch not found");
  }
  return branch;
}

function createCampaignFromTemplate({
  merchantId,
  templateId,
  branchId,
  overrides = {},
  now = new Date()
}) {
  const template = findTemplate(templateId);
  if (!template) {
    throw new Error("strategy template not found");
  }
  const branch = resolveTemplateBranch(template, branchId);
  const draft = mergePatch(
    {
      merchantId,
      name: `${template.name} - ${branch.name}`,
      trigger: {
        event: template.triggerEvent
      },
      ...branch.campaign
    },
    overrides || {}
  );
  const campaignId =
    draft.id ||
    `campaign_${template.templateId}_${branch.branchId.toLowerCase()}_${Date.now()}`;
  const sanitized = sanitizeCampaign(
    {
      ...draft,
      id: campaignId
    },
    now
  );
  sanitized.strategyMeta = {
    templateId: template.templateId,
    templateName: template.name,
    branchId: branch.branchId,
    branchName: branch.name,
    category: template.category
  };
  return {
    campaign: sanitized,
    template: {
      templateId: template.templateId,
      name: template.name,
      category: template.category,
      phase: template.phase
    },
    branch: {
      branchId: branch.branchId,
      name: branch.name
    }
  };
}

module.exports = {
  createCampaignFromTemplate,
  findTemplate,
  listStrategyTemplates
};
