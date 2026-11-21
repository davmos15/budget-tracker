// Pure helpers behind the transaction tools. No Firebase here, so they can be
// tested directly. The import/classify/categorise logic is the app's own
// (src/lib/import), so Claude and the app always agree.

import { parseStatement } from '../src/lib/import/parse.js'
import { rowsToTxns, buildLedger, guessAccount, reviewGroups, needsReview, ruleFromGroup, groupByMonth, changedMonths, KIND_LABELS } from '../src/lib/import/ledger.js'
import { BudgetError } from './budget.js'

const round2 = (n) => Math.round(n * 100) / 100
const SPENDING_KINDS = new Set(['spend', 'refund', 'fee', 'redraw_spend', 'card_unitemised'])
const ACCOUNT_KINDS = ['transaction', 'offset', 'loan', 'card']

export function findAccount(accounts, ref) {
  if (!ref) return null
  const lower = String(ref).toLowerCase()
  return accounts.find(a => a.id === ref || a.name.toLowerCase() === lower) || null
}

const allTxns = (byMonth) => Object.values(byMonth).flat()

/** What changed, ready to write: { months, config }. */
function result(ledger, all, config) {
  return { months: changedMonths(ledger.byMonth, all), config }
}

/**
 * Import a CSV's text into an account (creating the account if new).
 * opts: { filename, account, accountKind?, number?, repaymentMatch?, dryRun? }
 */
export function importStatement(ledger, text, opts) {
  const parsed = parseStatement(text)
  if (!parsed.format) throw new BudgetError(parsed.errors[0]?.reason || 'Unrecognised file.')
  const accounts = [...ledger.config.accounts]
  let account = findAccount(accounts, opts.account)
  if (!account) {
    const guess = guessAccount(opts.account || opts.filename, parsed.format)
    account = { ...guess, name: opts.account || guess.name }
    if (opts.accountKind) account.kind = opts.accountKind
    if (opts.number) account.number = String(opts.number)
    if (opts.repaymentMatch) account.repaymentMatch = opts.repaymentMatch
    if (!ACCOUNT_KINDS.includes(account.kind)) throw new BudgetError(`accountKind must be one of ${ACCOUNT_KINDS.join(', ')}`)
    accounts.push(account)
  }
  const existing = allTxns(ledger.byMonth)
  const incoming = rowsToTxns(parsed.rows, account.id)
  const { all, added, duplicates } = buildLedger(existing, incoming, { accounts, rules: ledger.config.rules })
  const stored = new Set(existing.map(t => t.id))
  const fresh = all.filter(t => !stored.has(t.id))
  return {
    ...result(ledger, all, { ...ledger.config, accounts }),
    summary: {
      account: account.name,
      format: parsed.format,
      rows: parsed.rows.length,
      added,
      duplicates,
      unreadableRows: parsed.errors.length,
      needReview: fresh.filter(needsReview).length,
      from: parsed.rows.reduce((m, r) => (m && m < r.date ? m : r.date), null),
      to: parsed.rows.reduce((m, r) => (m && m > r.date ? m : r.date), null)
    }
  }
}

function brief(t, accountsById) {
  return {
    id: t.id, date: t.date, amount: t.amount, merchant: t.merchant, account: accountsById[t.accountId]?.name || t.accountId,
    kind: t.kind, category: t.category ?? null, label: t.label, description: t.rawDesc
  }
}

