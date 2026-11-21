// Find payments that repeat on a schedule (bills, subscriptions, loan
// repayments) in imported transactions. Pure functions only.
//
// A series: {
//   key, merchant, kind, accounts, category, frequency, pattern: 'fixed'|'variable',
//   amount (typical per payment, positive), maxAmount, annual (cost over the last 12 months,
//   or projected if younger), count, first, last, nextDue, active, isBill,
//   priceChange?: { from, to, date }, paymentType: 'direct_debit'|'card'|'manual'|'loan', txIds
// }

import { diffDays, toISODate, addMonths, parseDate } from './dates.js'
import { bpayBiller, cleanMerchant } from './import/merchant.js'

// Money going out that could be a bill. Transfers, card repayments and income never are.
const OUTGOING = new Set(['spend', 'fee', 'redraw_spend', 'debt_repayment'])

const FREQS = [
  { id: 'weekly', days: 7, min: 5, max: 9, perYear: 52 },
  { id: 'fortnightly', days: 14, min: 12, max: 16, perYear: 26 },
  { id: 'monthly', days: 30.44, min: 26, max: 35, perYear: 12 },
  { id: 'bimonthly', days: 61, min: 55, max: 68, perYear: 6 },
  { id: 'quarterly', days: 91.3, min: 80, max: 102, perYear: 4 },
  { id: 'half-yearly', days: 182.6, min: 165, max: 200, perYear: 2 },
  { id: 'yearly', days: 365.25, min: 330, max: 400, perYear: 1 }
]
const FREQ = Object.fromEntries(FREQS.map(f => [f.id, f]))

// Categories where a regular payment is almost always a bill
const BILL_CATEGORIES = new Set([
  'Utilities', 'Phone & internet', 'Insurance', 'Rates & strata', 'Childcare', 'Subscriptions & media',
  'Education', 'Fitness', 'Gifts & donations', 'Health & medical', 'Car', 'Services', 'Public transport', 'Tax'
])
// …and where frequent, varying payments are everyday spending, not a bill
const HABIT_CATEGORIES = new Set([
  'Groceries', 'Cafes & coffee', 'Restaurants & takeaway', 'Fuel', 'Shopping', 'Clothing', 'Alcohol',
  'Cash', 'Entertainment', 'Personal care', 'Parking & tolls', 'Home & garden', 'Kids', 'Travel', 'Electronics'
])

const round2 = (n) => Math.round(n * 100) / 100
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function frequencyFromDays(days) {
  const f = FREQS.find(x => days >= x.min && days <= x.max)
  return f ? f.id : null
}

/** Group key: loan repayments per loan account; everything else by payee (case/digits ignored). */
const FILLER = new Set(['fee', 'fees', 'payment', 'payments', 'bill', 'pty', 'ltd', 'l', 'the', 'au', 'aus', 'australia', 'direct', 'debit', 'online', 'paymen'])

export function seriesKey(t) {
  if (t.kind === 'loan_repayment') return `loan|${t.accountId}`
  const biller = bpayBiller(t.rawDesc)
  const words = String(biller || t.merchant || '').toLowerCase().replace(/[^a-z]+/g, ' ').split(' ').filter(w => w && !FILLER.has(w))
  const key = [...new Set(words)].sort().join(' ')
  return biller ? `bpay|${key}` : key
}

/** Outgoing amount (positive) for a candidate transaction, or null if it can't be a bill. */
function outgoing(t) {
  if (OUTGOING.has(t.kind) && t.amount < 0) return -t.amount
  // A loan's "Repayment" credit is the mortgage payment; ad-hoc extra payments are labelled differently
  if (t.kind === 'loan_repayment' && t.amount > 0 && /^repayment\b/i.test(t.rawDesc || '')) return t.amount
  return null
}

function paymentTypeOf(list) {
  if (list[0].kind === 'loan_repayment') return 'loan'
  const descs = list.map(t => t.rawDesc || '').join(' ')
  if (/direct debit|bpay/i.test(descs)) return 'direct_debit'
  if (list.some(t => t.txType || /visa purchase|eftpos/i.test(t.rawDesc || ''))) return 'card'
  return 'manual'
}

