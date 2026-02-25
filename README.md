# MealQuest Monorepo

MealQuest contains three applications in one repository:
- `MealQuestServer` (Node.js API/backend)
- `MealQuestMerchant` (React Native merchant app)
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

Optional (recommended once per clone):
- `npm run hooks:install` to enable `.githooks/pre-commit`.

## Docs
All project documentation is under `docs/`:
- `docs/specs/` product and technical specs
- `docs/engineering/` engineering standards
- `docs/ops/` operational runbook
- `docs/qa/` validation and test guide
- `docs/archive/` legacy documents

See `docs/README.md` for the full index.
