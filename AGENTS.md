# Repository Guidelines

## Project Structure & Module Organization
This is a monorepo with three runtime apps:
- `MealQuestServer/`: Node.js backend (`src/http`, `src/services`, `src/store`, `test`).
- `MealQuestMerchant/`: React Native merchant app (`App.tsx`, `src/`, `__tests__/`).
- `meal-quest-customer/`: Taro customer app (`src/`, `config/`, `test/`).

Shared automation and references are in `scripts/` and `docs/` (`docs/specs`, `docs/engineering`, `docs/ops`, `docs/qa`).

## Build, Test, and Development Commands
Run from repository root:
- `npm run bootstrap`: install dependencies for all subprojects.
- `npm run lint`: run lint checks repo-wide.
- `npm run typecheck`: run TypeScript checks where configured.
- `npm run test`: run all test suites.
- `npm run check:encoding`: scan changed/untracked text files for encoding issues.
- `npm run check:encoding:staged`: scan staged files (used by pre-commit).
- `npm run verify`: lint + typecheck + tests.
- `npm run verify:ci`: CI-style full verification.

Project examples:
- Server: `cd MealQuestServer && npm start`, `npm test`, `npm run test:smoke`.
- Merchant RN: `cd MealQuestMerchant && npm start`, `npm run android`, `npm run test:regression:ui`.
- Customer Taro: `cd meal-quest-customer && npm run dev:weapp`, `npm run test:e2e`.

## Coding Style & Naming Conventions
- Use 2-space indentation and keep functions small and explicit.
- Keep backend route files thin; business logic belongs in `src/services/*`.
- Use clear naming patterns: `*Service.js`, `*Routes.js`, `*.test.js`, `*.test.tsx`.
- Run lint before opening a PR (`MealQuestMerchant`, `meal-quest-customer`).

## Text Encoding Standard (Required)
- Save all code/docs/config as `UTF-8` (no BOM).
- Do not save files as ANSI/GBK/Latin-1.
- Keep line endings controlled by repo settings (`.editorconfig`, `.gitattributes`).
- If text shows mojibake-like garbage sequences, treat it as encoding corruption and fix before commit.
- Prefer editing tools that explicitly show file encoding and allow manual UTF-8 selection.

## Testing Guidelines
- Server tests use Node's built-in runner (`node --test`) in `MealQuestServer/test`.
- Merchant and customer projects use Jest.
- Add or update regression tests for every user-visible bug fix.
- During development run targeted tests, then run `npm run verify` before pushing.

## Commit & Pull Request Guidelines
- Use Conventional Commit prefixes used in history: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Keep each commit focused on one logical change.
- PRs should include: summary, impacted paths, verification commands, and UI screenshots/videos when relevant.

## Security & Configuration Tips
- Never commit secrets (`.env`, API keys, tokens).
- Keep environment values local per project and update env examples/docs for new keys.
