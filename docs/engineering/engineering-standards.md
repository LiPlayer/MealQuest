# MealQuest Engineering Standards

## Repository Structure
- `MealQuestServer`: HTTP/API server and domain services.
- `MealQuestMerchant`: React Native merchant app.
- `meal-quest-customer`: Taro customer app.
- `scripts`: repository-level automation.

## Single Entry Commands
Run from repository root:
- `npm run bootstrap`: install dependencies in all projects.
- `npm run lint`: run full repository lint checks for each project.
- `npm run typecheck`: run full TypeScript checks for merchant and customer projects.
- `npm run test`: run all test suites.
- `npm run verify`: lint + typecheck + tests.
- `npm run verify:ci`: fresh install + lint + typecheck + tests.

## Cross-Platform Automation
- Linux/macOS: `./scripts/verify-all.sh`
- Windows: `./scripts/verify-all.ps1`

Both wrappers call `scripts/repo-task.js` to guarantee identical behavior.

## Server HTTP Layer Boundaries
- Dispatcher: `MealQuestServer/src/http/createHttpRequestHandler.js`
- Route domains: `MealQuestServer/src/http/routes/*.js`
- Shared helpers: `MealQuestServer/src/http/serverHelpers.js`

## Quality Gate Policy
A change is release-ready only if all are green:
1. `npm run verify` (repo root)
2. No failing CI jobs in `.github/workflows/ci.yml`
3. No temporary debug code, TODO stubs, or dead routes in changed modules