function analyse(key, list, today) {
  list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  // Several payments on one day (e.g. split charges) count as one
  const days = []
  for (const t of list) {
    const amt = outgoing(t)
    const last = days[days.length - 1]
    if (last && last.date === t.date) { last.amount += amt; last.txns.push(t) } else days.push({ date: t.date, amount: amt, txns: [t] })
  }
  if (days.length < 2) return null

  const gaps = days.slice(1).map((d, i) => diffDays(days[i].date, d.date))
  const typical = median(gaps)
  const frequency = frequencyFromDays(typical)
  if (!frequency) return null
  const f = FREQ[frequency]
  const regular = gaps.filter(g => g >= f.min && g <= f.max).length / gaps.length
  const minCount = f.days >= 80 ? 2 : 3
  if (days.length < minCount || regular < 0.6) return null

  const yearAgo = toISODate(addMonths(parseDate(today), -12))
  const recent = days.filter(d => d.date > yearAgo)
  const sample = (recent.length >= 2 ? recent : days.slice(-Math.max(2, Math.min(days.length, f.perYear))))
  const amounts = sample.map(d => d.amount)
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length
  const sd = Math.sqrt(amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / amounts.length)
  const latest = days[days.length - 1]
  // Fixed if the amount barely moves, allowing for one price change in the window
  const lastThree = days.slice(-3).map(d => d.amount)
  const steadyNow = lastThree.every(a => Math.abs(a - latest.amount) <= Math.max(0.5, latest.amount * 0.02))
  const fixed = sd / mean < 0.03 || steadyNow
  // Yearly/half-yearly bills: the latest bill is the best guess at the next one (prices rise)
  const amount = round2(fixed || f.days >= 165 ? latest.amount : mean)

  let priceChange
  if (fixed) {
    const prev = [...days].reverse().find(d => Math.abs(d.amount - latest.amount) > Math.max(0.5, latest.amount * 0.02))
    if (prev && prev.date > yearAgo) priceChange = { from: round2(prev.amount), to: round2(latest.amount), date: days[days.indexOf(prev) + 1].date }
  }

  const nextDue = frequency === 'monthly' || frequency === 'bimonthly' || f.days >= 80
    ? toISODate(addMonths(parseDate(latest.date), Math.round(f.days / 30.44), parseDate(latest.date).getDate()))
    : (() => { const d = parseDate(latest.date); d.setDate(d.getDate() + f.days); return toISODate(d) })()
  const active = diffDays(latest.date, today) <= f.days * 1.6 + 7

  // Cost over the last 12 months; series younger than a year are projected
  const spentLastYear = recent.reduce((a, d) => a + d.amount, 0)
  const annual = round2(diffDays(days[0].date, today) >= 330 || recent.length >= f.perYear ? spentLastYear : amount * f.perYear)

  const category = list.map(t => t.category).filter(Boolean).sort((a, b) =>
    list.filter(t => t.category === b).length - list.filter(t => t.category === a).length)[0] || null
  const kind = list[0].kind
  const isBill = active && (
    kind === 'loan_repayment' || kind === 'debt_repayment' ||
    BILL_CATEGORIES.has(category) ||
    (fixed && !HABIT_CATEGORIES.has(category)) ||
    (fixed && f.days >= 26)
  ) && !(HABIT_CATEGORIES.has(category) && !fixed)

  return {
    key, merchant: latest.txns[0].merchant, kind,
    accounts: [...new Set(list.map(t => t.accountId))],
    category, frequency, pattern: fixed ? 'fixed' : 'variable',
    amount, maxAmount: round2(Math.max(...amounts)), annual,
    count: days.length, regularity: Math.round(regular * 100) / 100, first: days[0].date, last: latest.date, nextDue, active, isBill,
    ...(priceChange ? { priceChange } : {}),
    paymentType: paymentTypeOf(list),
    txIds: list.map(t => t.id)
  }
}

/**
 * Recurring payments in `txns`, looking back two years from `today`.
 * Returns series sorted by yearly cost, biggest first.
 */
