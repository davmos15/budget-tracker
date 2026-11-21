# Transactions, Bills Analysis, Wealth & Projections — Design

Date: 2026-11-21
Status: Approved in brainstorming, pending spec review

## Goal

Import real bank/card transaction history into the app and use it to:

1. Know what bills actually cost (fixed vs variable), find new/drifted/cancelled bills, and recommend the Bills-account allocation.
2. Show where money goes by category, per week / fortnight / month / year, against "normal".
3. Track net worth and the mortgage (two loan splits + offset) over time.
4. Project forward month-by-month (36 months) and yearly to mortgage payoff, including planned life events.

Internal transfers and credit-card repayments must never be counted as extra spending.

## Source data (as downloaded 2026-11-21)

| File | Format | Range | Notes |
|---|---|---|---|
| `Spending.csv` | ING: `Date,Description,Credit,Debit,Balance` (DD/MM/YYYY) | 2019-11 → | Salary lands here; outflows are mostly labelled internal transfers |
| `Bills (Offset).csv` | ING | 2019-11 → | Direct debits, CC repayments (Qantas/ANZ/Westpac), Medicare rebates, Smartsalary; offset account |
| `Savings (Loan).csv` | ING (balance negative) | 2022-12 → | Loan split. Redraws carry user notes; they move money into Bills (which pays the card) |
| `Emergency Fund (Loan).csv` | ING (balance negative) | 2022-12 → | Loan split. Redraws (medical, creche…) move money into Bills |
| `QantasCC.csv` | Qantas: `Date,Amount,Account Number,,Transaction Type,Transaction Details,Category,Merchant Name,Processed On` (DD Mon YY) | 2026-05 → | Has bank-supplied category + merchant name |

Observed facts the design relies on:
- Both sides of an ING internal transfer carry the same `Receipt NNNNNN` and the counterpart account number appears in the description (e.g. `Orange Everyday 0011112222`, `Transfer to 923100 33334444`).
- Loan accounts show monthly `Interest Charge` debits and `Repayment` credits.
- Account numbers: Spending = …11112222, Bills = …33334444. Card purchases are paid from Bills; Spending reimburses Bills with labelled transfers ("Coles", "CC last week"), and loan redraws also go into Bills. So redraws and those transfers are **transfers**, never spending — the real spend is the card purchase (or, before card data, the card repayment). Redraw notes are kept as a `label` to show which pot funded what.
- Before 2026-05 there is no itemised card data; card spend appears only as repayments / labelled transfers ("CC Coles petrol shoes coffee").

## Decisions

| Topic | Decision |
|---|---|
| Where data lives | In the app (Firebase), shared by all budget members; also readable/editable via MCP |
| Unknown transactions | In-app "Needs review" queue **and** Claude works the queue via MCP; tagging can create a merchant rule |
| History | Import everything; bill/spending baselines use the trailing 12 months |
| Pre-card-data CC repayments | Count as `Card (unitemised)` spending, category guessed from transfer label where possible; once card data covers a date, repayments are ignored. Low priority to perfect |
| Wealth scope | Home value + mortgage, cash & offset (no super/shares/car for now) |
| Mortgage params | Inferred from data (rate from interest vs balance, repayment from history), user confirms/overrides in app |
| Projection horizon | Monthly for 36 months + yearly to payoff |
| Event types | One-off cost/windfall, income change, recurring cost change, mortgage change |
| Storage layout | Month-bucket documents (below) |

## Architecture

### Firestore layout

Budget doc stays at `users/{ownerId}/budgets/{budgetId}`. New:

- `users/{ownerId}/budgets/{budgetId}/txMonths/{YYYY-MM}` — `{ month, transactions: Transaction[], updatedAt }`. ~150–250 transactions per doc, well under 1 MB.
- `users/{ownerId}/budgets/{budgetId}/txMeta/rules` — `{ rules: Rule[], accounts: Account[], imports: ImportLog[] }`.
- Budget doc gains small fields: `wealth` (home value history, loan config overrides, assumptions) and `plans` (event list).

