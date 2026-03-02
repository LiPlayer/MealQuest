# Git Hooks

Install repository hooks once:

```bash
npm run hooks:install
```

Enabled hooks:
- `pre-commit`: runs `node scripts/check-encoding.js --staged`.
