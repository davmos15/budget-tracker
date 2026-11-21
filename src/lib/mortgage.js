// Loans and balances from imported transactions. Pure functions only.
//
// Loan balances come straight from the bank export's balance column (negative =
// owing). Rates are inferred from the interest actually charged; the user can
// override them in the Wealth tab.

import { toISODate, addMonths, parseDate, diffDays } from './dates.js'

const round2 = (n) => Math.round(n * 100) / 100

/**
 * Pay a loan down month by month.
 *   balance, annualRate, repayment (per month), offset (cash offsetting interest),
 *   extra (per month on top), lumpSums [{ month (1-based), amount }]
 * Returns { months, totalInterest, neverPaysOff, yearly: [{ year, balance }] }.
 */
export function amortise({ balance, annualRate, repayment, offset = 0, extra = 0, lumpSums = [], maxMonths = 720 }) {
  let bal = balance
  let totalInterest = 0
  const yearly = []
  const r = annualRate / 12
  for (let m = 1; m <= maxMonths; m++) {
    const interest = Math.max(0, bal - offset) * r
    const pay = Math.min(bal + interest, repayment + extra)
    if (pay <= interest + 0.005 && bal > 0.01) return { months: Infinity, totalInterest: Infinity, neverPaysOff: true, yearly }
    totalInterest += interest
    bal = bal + interest - pay
    for (const l of lumpSums) if (l.month === m) bal = Math.max(0, bal - l.amount)
    if (m % 12 === 0) yearly.push({ year: m / 12, balance: round2(bal) })
    if (bal <= 0.01) return { months: m, totalInterest: round2(totalInterest), neverPaysOff: false, yearly }
  }
  return { months: Infinity, totalInterest: round2(totalInterest), neverPaysOff: true, yearly }
}

/**
 * [{ date, balance }] for an account, oldest first, with each day's closing balance.
 * The closing balance is the one no other transaction that day started from, so the
 * order of same-day transactions doesn't matter.
 */
export function balanceSeries(txns, accountId) {
  const byDay = new Map()
  for (const t of txns) {
    if (t.accountId !== accountId || t.balance === undefined || t.balance === null) continue
    if (!byDay.has(t.date)) byDay.set(t.date, [])
    byDay.get(t.date).push(t)
  }
  const key = (n) => Math.round(n * 100)
  return [...byDay.keys()].sort().map(date => {
    const day = byDay.get(date)
    const starts = new Set(day.map(t => key(t.balance - t.amount)))
    const closing = day.filter(t => !starts.has(key(t.balance)))
    // Fall back to export order (newest first) if the chain doesn't resolve
    return { date, balance: (closing.length === 1 ? closing[0] : day[0]).balance }
  })
}

/** Balance at the end of each month (YYYY-MM) from `from` to `to`, once data exists. */
export function monthEndBalances(txns, accountId, { from, to }) {
  const s = balanceSeries(txns, accountId)
  if (!s.length) return []
  const out = []
  let i = 0
  let cur = null
  for (let d = parseDate(from + '-01'); toISODate(d).slice(0, 7) <= to; d = addMonths(d, 1)) {
    const month = toISODate(d).slice(0, 7)
    while (i < s.length && s[i].date.slice(0, 7) <= month) { cur = s[i].balance; i++ }
    if (cur !== null) out.push({ month, balance: cur })
  }
  return out
}

/** Latest known balance on or before `date`. */
export function balanceOn(series, date) {
  let cur = null
  for (const p of series) { if (p.date > date) break; cur = p.balance }
  return cur
}

/** Average daily balance between two dates (step function). */
function averageBalance(series, from, to) {
  let sum = 0
  let days = 0
  let cur = balanceOn(series, from)
  let i = series.findIndex(p => p.date > from)
  if (i < 0) i = series.length
  for (let d = parseDate(from); toISODate(d) < to; d.setDate(d.getDate() + 1)) {
    const iso = toISODate(d)
    while (i < series.length && series[i].date <= iso) { cur = series[i].balance; i++ }
    if (cur !== null) { sum += cur; days++ }
  }
  return days ? sum / days : 0
}

const isScheduledRepayment = (t) => t.kind === 'loan_repayment' && t.amount > 0 && /^repayment\b/i.test(t.rawDesc || '')

/**
 * Everything about one loan account.
 *   account: { id, offsetAccountId?, rate? (override), repayment? (override) }
 * Returns { balance (owing, positive), rate, inferredRate, repayment, interestLast12, repaidLast12,
 *           principalLast12, offsetBalance, offsetSavingPerYear, payoff: { months, date, totalInterest } }
 */
