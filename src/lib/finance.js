// Core money maths. Pure functions only — no React, no Firebase — so it can
// be unit tested and every screen shows the same numbers.
//
// The bills-account model (ported from the "Overview" / "Budget" sheet):
//
//  * Every bill paid from the bills account "accrues" day by day across its
//    billing cycle. On the day it's due the full amount should be sitting in
//    the account; the day after it's paid the reserve for it starts again at 0.
//  * Automatic payments (direct debit, standing order, card) roll over on
//    their own. Manual bills only roll over when you mark them paid — if you
//    don't, the reserve keeps growing past 100% (it's overdue).
//  * "Required today" = what should already be reserved for every bill + the
//    credit-card balance + any fixed buffers, PLUS enough extra that the
//    account never falls behind before the next transfers arrive.
//  * Transfers are sized so that, over a year, money in exactly matches bills
//    out (bills per year / transfers per year).

import { parseDate, addDays, diffDays, toISODate, today as todayFn } from './dates.js'
import { PER_YEAR, rawOccurrence, indexAtOrBefore, nextOccurrence, occurrencesBetween, isValidFrequency } from './schedule.js'

export const PERIODS = ['weekly', 'fortnightly', 'monthly', 'yearly']
export const PERIOD_NOUN = { weekly: 'week', fortnightly: 'fortnight', fourWeekly: '4 weeks', monthly: 'month', quarterly: 'quarter', halfYearly: '6 months', yearly: 'year' }

export const PAYMENT_TYPES = [
  { value: 'direct_debit', label: 'Direct debit', short: 'DD', auto: true },
  { value: 'standing_order', label: 'Standing order', short: 'SO', auto: true },
  { value: 'card', label: 'Card (auto-charge)', short: 'Card', auto: true },
  { value: 'manual', label: 'Manual payment', short: 'Manual', auto: false }
]

const round2 = (n) => Math.round(n * 100) / 100

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatMoney(amount, symbol = '$', { decimals = 2, signed = false } = {}) {
  const n = Number(amount) || 0
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  // Avoid showing "-$0.00" for tiny negative rounding errors
  const isNeg = n < 0 && round2(Math.abs(n)) >= Math.pow(10, -decimals)
  if (isNeg) return `-${symbol}${abs}`
  if (signed && n > 0) return `+${symbol}${abs}`
  return `${symbol}${abs}`
}

// ---------------------------------------------------------------------------
// Items (expenses, savings, income)
// ---------------------------------------------------------------------------

export function itemType(item) {
  return item?.itemType || 'expense'
}

export function isAutoPay(item) {
  return (item?.paymentType || 'direct_debit') !== 'manual'
}

export function paymentTypeInfo(type) {
  return PAYMENT_TYPES.find(p => p.value === type) || PAYMENT_TYPES[0]
}

/** Amount in force on `date`, taking a scheduled price change into account. */
export function effectiveAmount(item, date = todayFn()) {
  const base = Number(item?.amount) || 0
  if (item?.priceChangeDate && item?.priceChangeAmount != null && item.priceChangeAmount !== '') {
    const change = parseDate(item.priceChangeDate)
    if (change && parseDate(date) >= change) return Number(item.priceChangeAmount) || 0
  }
  return base
}

/** Paused or past its end date → not costing anything right now. */
export function isActive(item, date = todayFn()) {
  if (!item || item.paused) return false
  if (item.subscriptionEndDate) {
    const end = parseDate(item.subscriptionEndDate)
    if (end && parseDate(date) > end) return false
  }
  return true
}

export function annualAmount(item, date = todayFn()) {
  if (!isActive(item, date)) return 0
  const per = PER_YEAR[item.frequency]
  if (!per) return 0
  return effectiveAmount(item, date) * per
}

/** Convert an annual figure to a per-period figure (week, fortnight, month, year...). */
export function perPeriod(annual, period) {
  return annual / (PER_YEAR[period] || 12)
}

