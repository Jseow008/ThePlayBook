# Bundle Budgets

Status: Active.

Machine-readable budgets live in `docs/performance/bundle-budgets.json`. The local checker reads the latest Next build output and compares the tracked routes against that file.

## Tracked Routes

| Route | Metric | Baseline | Warn At | Fail At |
|---|---:|---:|---:|---:|
| `/` | client-reference JS bytes | 1.42 MiB | 1.56 MiB | 1.70 MiB |
| `/browse` | client-reference JS bytes | 1.46 MiB | 1.60 MiB | 1.75 MiB |
| `/read/[id]` | client-reference JS bytes | 1.99 MiB | 2.19 MiB | 2.39 MiB |
| `/notes` | client-reference JS bytes | 1.85 MiB | 2.03 MiB | 2.22 MiB |
| `/focus` | client-reference JS bytes | 1.51 MiB | 1.66 MiB | 1.81 MiB |

## Threshold Policy

- Warning threshold: baseline + 10%.
- Failure/review threshold: baseline + 20%.
- Unexpected shared chunk growth should be reviewed even when individual route budgets still pass.
- Route totals include shared client chunks, so a global provider or shared vendor increase may raise every tracked route at once.

## Commands

```bash
npm run analyze:ci
npm run check:bundle-budgets
```

To refresh the baseline after an intentional bundle change:

```bash
npm run analyze:ci
node scripts/check-bundle-budgets.mjs --write-baseline
```

Commit only the updated JSON and markdown summary. Do not commit analyzer HTML output.