/** filters: { from?, to?, account?, kind?, category?, search?, needsReview?, limit? } */
export function listTransactions(ledger, f = {}) {
  const accountsById = Object.fromEntries(ledger.config.accounts.map(a => [a.id, a]))
  const acct = f.account ? findAccount(ledger.config.accounts, f.account) : null
  if (f.account && !acct) throw new BudgetError(`No account "${f.account}". Accounts: ${ledger.config.accounts.map(a => a.name).join(', ')}`)
  const q = f.search?.toLowerCase()
  const rows = allTxns(ledger.byMonth)
    .filter(t =>
      (!f.from || t.date >= f.from) && (!f.to || t.date <= f.to) &&
      (!acct || t.accountId === acct.id) && (!f.kind || t.kind === f.kind) &&
      (!f.category || (t.category || '').toLowerCase() === f.category.toLowerCase()) &&
      (!f.needsReview || needsReview(t)) &&
      (!q || `${t.merchant} ${t.rawDesc} ${t.label || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  const limit = f.limit || 50
  return {
    count: rows.length,
    total: round2(rows.reduce((n, t) => n + t.amount, 0)),
    shown: Math.min(limit, rows.length),
    transactions: rows.slice(0, limit).map(t => brief(t, accountsById))
  }
}

export function reviewQueue(ledger, { limit = 30, from } = {}) {
  const txns = allTxns(ledger.byMonth).filter(t => !from || t.date >= from)
  const groups = reviewGroups(txns)
  const accountsById = Object.fromEntries(ledger.config.accounts.map(a => [a.id, a]))
  return {
    groups: groups.length,
    transactions: groups.reduce((n, g) => n + g.count, 0),
    top: groups.slice(0, limit).map(g => ({
      merchant: g.merchant, type: g.type, count: g.count, total: g.total, first: g.first, last: g.last,
      accounts: g.accounts.map(a => accountsById[a]?.name || a), examples: g.samples
    }))
  }
}

/**
 * Set category/kind for transactions picked by ids or merchant.
 * remember=true saves a rule for the merchant instead of one-off edits.
 */
export function categorise(ledger, { ids, merchant, category, kind, remember = false, createdBy = 'claude' }) {
  if (!ids?.length && !merchant) throw new BudgetError('Give ids or a merchant.')
  if (category === undefined && !kind) throw new BudgetError('Give a category and/or kind.')
  if (kind && !KIND_LABELS[kind]) throw new BudgetError(`kind must be one of ${Object.keys(KIND_LABELS).join(', ')}`)
  const set = {}
  if (category !== undefined) set.category = category
  if (kind) set.kind = kind
  let txns = allTxns(ledger.byMonth)
  let rules = ledger.config.rules
  const idSet = new Set(ids || [])
  const picked = txns.filter(t => idSet.has(t.id) || (merchant && t.merchant.toLowerCase() === merchant.toLowerCase()))
  if (!picked.length) throw new BudgetError('No matching transactions.')
  if (remember) {
    if (!merchant) throw new BudgetError('remember needs a merchant.')
    rules = [ruleFromGroup({ merchant: picked[0].merchant }, set, { createdBy }), ...rules]
  } else {
    const pickedIds = new Set(picked.map(t => t.id))
    txns = txns.map(t => {
      if (!pickedIds.has(t.id)) return t
      const out = { ...t, reviewed: true }
      if (kind) { out.kind = kind; out.kindLocked = true }
      if (category !== undefined) { out.category = category; out.source = 'manual' }
      return out
    })
  }
  const config = { ...ledger.config, rules }
  const { all } = buildLedger(txns, [], { accounts: config.accounts, rules })
  return { ...result(ledger, all, config), summary: { updated: picked.length, rule: remember } }
}

/** rule: { match: { field, op, value }, set: { category?, kind? }, account? } */
export function addRule(ledger, { field = 'merchant', op = 'equals', value, category, kind, account, direction, createdBy = 'claude' }) {
  if (!value) throw new BudgetError('value is required.')
  if (op === 'regex') { try { new RegExp(value) } catch { throw new BudgetError('Invalid regex.') } }
  const set = {}
  if (category !== undefined) set.category = category
  if (kind) set.kind = kind
  if (!Object.keys(set).length) throw new BudgetError('Give a category and/or kind.')
  const rule = { ...ruleFromGroup({ merchant: value }, set, { createdBy }), match: { field, op, value } }
  if (direction) rule.direction = direction
  if (account) {
    const a = findAccount(ledger.config.accounts, account)
    if (!a) throw new BudgetError(`No account "${account}".`)
    rule.accountId = a.id
  }
  // Newest rules first so a specific new rule beats an older broad one
  const config = { ...ledger.config, rules: [rule, ...ledger.config.rules] }
  const before = allTxns(ledger.byMonth)
  const { all } = buildLedger(before, [], { accounts: config.accounts, rules: config.rules })
  const matched = all.filter(t => t.ruleId === rule.id).length
  return { ...result(ledger, all, config), summary: { rule, matched } }
}

export function removeRule(ledger, id) {
  if (!ledger.config.rules.some(r => r.id === id)) throw new BudgetError(`No rule ${id}.`)
  const config = { ...ledger.config, rules: ledger.config.rules.filter(r => r.id !== id) }
  const { all } = buildLedger(allTxns(ledger.byMonth), [], { accounts: config.accounts, rules: config.rules })
  return { ...result(ledger, all, config), summary: { removed: id } }
}

/** Add or change an account (e.g. its number, so transfers to it pair up). */
export function setAccount(ledger, { account, name, kind, number, repaymentMatch }) {
  const accounts = [...ledger.config.accounts]
  let a = findAccount(accounts, account)
  if (!a) {
    if (!kind) throw new BudgetError(`No account "${account}". To add one, give its kind (${ACCOUNT_KINDS.join(', ')}).`)
    a = { id: String(account).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name: name || account, kind }
    accounts.push(a)
  }
  const i = accounts.indexOf(a)
  const next = { ...a }
  if (name) next.name = name
  if (kind) { if (!ACCOUNT_KINDS.includes(kind)) throw new BudgetError(`kind must be one of ${ACCOUNT_KINDS.join(', ')}`); next.kind = kind }
  if (number !== undefined) next.number = number ? String(number) : undefined
  if (repaymentMatch !== undefined) next.repaymentMatch = repaymentMatch || undefined
  accounts[i] = next
  const config = { ...ledger.config, accounts }
  const { all } = buildLedger(allTxns(ledger.byMonth), [], { accounts, rules: config.rules })
  return { ...result(ledger, all, config), summary: { account: next } }
}

/** Spending by category (and income) between two dates. Transfers and repayments are excluded. */
export function spendingSummary(ledger, { from, to } = {}) {
  const txns = allTxns(ledger.byMonth).filter(t => (!from || t.date >= from) && (!to || t.date <= to))
  const byCategory = {}
  let spending = 0
  let income = 0
  const other = {}
  for (const t of txns) {
    if (SPENDING_KINDS.has(t.kind)) {
      const c = t.category || 'Needs review'
      byCategory[c] = round2((byCategory[c] || 0) - t.amount)
      spending = round2(spending - t.amount)
    } else if (t.kind === 'income') income = round2(income + t.amount)
    else other[t.kind] = round2((other[t.kind] || 0) + t.amount)
  }
  return {
    from: from || txns.reduce((m, t) => (m && m < t.date ? m : t.date), null),
    to: to || txns.reduce((m, t) => (m && m > t.date ? m : t.date), null),
    spending, income,
    byCategory: Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount })),
    notCounted: other
  }
}

export { groupByMonth }

/** The Bills-tab "check against bank data", in a form that's easy to read in chat. */
export async function billsAuditSummary(ledger, budget, { today }) {
  const { detectRecurring } = await import('../src/lib/recurring.js')
  const { auditBills, billsAccountFlows } = await import('../src/lib/billsAudit.js')
  const txns = allTxns(ledger.byMonth)
  const series = detectRecurring(txns, { today })
  const audit = auditBills({
    expenses: budget.expenses || [], series, today, txns, accounts: ledger.config.accounts,
    links: ledger.config.billLinks, dismissed: ledger.config.billDismissed
  })
  const bills = ledger.config.accounts.find(a => a.kind === 'offset') || ledger.config.accounts.find(a => /bill/i.test(a.name))
  const yearAgo = new Date(today); yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  return {
    totals: audit.totals,
    variableBuffer: audit.variableBuffer,
    billsAccountLast12Months: bills ? billsAccountFlows(txns, bills.id, { from: yearAgo.toISOString().slice(0, 10), to: today }) : null,
    items: audit.items.map(r => ({
      name: r.expense.name, id: r.expense.id, status: r.status,
      budget: { amount: r.expense.amount, frequency: r.expense.frequency },
      bank: r.series ? { payee: r.series.merchant, amount: r.series.amount, frequency: r.series.frequency, last: r.series.last, active: r.series.active } : (r.lastSeen || null),
      suggestion: r.status === 'ok' ? undefined : r.suggestion
    })),
    newBills: audit.newBills.map(b => ({ payee: b.series.merchant, ...b.suggestion, paidLastYear: b.series.annual }))
  }
}
