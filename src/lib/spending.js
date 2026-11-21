// Where the money goes, from imported transactions. Pure functions only.
//
// "Spending" = money out on things (spend, fees, paid-from-loan, unitemised card
// repayments) less refunds. Transfers, card repayments, income, mortgage and
// personal-loan repayments are not spending.

import { toISODate, addMonths, parseDate } from './dates.js'
import { cleanMerchant } from './import/merchant.js'

const round2 = (n) => Math.round(n * 100) / 100
const SPENDING = new Set(['spend', 'fee', 'redraw_spend', 'card_unitemised'])

/** How much this transaction adds to spending (refunds are negative). */
export function spendingAmount(t) {
  if (SPENDING.has(t.kind)) return -t.amount
  if (t.kind === 'refund') return -t.amount
  return 0
}

const monthKey = (d) => toISODate(d).slice(0, 7)

/** Months (YYYY-MM) ending with the current one. */
function lastMonths(today, count) {
  const now = parseDate(today)
  return Array.from({ length: count }, (_, i) => monthKey(addMonths(new Date(now.getFullYear(), now.getMonth(), 1), i - count + 1)))
}

/** [{ month, total, byCategory }] for the last `months` months (current month last). */
export function monthlyTotals(txns, { months = 12, today }) {
  const keys = lastMonths(today, months)
  const out = Object.fromEntries(keys.map(k => [k, { month: k, total: 0, byCategory: {} }]))
  for (const t of txns) {
    const m = out[t.date.slice(0, 7)]
    const amt = spendingAmount(t)
    if (!m || !amt) continue
    const c = t.category || 'Needs review'
    m.total = round2(m.total + amt)
    m.byCategory[c] = round2((m.byCategory[c] || 0) + amt)
  }
  return keys.map(k => out[k])
}

/** Multiply a monthly figure by this to get it per week / fortnight / month / year. */
export function periodFactor(period) {
  return { weekly: 12 / 52, fortnightly: 12 / 26, monthly: 1, yearly: 12 }[period] ?? 1
}

/**
 * Per-category figures over the last `window` complete months:
 *   monthlyAvg, recentAvg (last 3 complete months), change (recent vs avg), thisMonth (so far), total
 */
export function categoryStats(txns, { today, window = 12 }) {
  const months = monthlyTotals(txns, { months: window + 1, today })
  const complete = months.slice(0, -1)
  const current = months[months.length - 1]
  const recent = complete.slice(-3)
  const cats = new Set(months.flatMap(m => Object.keys(m.byCategory)))
  const sum = (list, c) => list.reduce((a, m) => a + (m.byCategory[c] || 0), 0)
  return [...cats].map(category => {
    const monthlyAvg = round2(sum(complete, category) / complete.length)
    const recentAvg = round2(sum(recent, category) / recent.length)
    return {
      category,
      monthlyAvg,
      recentAvg,
      change: monthlyAvg > 0 ? round2(recentAvg / monthlyAvg - 1) : null,
      thisMonth: round2(current.byCategory[category] || 0),
      total: round2(sum(complete, category)),
      series: complete.map(m => ({ month: m.month, amount: m.byCategory[category] || 0 }))
    }
  }).sort((a, b) => b.monthlyAvg - a.monthlyAvg)
}

/**
 * First month from which card spending is (nearly all) itemised: every month since has
 * less than 15% of its spending as unitemised card repayments. Null if never unitemised.
 */
export function itemisedSince(txns, { today }) {
  if (!txns.some(t => t.kind === 'card_unitemised')) return null
  const months = monthlyTotals(txns, { months: 120, today })
  let since = null
  for (let i = months.length - 1; i >= 0; i--) {
    const m = months[i]
    if (m.total > 0 && (m.byCategory['Card (unitemised)'] || 0) / m.total >= 0.15) break
    since = m.month
  }
  return since
}

const payee = (t) => (t.rawDesc ? cleanMerchant(t.rawDesc, t.merchantName) : t.merchant)

/** Things worth a look: categories running well above/below normal, and new regular payees. */
export function highlights(txns, { today, window = 12 }) {
  const out = []
  for (const s of categoryStats(txns, { today, window })) {
    if (s.category === 'Needs review' || s.monthlyAvg < 50 || s.change === null) continue
    const diff = s.recentAvg - s.monthlyAvg
    if (s.change >= 0.2 && diff >= 50) out.push({ type: 'up', category: s.category, recentAvg: s.recentAvg, monthlyAvg: s.monthlyAvg, change: s.change })
    if (s.change <= -0.2 && -diff >= 50) out.push({ type: 'down', category: s.category, recentAvg: s.recentAvg, monthlyAvg: s.monthlyAvg, change: s.change })
  }
  // New payees: paid at least twice in the last 90 days, never in the 12 months before
  const d90 = parseDate(today); d90.setDate(d90.getDate() - 90)
  const since = toISODate(d90)
  const before = toISODate(addMonths(parseDate(since), -12))
  const recent = new Map()
  const older = new Set()
  for (const t of txns) {
    if (spendingAmount(t) <= 0) continue
    const p = payee(t)
    if (t.date >= since && t.date <= today) {
      const r = recent.get(p) || { merchant: p, count: 0, total: 0, category: t.category }
      r.count++; r.total = round2(r.total + spendingAmount(t))
      recent.set(p, r)
    } else if (t.date >= before && t.date < since) older.add(p)
  }
  for (const r of recent.values()) if (r.count >= 2 && !older.has(r.merchant)) out.push({ type: 'new_payee', ...r })
  return out.sort((a, b) => (b.total ?? Math.abs(b.recentAvg - b.monthlyAvg)) - (a.total ?? Math.abs(a.recentAvg - a.monthlyAvg)))
}

/**
 * Money in and out between two dates:
 *   income, spending, mortgage (scheduled loan repayments), interest (part of those), debt (personal loans), leftOver
 */
export function cashflow(txns, { from, to }) {
  let income = 0, spending = 0, mortgage = 0, interest = 0, debt = 0
  for (const t of txns) {
    if (t.date < from || t.date > to) continue
    if (t.kind === 'income') income += t.amount
    else if (t.kind === 'loan_repayment' && t.amount > 0 && /^repayment\b/i.test(t.rawDesc || '')) mortgage += t.amount
    else if (t.kind === 'loan_interest') interest -= t.amount
    else if (t.kind === 'debt_repayment') debt -= t.amount
    spending += spendingAmount(t)
  }
  return {
    income: round2(income), spending: round2(spending), mortgage: round2(mortgage), interest: round2(interest), debt: round2(debt),
    leftOver: round2(income - spending - mortgage - debt)
  }
}

/** Top payees in a category between two dates. */
export function merchantsIn(txns, category, { from, to, limit = 10 }) {
  const by = new Map()
  for (const t of txns) {
    if (t.date < from || t.date > to || (t.category || 'Needs review') !== category) continue
    const amt = spendingAmount(t)
    if (!amt) continue
    const p = payee(t)
    const r = by.get(p) || { merchant: p, total: 0, count: 0 }
    r.total = round2(r.total + amt); r.count++
    by.set(p, r)
  }
  return [...by.values()].sort((a, b) => b.total - a.total).slice(0, limit)
}

/** Spending split by the account it was paid from. */
export function byAccount(txns, { from, to }) {
  const by = {}
  for (const t of txns) {
    if (t.date < from || t.date > to) continue
    const amt = spendingAmount(t)
    if (amt) by[t.accountId] = round2((by[t.accountId] || 0) + amt)
  }
  return by
}
