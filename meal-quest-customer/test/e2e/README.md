# E2E Automation for MealQuest (Mini Program)

This directory contains end-to-end test scripts powered by **miniprogram-automator**.

## Prerequisites
1. **WeChat DevTools** must be installed.
2. **Service Port** must be enabled in DevTools:
   - Open DevTools -> Settings -> Security -> Enable Service Port (开启服务端口).
3. **Build the Mini Program**:
   - Run `npm run dev:weapp` to ensure `dist/` is ready.

## Running Tests
Tests are executed using Jest.

```bash
# Install automator (if not already)
npm install miniprogram-automator --save-dev

# Run specific E2E test
npx jest test/e2e/flow.spec.js
```

## Structure
- `flow.spec.js`: Critical business path (Scan -> Home -> Pay).