export function amountPer(item, period, date) {
  return perPeriod(annualAmount(item, date), period)
}

/** Is this expense paid out of the shared bills account? (default yes) */
export function isBill(item) {
  return itemType(item) === 'expense' && item.fromBillsAccount !== false
}

// ---------------------------------------------------------------------------
// Bill schedule & status
// ---------------------------------------------------------------------------

/** The bill's due-date schedule, anchored at its next due date (or last paid + 1 cycle). */
export function billSchedule(bill) {
  if (!bill || !isValidFrequency(bill.frequency)) return null
  if (bill.nextDueDate && parseDate(bill.nextDueDate)) {
    return { frequency: bill.frequency, anchor: bill.nextDueDate }
  }
  if (bill.lastPaid && parseDate(bill.lastPaid)) {
    const anchor = rawOccurrence({ frequency: bill.frequency, anchor: bill.lastPaid }, 1)
    return { frequency: bill.frequency, anchor: toISODate(anchor) }
  }
  return null
}

/**
 * Where a bill is in its cycle on `date`.
 * Returns { scheduled, cycleStart, nextDue, accrued, fraction, overdue, daysOverdue,
 *           daysUntilDue, dueToday, debitedToday, amount, active }
 */
export function billStatus(bill, date = todayFn()) {
  const d = parseDate(date)
  const active = isActive(bill, d)
  const base = { active, scheduled: false, accrued: 0, fraction: 0, overdue: false, daysOverdue: 0, dueToday: false, debitedToday: false, nextDue: null, cycleStart: null, daysUntilDue: null, amount: effectiveAmount(bill, d) }
  if (!active) return base

  const sched = billSchedule(bill)
  if (!sched) {
    // No dates at all: assume we're halfway through a cycle (flagged in the UI)
    return { ...base, accrued: base.amount / 2, fraction: 0.5 }
  }

  let cycleStart, nextDue
  if (isAutoPay(bill)) {
    // Rolls forward by itself. The due day counts as paid (debit comes out that morning).
    const n = indexAtOrBefore(sched, d)
    cycleStart = rawOccurrence(sched, n)
    nextDue = rawOccurrence(sched, n + 1)
  } else {
    // Manual: stays on the stored due date until marked paid.
    nextDue = parseDate(sched.anchor)
    cycleStart = rawOccurrence(sched, -1)
  }

  const amount = effectiveAmount(bill, nextDue)
  const cycleDays = Math.max(1, diffDays(cycleStart, nextDue))
  // Manual bills paid ahead of time can go negative ("paid ahead") so that paying a
  // bill always lowers the reserve by exactly the amount paid.
  const elapsed = diffDays(cycleStart, d)
  const fraction = elapsed / cycleDays
  const daysUntilDue = diffDays(d, nextDue)

  return {
    ...base,
    scheduled: true,
    amount,
    cycleStart,
    nextDue,
    fraction,
    accrued: amount * fraction,
    daysUntilDue,
    overdue: !isAutoPay(bill) && daysUntilDue < 0,
    daysOverdue: daysUntilDue < 0 ? -daysUntilDue : 0,
    paidAhead: elapsed < 0,
    dueToday: daysUntilDue === 0,
    debitedToday: isAutoPay(bill) && diffDays(cycleStart, d) === 0
  }
}

/**
 * Total amount a bill accrues between two dates (used for projections).
 * Ignores payments — it's the steady build-up of what needs setting aside.
 */
export function accrualBetween(bill, from, to) {
  if (!isActive(bill, from)) return 0
  const sched = billSchedule(bill)
  const a = parseDate(from)
  const b = parseDate(to)
  if (b <= a) return 0
  if (!sched) return annualAmount(bill, a) * diffDays(a, b) / 365.25
  const amount = effectiveAmount(bill, a)
  const cum = (date) => {
    const n = indexAtOrBefore(sched, date)
    const s = rawOccurrence(sched, n)
    const e = rawOccurrence(sched, n + 1)
    return n + diffDays(s, date) / Math.max(1, diffDays(s, e))
  }
  return amount * (cum(b) - cum(a))
}

