# Scripts Catalog (Minimal)

This directory is intentionally minimal at root level.

## Retained scripts

- `repo-task.js`: monorepo bootstrap/lint/typecheck/test orchestration.
- `check-encoding.js`: UTF-8 encoding guard for changed/staged files.

## Notes

- Runtime/startup scripts are no longer provided at root `scripts/`.
- Start each app directly from its project directory:
  - `MealQuestServer`: `npm start`
  - `MealQuestMerchant`: `npm run dev:android` / `npm run dev:ios`
  - `meal-quest-customer`: `npm run dev:weapp`