Firestore rules: sub-collections readable/writable by members of the parent budget (via `get()` of the parent doc's `info.members`).

### Data shapes

```
Account     { id, name, kind: 'transaction'|'offset'|'loan'|'card', number?, repaymentMatch? }
Transaction { id, accountId, date: 'YYYY-MM-DD', amount (signed, + = money in), rawDesc, merchant, label?,
              receipt?, balance?, bankCategory?, kind, category? (name string), note?, transferPairId?, unpaired?,
              source: 'rule'|'builtin'|'bank'|'manual'|null, reviewed: bool }
kind        'spend'|'income'|'refund'|'transfer'|'cc_repayment'|'card_unitemised'
            |'loan_interest'|'loan_repayment'|'redraw_spend'|'fee'
Rule        { id, match: { field: 'merchant'|'rawDesc', op: 'contains'|'equals'|'regex', value },
              accountId?, set: { kind?, category?, merchant? }, createdBy, createdAt }
```

Transaction `id` = hash of `accountId|date|amount|receipt||rawDesc|occurrenceIndex` — stable across re-imports, used for de-duplication.

### Modules (pure, unit-tested with `node --test`)

- `src/lib/import/parse.js` — detect format; parse ING and Qantas CSV text into raw rows. Handles quoted fields, DD/MM/YYYY and `DD Mon YY`.
- `src/lib/import/merchant.js` — clean description → merchant (strip "- Visa Purchase - Receipt…", card numbers, dates, location suffixes).
- `src/lib/import/classify.js` — assign `kind`: pair transfers (same receipt + opposite amount within 1 day across own accounts, or counterpart account number in the description), CC repayments (per card coverage), loan interest/repayments, redraws (paired → `transfer` with `label`; unpaired loan debits such as a BPAY → `redraw_spend`), income, refunds.
- `src/lib/import/categorise.js` — first match wins: user rules → built-in AU merchant list (~150, e.g. Coles/Woolworths/Aldi → Groceries) → bank category mapping → `null` (needs review).
- `src/lib/import/dedupe.js` — merge new rows into existing month buckets by id; report new / existing / needs-review counts.
- `src/lib/recurring.js` — detect recurring series per merchant (interval + amount stability), classify fixed / variable / irregular, estimate amount + next due date.
- `src/lib/billsAudit.js` — compare detected series to budget expenses → matched / drifted / new / possibly-cancelled, with suggested field changes; variability buffer; Bills-account 12-month in/out reality check.
- `src/lib/spending.js` — category totals per period, 12-month averages, trend series, highlights.
- `src/lib/mortgage.js` — per-split balance history (from CSV balances), inferred rate, interest vs principal, payoff date, offset benefit, extra-repayment scenario.
- `src/lib/projection.js` — monthly simulation from current state with income, bills, average spending, loan amortisation with offset, and events; returns monthly + yearly series, lowest cash point, payoff date, warnings.

### UI

Two new top-level tabs: **Spending** (with Import and Review as sub-views) and **Wealth** (with Mortgage and Plan sections). The mobile bottom nav already has five tabs, so it gets a "More" overflow for the less-used ones.

- **Import** (sub-view of Spending): drop CSVs → auto-detect account (confirm/assign on first import) → preview counts → commit.
- **Review queue**: uncategorised / uncertain transactions grouped by merchant; set category/kind, "apply to all from this merchant" creates a Rule.
- **Bills tab additions**: "Check against bank data" panel listing matched / drifted / new / cancelled with one-click apply; recommended allocation + buffer + reality check.
- **Spending tab** (new): period switcher, category totals vs average, trend chart, drill-down category → merchant → transactions, paid-from breakdown, highlights.
- **Wealth tab** (new): net worth now + history chart; home value entry; per-split mortgage card (balance, rate, repayment, interest/principal, payoff, offset benefit, redraw available); extra-repayment calculator.
- **Plan** (section of the Wealth tab): assumptions, event list (add/edit/toggle), 36-month cash chart with warnings, yearly long view, baseline vs with-plans.

Charts use the existing `recharts` dependency.

### MCP additions

Fix current failure (`list_budgets`/`get_budget` throw `Cannot read properties of null (reading 'id')`). New tools: `list_transactions` (filters: month range, account, kind, category, needs-review), `categorise_transactions` (by ids, optional create rule), `add_rule` / `list_rules`, `bills_audit`, `spending_summary`, `get_wealth`, `set_home_value`, `add_plan_event` / `update_plan_event` / `remove_plan_event`, `get_projection`. All reuse `src/lib` so numbers match the app.

## Security (phase 0 — must ship before any transactions are imported)

Problems found in the existing rules (2026-11-21):
1. `budgetCodes` allows `read` (which includes `list`) to any signed-in user → anyone can enumerate every budget's `ownerId`/`budgetId`.
2. The budget "non-members can join" rule only checks that the user adds themselves to `info.members` — it never checks they know the invite code. Combined with (1), any signed-in stranger can join any budget.
3. `pendingInvites` is readable/writable (incl. list) by any signed-in user → email enumeration, and anyone can plant an invite for themselves.
4. `userEmails` is listable → enumeration of every user's email/uid.
5. Email/password sign-ups are not email-verified, so someone could register a partner's email before they do and claim an email invite.

Fixes:
- `budgetCodes`, `userEmails`: `get` only (no `list`).
- Join by code: the joiner first creates `budgetCodes/{code}/joins/{uid}` (only possible if they know the code; create-only, own uid). The budget join rule requires `exists(budgetCodes/$(resource.data.info.code)/joins/$(request.auth.uid))`.
- Join by email: admins add the lower-cased email to `info.invitedEmails` (admin-only field, like `members`/`admins`). Join rule allows it only when `request.auth.token.email_verified == true` and the email is in `info.invitedEmails`. `pendingInvites/{email}` becomes readable/deletable only by the signed-in owner of that verified email; anyone signed in may still create/update (it only helps discovery — it grants nothing).
- New sub-collections (`txMonths`, `txMeta`): read/write only when `request.auth.uid in get(parent).data.info.members`. Nothing else can touch them.
- Audit current members of each budget (via MCP) and report any unexpected accounts.

Data handling:
- CSVs are parsed in the browser; raw files are never uploaded to Storage or anywhere else. Only parsed rows go to Firestore (encrypted at rest by Google).
- `*.csv` and `*.xlsx` added to `.gitignore`; test fixtures are small, anonymised snippets. Real files are only read from `~/Downloads` / scratchpad, never copied into the repo.
- No transaction data in Analytics events, console logs or error messages.
- MCP uses the local Google login (admin access) and only runs on this computer; it never sends data anywhere except Firestore.
- Rules are tested against the Firestore emulator (`@firebase/rules-unit-testing`) where Java is available; deploying rules is confirmed with the user first.

## Error handling

- Unknown CSV format → clear message naming expected columns; nothing written.
- Rows that fail to parse are listed in the preview and skipped, not silently dropped.
- Import commit writes month docs in a batch; on failure nothing partial is reported as success.
- Unpaired "internal transfer" rows (counterpart account not imported) are kept as `transfer` but flagged so they can be reviewed.
- Projection never hides a negative cash month — it is shown as a warning.

## Testing

Unit tests per module in `src/lib/**.test.js` using small fixture CSV snippets taken from the real formats (anonymised amounts), covering: both date formats, quoted descriptions, transfer pairing by receipt, CC repayment handling before/after card coverage, rule precedence, dedupe idempotency (importing the same file twice adds nothing), recurring detection for weekly/monthly/quarterly/annual, mortgage interest/rate inference, projection with each event type. The real files are used for a manual end-to-end check, never committed.

## Build order

0. Security hardening (rules, join flows, gitignore, member audit) — deployed before step 2.
1. Import & categorisation engine + sub-collection rules + MCP fix and transaction tools.
2. First real import, with Claude asking about unclear merchants/accounts and saving rules.
3. Bills analysis + apply fixes to the budget.
4. Spending tab.
5. Wealth & mortgage tab.
6. Plan tab + projection engine.

Each step gets its own implementation plan and is shippable on its own.

## Out of scope (for now)

Super, shares, car/novated lease, HECS as wealth items; automatic bank feeds (CSV only); tax export; Medicare tracker (ideas kept for later).