/** New field values after paying a manual bill once. */
export function markBillPaid(bill, paidDate = todayFn()) {
  const sched = billSchedule(bill)
  const paid = toISODate(paidDate)
  if (!sched) {
    const next = rawOccurrence({ frequency: bill.frequency, anchor: paid }, 1)
    return { lastPaid: paid, nextDueDate: toISODate(next) }
  }
  if (isAutoPay(bill)) {
    // Auto bills roll themselves; just record when it was paid and normalise the anchor.
    return { lastPaid: paid, nextDueDate: toISODate(billStatus(bill, paidDate).nextDue) }
  }
  return { lastPaid: paid, nextDueDate: toISODate(rawOccurrence(sched, 1)) }
}

// ---------------------------------------------------------------------------
// Income & transfer plan
// ---------------------------------------------------------------------------

export function personAnnualIncome(personId, salaries, date) {
  return (salaries || []).filter(s => s.personId === personId).reduce((sum, s) => sum + annualAmount(s, date), 0)
}

/** The schedule a person's main (largest) income is paid on, if any. */
export function primaryPaySchedule(personId, salaries) {
  const own = (salaries || [])
    .filter(s => s.personId === personId && s.schedule && parseDate(s.schedule.anchor))
    .sort((a, b) => annualAmount(b) - annualAmount(a))
  return own[0]?.schedule || null
}

/** The schedule a person's bills transfer happens on. */
export function transferSchedule(personId, settings, salaries) {
  const ps = settings?.peopleTransferSettings?.[personId]
  const fromPay = primaryPaySchedule(personId, salaries)
  if (ps?.followsPay !== false && fromPay) return fromPay
  if (ps?.schedule && parseDate(ps.schedule.anchor)) return ps.schedule
  return fromPay
}

/**
 * Does it matter who each bill belongs to? Only when bills are split by owner,
 * or the user has asked to keep assigning them anyway.
 */
export function billOwnersMatter(settings, people) {
  if (!people || people.length < 2) return false
  const method = settings?.transferSplit || 'income'
  return method === 'owner' || settings?.assignBillsToPeople === true
}

export const SPLIT_METHODS = [
  { value: 'income', label: 'In proportion to income', help: 'Each person covers bills in proportion to what they earn.' },
  { value: 'equal', label: 'Split equally', help: 'Everyone puts in the same share.' },
  { value: 'owner', label: 'Each covers their own bills', help: 'Each person covers the bills assigned to them (shared bills are split equally).' },
  { value: 'custom', label: 'Set amounts + top-up', help: 'Some people put in a fixed amount or a % of their pay; whoever is marked "tops up" covers the rest.' }
]

/**
 * How much each person should transfer into the bills account.
 * Returns { annualNeeded, people: { [id]: { annual, perTransfer, schedule, frequency, nextDate } }, shortfallAnnual }
 */
