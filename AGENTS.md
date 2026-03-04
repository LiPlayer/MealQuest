# MealQuest Agent Rules (Simplified)

## 1) Source Of Truth (Required)
- `docs/specs/mealquest-spec.md` and `docs/roadmap.md` are the **only source of truth**.
- Requirement decisions must come from these two files only.
- Any code/doc change that affects behavior must sync these two files in the same pass.

## 2) Repo Layout
- `MealQuestServer/`: Node backend (`src/http`, `src/services`, `src/store`, `test`)
- `MealQuestMerchant/`: Expo merchant app (`app/`, `src/`)
- `meal-quest-customer/`: Taro customer app (`src/`, `config/`, `test`)
- Shared docs: `docs/`

## 3) Core Commands
- Root: `npm run bootstrap`, `npm run verify`, `npm run verify:ci`, `npm run check:encoding`
- Server: `cd MealQuestServer && npm start && npm test`
- Merchant: `cd MealQuestMerchant && npm run lint && npm run typecheck`
- Customer: `cd meal-quest-customer && npm run typecheck && npm test`

## 4) Engineering Rules
- Use 2-space indentation.
- Keep route files thin; put business logic in `src/services/*`.
- Naming: `*Service.js`, `*Routes.js`, `*.test.js`, `*.test.tsx`.
- Save all text/code/docs as UTF-8 (no BOM).

## 5) Quality Gate
- Run targeted checks during development.
- Run `npm run verify` before merge.
- Add/update regression tests for user-visible fixes.

## 6) Commit / PR
- Use Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Keep each commit focused on one logical change.
- PR should include: summary, impacted paths, verification commands, and screenshots/videos when relevant.

## 7) Security
- Never commit secrets (`.env`, API keys, tokens).
- Keep env values local and update examples/docs when needed.
