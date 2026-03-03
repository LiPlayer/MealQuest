# MealQuest Monorepo

MealQuest contains three applications in one repository:
- `MealQuestServer` (Node.js API/backend)
- `MealQuestMerchant` (Expo merchant app)
- `meal-quest-customer` (Taro customer app)

## Quick Start
From repo root:
```bash
npm run bootstrap
npm run verify
```

Key commands:
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run check:encoding`
- `npm run check:encoding:staged`
- `npm run verify:ci`

App startup (run inside each project):
- Server: `cd MealQuestServer && npm start`
- Merchant: `cd MealQuestMerchant && npm run dev:android` (or `npm run dev:ios`)
- Customer: `cd meal-quest-customer && npm run dev:weapp`

Optional (recommended once per clone):
- `npm run hooks:install` to enable `.githooks/pre-commit`.

Root automation scripts are intentionally minimal:
- `repo-task.js`
- `check-encoding.js`

## Docs
Normative source of truth:
- `docs/specs/mealquest-spec.md`

Implementation snapshot:
- `docs/implemented-features.md`

All previous split docs were removed to support a clean rebuild from one canonical spec.