export function detectRecurring(txns, { today, lookbackMonths = 24 } = {}) {
  const since = toISODate(addMonths(parseDate(today), -lookbackMonths))
  const groups = new Map()
  for (const raw of txns) {
    if (raw.date < since || raw.date > today || outgoing(raw) === null) continue
    // Group on a freshly cleaned payee name, so stored names from older clean-ups don't split a series
    const t = raw.rawDesc ? { ...raw, merchant: cleanMerchant(raw.rawDesc, raw.merchantName) } : raw
    const k = seriesKey(t)
    if (!k) continue
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(t)
  }
  const out = []
  for (const [k, list] of groups) {
    const s = analyse(k, list, today)
    if (s && (s.regularity >= 0.9 || (s.frequency !== 'quarterly' && s.frequency !== 'half-yearly'))) { out.push(s); continue }
    // Not regular, or an uneven quarterly rhythm: maybe several yearly bills from one payee
    // (e.g. car insurance in March, contents in December)
    const yearly = yearlyParts(k, list, today)
    if (yearly.length) out.push(...yearly)
    else if (s) out.push(s)
    else {
      const loose = unevenBill(k, list, today)
      if (loose) out.push(loose)
    }
  }
  return out.sort((a, b) => b.annual - a.annual)
}

// Bills that must be paid every year even if the timing wanders (rates paid late, early, twice…)
const CORE_BILLS = new Set(['Rates & strata', 'Insurance', 'Utilities', 'Phone & internet', 'Childcare', 'Education'])

/** A core bill paid at uneven times: cost = what was paid in the last 12 months. */
function unevenBill(k, list, today) {
  const category = list.find(t => t.category)?.category
  if (!CORE_BILLS.has(category)) return null
  const yearAgo = toISODate(addMonths(parseDate(today), -12))
  const recent = list.filter(t => t.date > yearAgo).sort((a, b) => (a.date < b.date ? -1 : 1))
  const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1))
  if (recent.length < 2 || diffDays(sorted[0].date, today) < 330) return null
  const amounts = recent.map(outgoing)
  const annual = round2(amounts.reduce((a, b) => a + b, 0))
  // Nearest schedule to the number of payments in a year
  const f = [...FREQS].sort((a, b) => Math.abs(a.perYear - recent.length) - Math.abs(b.perYear - recent.length))[0]
  const last = sorted[sorted.length - 1]
  return {
    key: k, merchant: last.merchant, kind: last.kind, accounts: [...new Set(list.map(t => t.accountId))],
    category, frequency: f.id, pattern: 'variable', unevenTiming: true,
    amount: round2(annual / f.perYear), maxAmount: round2(Math.max(...amounts)), annual,
    count: list.length, regularity: 0, first: sorted[0].date, last: last.date,
    nextDue: toISODate(addMonths(parseDate(last.date), Math.round(12 / f.perYear))),
    active: diffDays(last.date, today) <= f.days * 2.5, isBill: true,
    paymentType: paymentTypeOf(list), txIds: list.map(t => t.id)
  }
}

/**
 * Yearly bills hiding in one payee's payments. Only when the payee is paid a few
 * times a year and the yearly groups clearly differ in amount (or there's one group).
 */
function yearlyParts(k, list, today) {
  const spanYears = Math.max(1, diffDays(list.reduce((m, t) => (t.date < m ? t.date : m), list[0].date), today) / 365.25)
  const perYear = list.length / spanYears
  if (perYear > 4) return []
  const parts = splitByTimeOfYear(list)
    .map(part => analyse(`${k}#${part[0].date.slice(5, 7)}`, part, today))
    .filter(x => x && x.frequency === 'yearly' && x.maxAmount <= x.amount * 1.25 + 1)
  if (parts.length === 1) return perYear <= 1.5 ? parts : []
  if (parts.length < 2) return []
  const means = parts.map(p => p.amount)
  const avg = means.reduce((a, b) => a + b, 0) / means.length
  const spread = Math.sqrt(means.reduce((a, b) => a + (b - avg) ** 2, 0) / means.length) / avg
  return spread > 0.25 ? parts : []
}

/** Cluster payments that fall within ~25 days of the same date in different years. */
function splitByTimeOfYear(list) {
  const doy = (iso) => { const d = parseDate(iso); return Math.round((d - new Date(d.getFullYear(), 0, 1)) / 864e5) }
  const near = (a, b) => { const x = Math.abs(doy(a) - doy(b)); return Math.min(x, 365 - x) <= 25 }
  const clusters = []
  for (const t of [...list].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const c = clusters.find(c => near(c[0].date, t.date))
    if (c) c.push(t); else clusters.push([t])
  }
  return clusters.filter(c => c.length >= 2)
}

export const PER_YEAR = Object.fromEntries(FREQS.map(f => [f.id, f.perYear]))
