# Security Hardening + Transaction Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **User preference:** never commit — leave all changes uncommitted for the user. Ask before deploying rules.

**Goal:** Close the budget-sharing holes in Firestore rules, then let the app (and Claude via MCP) import ING + Qantas CSVs into month-bucket sub-collections with transfer matching, categorisation rules and a review queue.

**Architecture:** Pure parsing/classification/categorisation in `src/lib/import/` (tested with `node --test`, shared with the MCP server). A small Firestore layer (`src/lib/txStore.js` for the app, `mcp/firestore.js` for MCP) reads/writes `txMonths/{YYYY-MM}` and `txMeta/config`. UI: a new Spending tab with Transactions / Review / Import sub-views.

**Tech Stack:** React 19, Vite, Tailwind, Firebase JS SDK 11, firebase-admin (MCP), node:test, `@firebase/rules-unit-testing` + Firestore emulator (Java 21 available).

Spec: `docs/superpowers/specs/2026-11-21-transactions-wealth-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `.gitignore` | add `*.csv`, `*.xlsx` |
| `firestore.rules` | hardened rules + sub-collection rules |
| `firebase.json` | emulator port |
| `firestore-tests/rules.test.js` | emulator tests for every rule change |
| `src/components/BudgetSelection.jsx` | join-by-code creates `budgetCodes/{code}/joins/{uid}` first; pending-invite claim unchanged |
| `src/components/Settings.jsx` | invite-by-email writes `info.invitedEmails`; no read of others' pendingInvites |
| `src/components/Auth/Signup.jsx` | send verification email on email/password signup |
| `mcp/firestore.js` | skip legacy top-level `budgets/*` docs; tx read/write helpers |
| `src/lib/import/parse.js` | CSV → raw rows (ING, Qantas) |
| `src/lib/import/merchant.js` | receipt / counterparty / label / merchant clean-up |
| `src/lib/import/classify.js` | transfer pairing + `kind` |
| `src/lib/import/categorise.js` | rules → built-ins → bank category |
| `src/lib/import/ledger.js` | ids, build ledger from existing + new rows, month diff, review groups |
| `src/lib/import/*.test.js` | unit tests |
| `src/lib/txStore.js` | app-side Firestore read/write of months + config |
| `src/hooks/useLedger.js` | live subscription to months + config |
| `src/components/Spending/SpendingTab.jsx` | sub-nav shell |
| `src/components/Spending/ImportPanel.jsx` | file pick → account assign → preview → commit |
| `src/components/Spending/ReviewQueue.jsx` | grouped review + rule creation |
| `src/components/Spending/TransactionList.jsx` | search/filter/edit |
| `src/components/BudgetApp.jsx` | add Spending tab + mobile "More" overflow |
| `mcp/ledger.js`, `mcp/server.js` | MCP tools: import_statement, list_transactions, review_queue, categorise_transactions, add_rule, list_rules, set_account |

---

## Phase 0 — Security

### Task 1: gitignore
- [ ] Add `*.csv` and `*.xlsx` under "# misc" in `.gitignore`. Verify `git check-ignore -v foo.csv` prints the rule.

### Task 2: Rules test harness (write failing tests first)
- [ ] `npm i -D @firebase/rules-unit-testing`; add `"emulators": { "firestore": { "port": 8080 }, "ui": { "enabled": false } }` to `firebase.json`; script `"test:rules": "npx -y firebase-tools@14 emulators:exec --only firestore --project demo-budget \"node --test firestore-tests/\""`.
- [ ] `firestore-tests/rules.test.js` — seed (with rules disabled) owner `alice` budget `b1` `{info:{code:'ABC123', members:['alice'], admins:['alice'], createdBy:'alice'}}`, `budgetCodes/ABC123 {ownerId:'alice', budgetId:'b1'}`, `txMonths/2026-11`. Cases:
  1. stranger `mallory` cannot `list` `budgetCodes`, `userEmails`, `pendingInvites`.
  2. mallory cannot add self to `b1.info.members` without a join doc.
  3. mallory with `budgetCodes/ABC123/joins/mallory` created **can** add self (and only self).
  4. mallory cannot create `budgetCodes/ABC123/joins/bob`.
  5. `bob` (verified `bob@x.com`) can join when `info.invitedEmails` contains `bob@x.com`; unverified bob cannot.
  6. member (non-admin) cannot change `invitedEmails`; admin can.
  7. member can read/write `txMonths/*` and `txMeta/*`; mallory cannot read either.
  8. bob can `get`/`delete` `pendingInvites/bob@x.com` only when verified as that email.
- [ ] Run `npm run test:rules` → cases 1, 2, 5(unverified), 7(mallory), 8 FAIL against current rules.

### Task 3: Rewrite `firestore.rules`
- [ ] Implement per spec "Security" section: `get`-only on `budgetCodes`/`userEmails`; join requires `knowsCode()` (join doc exists) or `wasInvited()` (verified email in `info.invitedEmails`); `invitedEmails` admin-only like `members`/`admins`; `budgetCodes/{code}/joins/{uid}` create-only by that uid; `pendingInvites` get/delete only by verified owner email, create/update by any signed-in user; `users/{o}/budgets/{b}/{sub}/{doc}` for `sub in ['txMonths','txMeta']` read/write by members of the parent.
- [ ] `npm run test:rules` → all PASS.

### Task 4: Client join-by-code
- [ ] In `BudgetSelection.jsx` `joinBudget`: after `getDoc(budgetCodes/{code})` exists, `await setDoc(doc(db,'budgetCodes',CODE,'joins',user.uid), { at: serverTimestamp() })` **before** reading/updating the budget. Note: a non-member can no longer `getDoc` the budget before joining (read requires membership) — remove the pre-read; do the `updateDoc` (arrayUnion) directly and map `permission-denied` → "Invalid or expired code".

### Task 5: Invite-by-email
- [ ] `Settings.jsx` `inviteByEmail`: lower-case the email; check duplicates against `budget.info.invitedEmails`; `updateDoc(budget, { 'info.invitedEmails': arrayUnion(email) })`; then existing-user path unchanged; pending path writes `pendingInvites/{email}` with `arrayUnion` and **no** prior `getDoc`.
- [ ] `Signup.jsx`: after `createUserWithEmailAndPassword`, `sendEmailVerification(user)` (ignore errors).
- [ ] `BudgetSelection.jsx` pending-invite claim: unchanged code path; it simply fails quietly for unverified emails (already in try/catch).

### Task 6: MCP fix + migration
- [ ] `mcp/firestore.js` `listBudgets`: `.filter(d => d.ref.parent.parent)` before mapping. Run `node -e` listBudgets → prints the 5 user budgets.
- [ ] One-off admin script (scratchpad, not committed): set `info.invitedEmails = ['the partner's email']` on "Our Budget" so the partner's existing pending invite still works. Ask the user first.

### Task 7: Deploy rules (ask first)
- [ ] Ask user. Then `npx -y firebase-tools@14 deploy --only firestore:rules` (user may need `! npx firebase-tools login`). Client changes from Tasks 4–5 must be deployed with/after; until then join-by-code from old clients fails closed.

## Phase 1 — Import engine

### Task 8: `parse.js` (TDD)
API: `parseCsv(text) → string[][]`; `detectFormat(header) → 'ing'|'qantas'|null`; `parseStatement(text) → { format, rows, errors }` where row = `{ date:'YYYY-MM-DD', amount:number, rawDesc, balance?:number, bankCategory?, merchantName?, txType? }`.
Tests: ING debit/credit/balance; quoted description with trailing space; Qantas `20 Nov 26` → `2026-11-20`, signed amount, category/merchant; unknown header → `format:null` + error; malformed row → listed in `errors`, others parsed.

### Task 9: `merchant.js` (TDD)
API: `extractReceipt(desc)`, `extractCounterparty(desc)` (last 8 digits of an own-style account number after `From`/`to [BSB]`/`Everyday`), `transferLabel(desc)` (text before ` - Internal Transfer` / ` - Receipt`), `cleanMerchant(rawDesc, merchantName?)`.
Tests from real shapes: `Coles - Internal Transfer - Receipt 645723 Orange Everyday 0011112222` → receipt `645723`, counterparty `11112222`, label `Coles`; `Physio appt - Receipt No 854768Transfer to 923100 33334444` → `854768`, `33334444`, `Physio appt`; `EXETEL - Direct Debit - Receipt 158105 410253` → merchant `Exetel`; `MCARE BENEFITS   123456789 CYWQ  - Receipt 120199` → `Mcare Benefits`; Qantas merchantName `Chemist Warehouse (Richmond)` → `Chemist Warehouse`; merchantName `Square` falls back to details `SQ *SWEET HEART BY NAA Carlton Nth AUS` → `Sweet Heart By Naa`.

### Task 10: `classify.js` (TDD)
API: `classifyAll(txns, accounts) → txns` (new objects; keeps `source:'manual'` kinds). Accounts: `{ id, name, kind:'transaction'|'offset'|'loan'|'card', number?, repaymentMatch? }`.
Order: pair by receipt (different account, opposite amount ±0.005, ≤2 days) → both `transfer` (loan credit side → `loan_repayment`), set `transferPairId`, `label`; loan: interest → `loan_interest`, fee → `fee`, credit → `loan_repayment`, debit to own counterparty → `transfer` (label), else `redraw_spend`; card: payment credit → `transfer`, other credit → `refund`, `FEES` → `fee`, else `spend`; bank: repayment matching a card's `repaymentMatch` → `cc_repayment` if date ≥ that card's first txn date else `card_unitemised`; generic `CC REPAYMENT|CREDIT CARD` → `card_unitemised`; `Internal Transfer` or own counterparty → `transfer` (+`unpaired:true` if no pair); credit → `income`; debit → `spend`.
Tests: receipt pair across Spending/Bills; redraw paired → transfer with label; HECS BPAY from loan → redraw_spend; interest; Qantas repayment before/after coverage; ANZ repayment → card_unitemised; manual kind preserved.

### Task 11: `categorise.js` (TDD)
API: `DEFAULT_CATEGORIES` (names + colours), `BUILTIN_RULES` (`{ re, category, kind? }`, ~150 AU merchants), `BANK_CATEGORY_MAP`, `matchRule(rule, txn)`, `categoriseAll(txns, rules) → txns`. Only for kinds that count (`spend`, `income`, `refund`, `redraw_spend`, `fee`); `card_unitemised` → `Card (unitemised)`; transfers get no category. Precedence: `source:'manual'` untouched → user rules (may also set `kind`) → built-ins → bank map → `category:null`.
Tests: Coles & Woolworths → Groceries; user rule beats built-in; bank `Cafe & coffee` → `Eating out`; Medicare credit → kind `refund`, `Health & medical`; manual untouched; unknown → null.

### Task 12: `ledger.js` (TDD)
API: `txnId(t)` (FNV-1a of `accountId|date|amount|rawDesc|occ`); `rowsToTxns(rows, accountId)` (assigns ids with occurrence index for identical rows); `buildLedger(existing, incoming, { accounts, rules }) → { all, added, duplicates }` (union by id, existing wins, then classify + categorise everything); `groupByMonth(txns)`; `changedMonths(beforeByMonth, afterTxns) → { [ym]: txns }` (deep compare); `reviewGroups(txns)` (needs review = counting kind + `category==null`, grouped by merchant with count/total/first/last/sample ids); `applyRuleToLedger`.
Tests: importing same rows twice → 0 added; two identical coffees same day both kept; manual edit survives re-import; changedMonths only returns touched months.

### Task 13: `txStore.js` + `useLedger`
- [ ] `txStore.js`: `monthsRef(ownerId,budgetId)`, `configRef(...)` (`txMeta/config` → `{ accounts, rules }`), `saveMonths(ownerId,budgetId, byMonth)` via `writeBatch` (chunks of 400), `saveConfig(...)`.
- [ ] `useLedger()` hook: `onSnapshot` on the `txMonths` collection and `txMeta/config`; returns `{ loading, txns, byMonth, config, error }`. Mounted only inside the Spending tab.

### Task 14: Spending tab + mobile More
- [ ] `BudgetApp.jsx`: add `{ id:'spending', name:'Spending', icon: PieChart }`; mobile bottom nav shows first 4 tabs + "More" sheet listing the rest. `SpendingTab.jsx` with pills Transactions / Review (badge count) / Import.

### Task 15: ImportPanel
- [ ] Multi-file input → `parseStatement` each → per file pick existing account or create (name from filename, kind guessed: `loan` if "loan", `offset` if "offset", `card` if "cc|card" with `repaymentMatch` from first word, else `transaction`) → `buildLedger` preview: added / duplicates / needs review / parse errors (listed) → Commit writes config then changed months; shows result. No raw file content is stored.

### Task 16: ReviewQueue
- [ ] `reviewGroups` list; per group: category select (DEFAULT_CATEGORIES + existing), kind select, "Remember for this merchant" (default on) → adds rule `{ match:{field:'merchant',op:'equals',value}, set:{category,kind} }` and re-runs `categoriseAll`; else marks those txns `source:'manual'`. Save changed months.

### Task 17: TransactionList
- [ ] Search (merchant/desc/label), filters (account, kind, category, month), "include transfers" toggle (off by default), paged 100 at a time, inline category/kind edit (sets `source:'manual'`).

### Task 18: MCP tools
- [ ] `mcp/firestore.js`: `readLedger(ref)`, `writeMonths(ref, byMonth)`, `writeConfig(ref, cfg)`.
- [ ] `mcp/ledger.js` (pure wrappers + tests in `mcp/ledger.test.js`): summaries for tools.
- [ ] Tools: `import_statement { path, account, accountKind?, repaymentMatch?, dryRun? }` (reads a local CSV — files never leave the machine except as parsed rows to Firestore), `list_transactions { from?, to?, account?, kind?, category?, search?, needsReview?, limit? }`, `review_queue { limit? }`, `categorise_transactions { ids? | merchant?, category?, kind?, remember? }`, `add_rule`, `list_rules`, `set_account { id|name, number?, kind?, repaymentMatch? }`.

### Task 19: Verify
- [ ] `npm test`, `npm run test:rules`, `cd mcp && npm test`, `npm run lint`, `npm run build` all pass.
- [ ] After rules are deployed: dry-run import of all five files via MCP, check counts and that 12-month spend excludes transfers; then real import; review queue with the user.
