# Budget Tracker MCP server

Lets Claude (Claude Code, or any MCP client) read your budget and update bills,
buffers and bills-account settings directly in Firestore — the same data the
app shows, with the same maths (`src/lib`).

## Tools

| Tool | What it does |
| --- | --- |
| `list_budgets` | Budgets in the project |
| `get_budget` | Everything in a budget, plus the Bills-tab numbers (required today, surplus, transfers, each bill's next due date and amount set aside) |
| `update_items` | Change one or more expenses/savings in one save |
| `add_item` / `remove_item` | Add or delete an expense/saving |
| `mark_paid` | Record a bill as paid (moves a manual bill to its next due date) |
| `update_bills_account` | Balance, credit card owing, split method, per-person transfer options |
| `set_buffer` | Add, change or remove a buffer |
| `import_statement` | Import an ING or Qantas CSV from this computer (re-importing skips duplicates; `dryRun` previews) |
| `list_transactions` | Search imported transactions |
| `review_queue` | Payees that still need a category, biggest first |
| `categorise_transactions` | Set category/kind by ids or payee; `remember` saves a rule |
| `add_rule` / `remove_rule` / `list_rules` | Manage categorisation rules |
| `set_account` | Account name, type, number (so transfers pair) and card repayment text |
| `spending_summary` | Spending by category and income for a date range |
| `bills_audit` | Bills vs bank data: matches, changes, new regular payments, bills-account flows |
| `get_wealth` / `get_projection` | Net worth, loans, plans; projection with payoff dates and shortfalls |
| `set_home_value` / `set_loan` / `set_assumptions` | Wealth inputs |
| `add_plan_event` / `update_plan_event` / `remove_plan_event` | Planned life events |

Every change is a Firestore transaction, so it won't overwrite something saved
in the app at the same moment.

## Whose budgets

The server's login can see every user in the project, so it only works with
budgets **you** are a member of. Tell it who you are, either with
`BUDGET_USER_EMAIL` or a gitignored `mcp/config.local.json`:

```json
{ "userEmail": "you@example.com", "budget": "Our Budget" }
```

`budget` (or `BUDGET_ID`) picks the default budget when you have several.

## Quickest: on your own computer (no key needed)

1. Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) and run
   `gcloud auth application-default login` with the Google account that owns the
   Firebase project.
2. In this repo, start Claude Code (`claude`) and approve the `budget-tracker`
   MCP server when asked. It uses that login and the project in `.firebaserc`.

## Setup for cloud sessions

1. **Create a service account key** (Google Cloud console, project `budget-tracker-7fad5`):
   IAM & Admin → Service accounts → Create service account → give it the role
   **Cloud Datastore User** (Firestore read/write only) → Keys → Add key → JSON.
   (Firebase console → Project settings → Service accounts → "Generate new private
   key" also works, but that key can do *everything* in the project.)
2. **Give it to the environment** as `FIREBASE_SERVICE_ACCOUNT`: paste the JSON
   (on one line) or its base64 (`base64 -w0 key.json`). Optionally set
   `BUDGET_ID` if you have more than one budget.
3. **Network**: the environment must allow `firestore.googleapis.com` and
   `oauth2.googleapis.com`.
4. Start a new Claude Code session in this repo. `.mcp.json` registers the
   server; `start.mjs` installs its dependencies on first run.

Anyone with the key can read and change the budget, so keep it out of the repo
and delete the key in Google Cloud if it's ever exposed.

## Running it yourself

```bash
cd mcp
npm ci
FIREBASE_SERVICE_ACCOUNT="$(cat key.json)" node server.js   # speaks MCP over stdio
npm test                                                     # data-rule tests (no Firebase needed)
```