export function transferPlan({ expenses, people, salaries, settings, date = todayFn() }) {
  const bills = (expenses || []).filter(isBill)
  const annualNeeded = bills.reduce((s, b) => s + annualAmount(b, date), 0)
  const method = settings?.transferSplit || (people?.length > 1 ? 'income' : 'equal')
  const ids = (people || []).map(p => p.id)
  const annual = Object.fromEntries(ids.map(id => [id, 0]))

  if (ids.length === 0) return { annualNeeded, method, people: {}, shortfallAnnual: annualNeeded }

  if (method === 'owner') {
    let shared = 0
    bills.forEach(b => {
      const a = annualAmount(b, date)
      if (annual[b.personId] !== undefined) annual[b.personId] += a
      else shared += a
    })
    ids.forEach(id => { annual[id] += shared / ids.length })
  } else if (method === 'income') {
    const incomes = Object.fromEntries(ids.map(id => [id, personAnnualIncome(id, salaries, date)]))
    const total = Object.values(incomes).reduce((s, v) => s + v, 0)
    ids.forEach(id => { annual[id] = total > 0 ? annualNeeded * incomes[id] / total : annualNeeded / ids.length })
  } else if (method === 'custom') {
    const pts = settings?.peopleTransferSettings || {}
    const toppers = ids.filter(id => pts[id]?.topUp)
    let fixedTotal = 0
    ids.forEach(id => {
      if (toppers.includes(id)) return
      if (pts[id]?.amountType === 'percent') {
        // A share of take-home pay, e.g. 100% = the whole salary goes to bills
        const pct = Math.max(0, Number(pts[id]?.percentOfIncome) || 0)
        annual[id] = personAnnualIncome(id, salaries, date) * pct / 100
      } else {
        const sched = transferSchedule(id, settings, salaries)
        const per = sched ? PER_YEAR[sched.frequency] : 0
        annual[id] = (Number(pts[id]?.fixedAmount) || 0) * per
      }
      fixedTotal += annual[id]
    })
    const remainder = Math.max(0, annualNeeded - fixedTotal)
    toppers.forEach(id => { annual[id] = remainder / toppers.length })
  } else {
    ids.forEach(id => { annual[id] = annualNeeded / ids.length })
  }

  const out = {}
  let covered = 0
  ids.forEach(id => {
    const schedule = transferSchedule(id, settings, salaries)
    const per = schedule ? PER_YEAR[schedule.frequency] : 0
    const contributes = per > 0
    if (contributes) covered += annual[id]
    out[id] = {
      annual: annual[id],
      perTransfer: per ? annual[id] / per : 0,
      schedule,
      frequency: schedule?.frequency || null,
      nextDate: schedule ? nextOccurrence(schedule, date) : null,
      missingSchedule: !schedule
    }
  })

  return { annualNeeded, method, people: out, shortfallAnnual: Math.max(0, annualNeeded - covered) }
}

// ---------------------------------------------------------------------------
// Bills account snapshot & projection
// ---------------------------------------------------------------------------

function transferEvents(plan, from, to) {
  const events = []
  Object.entries(plan.people).forEach(([id, p]) => {
    if (!p.schedule || p.perTransfer <= 0) return
    occurrencesBetween(p.schedule, from, to).forEach(d => events.push({ date: d, personId: id, amount: p.perTransfer }))
  })
  return events.sort((a, b) => a.date - b.date)
}

/** Bill payments expected in (from, to]. Overdue manual bills are assumed paid on `from`. */
function paymentEvents(bills, from, to) {
  const d = parseDate(from)
  const end = parseDate(to)
  const payments = []
  bills.filter(b => isActive(b, d)).forEach(b => {
    const sched = billSchedule(b)
    if (!sched) return
    if (isAutoPay(b)) {
      occurrencesBetween(sched, d, end).forEach(due => payments.push({ date: due, amount: effectiveAmount(b, due), bill: b }))
      return
    }
    const st = billStatus(b, d)
    if (st.nextDue <= end) payments.push({ date: st.nextDue < d ? d : st.nextDue, amount: st.amount, bill: b })
    for (let n = 1; n < 400; n++) {
      const due = rawOccurrence(sched, n)
      if (due > end) break
      if (due > d) payments.push({ date: due, amount: effectiveAmount(b, due), bill: b })
    }
  })
  return payments.sort((a, b) => a.date - b.date)
}

/**
 * Everything the Bills screen needs. "Required today" follows the sheet:
 *
 *   required = set aside so far (bills + card + buffers)
 *            + what bills will build up between now and the checkpoint
 *            − transfers that land by the checkpoint
 *
 * The checkpoint is the day by which everyone has made their next transfer
 * (e.g. the next monthly payday). If the balance covers `required` today, the
 * account will be fully set aside for every bill once those transfers land.
 *
 * It is never less than the cash needed to pay the bills (and the card) that
 * fall due before the transfers arrive (`cashNeed`).
 *
 * Returns { reserve, accruedBills, staticTotal, cardOwing, checkpoint, buildUp,
 *           incoming, cashNeed, required, balance, surplus, transfers, bills, plan }
 */
