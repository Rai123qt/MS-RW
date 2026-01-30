# Troubleshooting

## What it does
Quick fixes for common problems.

## How to use
- If a run fails, rerun with `npm start` after closing all browser windows.
- If builds fail, delete `node_modules` and `dist`, then run `npm install` followed by `npm run build`.
- Ensure `DISCORD_WEBHOOK_URL` is set if you expect alerts.
- Check that `accounts.jsonc` has valid emails and passwords.

## Example
```bash
npx rimraf node_modules dist
npm install
npm run build
npm start
```

---
**[← Back to Documentation](index.md)**