export function loanSummary(txns, account, { today }) {
  const series = balanceSeries(txns, account.id)
  const last = series[series.length - 1]
  const balance = last ? round2(-last.balance) : 0
  const yearAgo = toISODate(addMonths(parseDate(today), -12))
  const mine = txns.filter(t => t.accountId === account.id)
  const interestTx = mine.filter(t => t.kind === 'loan_interest' && t.date > yearAgo && t.date <= today)
  const interestLast12 = round2(interestTx.reduce((a, t) => a - t.amount, 0))
  const repayments = mine.filter(isScheduledRepayment).sort((a, b) => (a.date < b.date ? 1 : -1))
  const repaidLast12 = round2(repayments.filter(t => t.date > yearAgo).reduce((a, t) => a + t.amount, 0))

  const offsetSeries = account.offsetAccountId ? balanceSeries(txns, account.offsetAccountId) : []
  const offsetBalance = offsetSeries.length ? Math.max(0, offsetSeries[offsetSeries.length - 1].balance) : 0

  // Rate = interest charged ÷ average balance that interest was charged on
  let inferredRate = null
  if (interestTx.length && series.length) {
    const from = interestTx.reduce((m, t) => (t.date < m ? t.date : m), today)
    const start = toISODate(addMonths(parseDate(from), -1))
    const end = interestTx.reduce((m, t) => (t.date > m ? t.date : m), from)
    const days = Math.max(1, diffDays(start, end))
    const owing = -averageBalance(series, start, end)
    const offset = offsetSeries.length ? Math.max(0, averageBalance(offsetSeries, start, end)) : 0
    const charged = interestTx.reduce((a, t) => a - t.amount, 0)
    if (owing - offset > 0) inferredRate = Math.round((charged / (owing - offset)) * (365 / days) * 10000) / 10000
  }
  const rate = account.rate ?? inferredRate ?? 0
  const repayment = account.repayment ?? (repayments[0]?.amount || 0)
  const before = balanceOn(series, yearAgo)
  const principalLast12 = before !== null && last ? round2(last.balance - before) : null

  const plan = amortise({ balance, annualRate: rate, repayment, offset: offsetBalance })
  const payoffDate = Number.isFinite(plan.months) ? toISODate(addMonths(parseDate(today), plan.months)).slice(0, 7) : null

  return {
    id: account.id, balance, rate, inferredRate, repayment: round2(repayment),
    interestLast12, repaidLast12, principalLast12,
    offsetBalance: round2(offsetBalance), offsetSavingPerYear: round2(offsetBalance * rate),
    payoff: { months: plan.months, date: payoffDate, totalInterest: plan.totalInterest, neverPaysOff: plan.neverPaysOff }
  }
}

/** Pay several loans together; `extra` goes to the dearest loan, and freed-up repayments roll on. */
function payTogether(loans, extraPerMonth, rollover) {
  const state = loans.map(l => ({ ...l, bal: l.balance }))
  let months = 0
  let interest = 0
  while (state.some(l => l.bal > 0.01) && months < 720) {
    months++
    let pool = extraPerMonth
    if (rollover) pool += state.filter(l => l.bal <= 0.01).reduce((a, l) => a + l.repayment, 0)
    for (const l of state) {
      if (l.bal <= 0.01) continue
      const i = Math.max(0, l.bal - (l.offsetBalance || 0)) * l.rate / 12
      interest += i
      l.bal = l.bal + i - Math.min(l.bal + i, l.repayment)
    }
    for (const l of [...state].filter(x => x.bal > 0.01).sort((a, b) => b.rate - a.rate)) {
      if (pool <= 0) break
      const pay = Math.min(pool, l.bal)
      l.bal -= pay
      pool -= pay
    }
  }
  return { months, totalInterest: round2(interest) }
}

/** "Put $X more in each month": months and interest saved across all loans. */
export function extraRepaymentScenario(loans, { extraPerMonth }) {
  const without = payTogether(loans, 0, false)
  const withExtra = payTogether(loans, extraPerMonth, true)
  return {
    without, with: withExtra,
    monthsSaved: without.months - withExtra.months,
    interestSaved: round2(without.totalInterest - withExtra.totalInterest)
  }
}

/** A personal loan: what's left after the repayments made since it started. */
export function debtBalance(txns, { startBalance, startDate, kind = 'debt_repayment' }) {
  const paid = txns.filter(t => t.kind === kind && t.date >= startDate && t.amount < 0)
  const repaid = round2(paid.reduce((a, t) => a - t.amount, 0))
  return {
    balance: round2(Math.max(0, startBalance - repaid)),
    repaid,
    payments: paid.length,
    lastPayment: paid.reduce((m, t) => (t.date > m ? t.date : m), '') || null
  }
}