export function billsSnapshot({ expenses, people, salaries, settings, staticAmounts, balance, cardOwing, date = todayFn() }) {
  const d = parseDate(date)
  const bills = (expenses || []).filter(isBill)
  const statuses = bills.map(b => ({ bill: b, status: billStatus(b, d) }))
  const accruedBills = statuses.reduce((s, x) => s + x.status.accrued, 0)
  const staticTotal = (staticAmounts || []).reduce((s, x) => s + (Number(x.amount) || 0), 0)
  const card = Number(cardOwing) || 0
  const reserve = accruedBills + staticTotal + card

  const plan = transferPlan({ expenses, people, salaries, settings, date: d })

  let checkpoint = null
  Object.values(plan.people).forEach(p => {
    if (!p.nextDate || p.perTransfer <= 0) return
    if (!checkpoint || p.nextDate > checkpoint) checkpoint = p.nextDate
  })

  const transfers = checkpoint ? transferEvents(plan, d, checkpoint) : []
  const incoming = transfers.reduce((s, e) => s + e.amount, 0)
  const buildUp = checkpoint ? bills.reduce((s, b) => s + accrualBetween(b, d, checkpoint), 0) : 0
  const onTrack = reserve + buildUp - incoming

  // Cash floor: bills due before the transfers land must be payable from today's balance.
  let cashNeed = card
  if (checkpoint) {
    const pays = paymentEvents(bills, d, checkpoint)
    let paid = 0
    pays.forEach(p => {
      paid += p.amount
      const arrived = transfers.filter(t => t.date < p.date).reduce((s, t) => s + t.amount, 0)
      cashNeed = Math.max(cashNeed, card + paid - arrived)
    })
  }

  const required = Math.max(0, onTrack, cashNeed)
  const bal = balance === null || balance === undefined || balance === '' ? null : Number(balance)

  return {
    reserve,
    accruedBills,
    staticTotal,
    cardOwing: card,
    checkpoint,
    buildUp,
    incoming,
    onTrack,
    cashNeed,
    required,
    balance: bal,
    surplus: bal === null || isNaN(bal) ? null : bal - required,
    transfers,
    bills: statuses,
    plan
  }
}

/**
 * Day-by-day forecast of the bills account for charts.
 * balance: projected cash (transfers in, bills out on due dates)
 * reserve: what should be set aside on that day
 */
export function forecast({ expenses, people, salaries, settings, staticAmounts, balance, cardOwing, date = todayFn(), days = 60 }) {
  const d = parseDate(date)
  const end = addDays(d, days)
  const snap = billsSnapshot({ expenses, people, salaries, settings, staticAmounts, balance, cardOwing, date: d })
  const bills = (expenses || []).filter(isBill).filter(b => isActive(b, d))
  const events = transferEvents(snap.plan, d, end)

  const payments = paymentEvents(bills, d, end)

  const start = snap.balance ?? snap.required
  const series = []
  let inSum = 0
  let paySum = 0
  for (let k = 0; k <= days; k++) {
    const day = addDays(d, k)
    inSum += events.filter(e => +e.date === +day).reduce((s, e) => s + e.amount, 0)
    paySum += payments.filter(p => +p.date === +day).reduce((s, p) => s + p.amount, 0)
    const reserve = snap.reserve + bills.reduce((s, b) => s + accrualBetween(b, d, day), 0) - paySum
    series.push({ date: toISODate(day), balance: round2(start + inSum - paySum), reserve: round2(Math.max(0, reserve)) })
  }
  const lowest = series.reduce((m, p) => (p.balance < m.balance ? p : m), series[0])
  return { series, lowest, payments, transfers: events, startAssumed: snap.balance === null }
}
