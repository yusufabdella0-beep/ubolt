# Branch Performance Dashboard

A static, no-build web dashboard for tracking branch performance against target:
deposits, loans, new customers and digital users, by region, branch and period.

## Features

- KPI cards with target, achievement % and growth vs the previous period
- Filters: region, branch, period (year to date, last 3 months, all, or one month), metric, search
- Charts: actual vs target by branch, monthly trend, achievement by region, performance bands
- Top/bottom 5 performers and a sortable ranking table
- Branch detail panel (click any row) with monthly achievement per metric
- Import your own data from CSV, export the current ranking to CSV
- Light and dark mode, works on phones

## Run locally

```bash
cd public && python3 -m http.server 8080
# open http://localhost:8080
```

## Your data

`public/data/sample-data.js` holds generated sample data. Replace it, or use
**Import CSV** in the app. The CSV needs one row per branch per month:

```
month,code,name,region,deposits,deposits_target,loans,loans_target,customers,customers_target,digital,digital_target
2026-01,BR001,Bole,Central,395000000,400000000,240000000,245000000,700,704,1200,1188
```

Deposits and loans are month-end balances (a period shows its last month);
customers and digital users are monthly counts (a period shows the sum).
Currency and title are set in `APP_CONFIG` at the top of `sample-data.js`.

## Deploy to Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # pick or create your Firebase project
firebase deploy --only hosting
```

### Automatic deploys

`.github/workflows/firebase-deploy.yml` deploys `public/` to the Firebase
project `eaad-4ac74` on every push to `main` (or run it by hand from the
Actions tab). It needs a repository secret named `FIREBASE_SERVICE_ACCOUNT`
holding a service-account JSON key from Firebase console → Project settings →
Service accounts → Generate new private key.
