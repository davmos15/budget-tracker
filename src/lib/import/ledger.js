// Putting imports together: stable ids, de-duplication, month buckets and the
// review queue. Pure functions only.

import { cleanMerchant } from './merchant.js'
import { classifyAll } from './classify.js'
import { categoriseAll } from './categorise.js'

// 32-bit FNV-1a, twice with different seeds → 16 hex chars
function hash(str) {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193 ^ 0x5bd1e995
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x5bd1e995)
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
}

/**
 * Raw parsed rows for one account → transactions with stable ids. Identical rows
 * (two $4.50 coffees on the same day) get an occurrence number so both are kept,
 * and re-importing the same file gives the same ids.
 */
export function rowsToTxns(rows, accountId) {
  const seen = new Map()
  return rows.map(r => {
    const key = `${accountId}|${r.date}|${r.amount.toFixed(2)}|${r.rawDesc}`
    const occ = seen.get(key) || 0
    seen.set(key, occ + 1)
    const t = { id: hash(`${key}|${occ}`), accountId, date: r.date, amount: r.amount, rawDesc: r.rawDesc, merchant: cleanMerchant(r.rawDesc, r.merchantName) }
    for (const k of ['balance', 'bankCategory', 'merchantName', 'txType']) if (r[k] !== undefined) t[k] = r[k]
    return t
  })
}

/**
 * Merge new transactions into what's already stored, then re-run classification
 * and categories over everything (a new import can pair old transfers).
 * Existing transactions win, so hand edits are kept.
 */
export function buildLedger(existing, incoming, { accounts, rules = [] }) {
  const byId = new Map(existing.map(t => [t.id, t]))
  let added = 0
  let duplicates = 0
  for (const t of incoming) {
    if (byId.has(t.id)) duplicates++
    else { byId.set(t.id, t); added++ }
  }
  const sorted = [...byId.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const all = categoriseAll(classifyAll(sorted, accounts), rules)
  return { all, added, duplicates }
}

export const monthOf = (t) => t.date.slice(0, 7)

export function groupByMonth(txns) {
  const out = {}
  for (const t of txns) (out[monthOf(t)] ||= []).push(t)
  return out
}

const stable = (list) => JSON.stringify([...list].sort((a, b) => (a.id < b.id ? -1 : 1)))

/** Months whose contents differ between what's stored and the new ledger. */
export function changedMonths(storedByMonth, txns) {
  const next = groupByMonth(txns)
  const out = {}
  for (const m of new Set([...Object.keys(storedByMonth), ...Object.keys(next)])) {
    const a = storedByMonth[m] || []
    const b = next[m] || []
    if (a.length !== b.length || stable(a) !== stable(b)) out[m] = b
  }
  return out
}

const COUNTED = new Set(['spend', 'income', 'refund', 'fee', 'redraw_spend'])

/** Needs a human: counted but no category, or a transfer to an account we don't know. */
export function needsReview(t) {
  if (t.reviewed) return false
  return (COUNTED.has(t.kind) && !t.category) || (t.kind === 'transfer' && t.unpaired && !t.ruleId)
}

/** Review queue grouped by merchant (and whether it's an unpaired transfer), biggest first. */
export function reviewGroups(txns) {
  const groups = new Map()
  for (const t of txns) {
    if (!needsReview(t)) continue
    const type = t.kind === 'transfer' ? 'transfer' : 'uncategorised'
    const key = `${type}|${t.merchant}`
    let g = groups.get(key)
    if (!g) {
      g = { key, type, merchant: t.merchant, count: 0, total: 0, first: t.date, last: t.date, ids: [], accounts: new Set(), samples: [] }
      groups.set(key, g)
    }
    g.count++
    g.total = Math.round((g.total + t.amount) * 100) / 100
    if (t.date < g.first) g.first = t.date
    if (t.date > g.last) g.last = t.date
    g.ids.push(t.id)
    g.accounts.add(t.accountId)
    if (g.samples.length < 3) g.samples.push({ date: t.date, amount: t.amount, rawDesc: t.rawDesc, label: t.label })
  }
  return [...groups.values()]
    .map(g => ({ ...g, accounts: [...g.accounts] }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
}

/** A rule that sends every transaction from this merchant to `set` ({ category?, kind? }). */
export function ruleFromGroup(group, set, { createdBy = null } = {}) {
  return {
    id: `r_${hash(`${group.merchant}|${JSON.stringify(set)}|${Date.now()}`)}`,
    match: { field: 'merchant', op: 'equals', value: group.merchant },
    set,
    createdBy,
    createdAt: new Date().toISOString()
  }
}

export const KIND_LABELS = {
  spend: 'Spending',
  income: 'Income',
  refund: 'Refund',
  fee: 'Fee',
  redraw_spend: 'Paid from loan',
  card_unitemised: 'Card (unitemised)',
  transfer: 'Transfer',
  cc_repayment: 'Card repayment',
  debt_repayment: 'Debt repayment',
  loan_interest: 'Loan interest',
  loan_repayment: 'Loan repayment'
}
// What a person can set a transaction to by hand
export const EDITABLE_KINDS = ['spend', 'income', 'refund', 'fee', 'transfer', 'debt_repayment']

/** A first guess at the account a file belongs to, from its name. */
export function guessAccount(filename, format) {
  const name = String(filename || '').replace(/\.[^.]+$/, '').trim() || 'Account'
  const lower = name.toLowerCase()
  const id = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'account'
  if (format === 'qantas' || /\b(cc|card|credit)\b|cc$/.test(lower)) {
    const brand = (name.match(/^[A-Za-z]+/) || ['CARD'])[0].replace(/cc$/i, '')
    return { id, name, kind: 'card', repaymentMatch: brand.toUpperCase() }
  }
  if (lower.includes('loan')) return { id, name, kind: 'loan' }
  if (lower.includes('offset')) return { id, name, kind: 'offset' }
  return { id, name, kind: 'transaction' }
}
