// Check the budget's bills against what the bank data shows. Pure functions only.
//
//   auditBills({ expenses, series, today, links?, dismissed? }) → {
//     items:    [{ expense, status, series?, suggestion?, score? }]   one per budget expense
//               status: ok | changed | stopped | missing | not_seen
//     newBills: [{ series, suggestion }]   recurring payments not in the budget
//     variableBuffer, totals: { budgetAnnual, suggestedAnnual, newAnnual }
//   }
// `series` come from detectRecurring(). `links` = { expenseId: seriesKey | CONFIRMED } set by hand
// (CONFIRMED = "correct as is", e.g. paid in cash or by someone else);
// `dismissed` = series keys the user said aren't bills.

import { annualAmount, isActive, itemType, isAutoPay } from './finance.js'
import { PER_YEAR } from './schedule.js'
import { toISODate, addMonths, parseDate } from './dates.js'

const OUT_KINDS = new Set(['spend', 'fee', 'redraw_spend', 'debt_repayment'])
const MONTHS_FOR = { monthly: 1, quarterly: 3, halfYearly: 6, yearly: 12 }
// One payment says something only about bills that are paid rarely
const RARE = new Set(['quarterly', 'halfYearly', 'yearly'])

function nextAfter(date, frequency) {
  if (MONTHS_FOR[frequency]) return toISODate(addMonths(parseDate(date), MONTHS_FOR[frequency], parseDate(date).getDate()))
  const d = parseDate(date)
  d.setDate(d.getDate() + ({ weekly: 7, fortnightly: 14, fourWeekly: 28 }[frequency] || 30))
  return toISODate(d)
}

/** Latest payment whose payee looks like this expense's name (for bills paid once a year). */
function lastSeenByName(expense, txns) {
  const want = words(expense.name + ' ' + (expense.company || '')).filter(w => w.length >= 4)
  if (!want.length) return null
  // "Amazon Prime" should also match "AMZNPRIMEA": compare without vowels too
  const squash = (x) => x.toLowerCase().replace(/[^a-z]/g, '')
  const novowel = (x) => x.replace(/[aeiou]/g, '')
  const hit = (t) => {
    const text = (t.merchant + ' ' + t.rawDesc).toLowerCase()
    const sq = novowel(squash(text))
    return want.every(w => text.includes(w) || sq.includes(novowel(w)))
  }
  return txns.filter(hit).sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null
}

const round2 = (n) => Math.round(n * 100) / 100

/** Link value meaning "this bill is right as it is" (paid outside the imported accounts). */
export const CONFIRMED = '__confirmed'

/** Detected frequency → a budget frequency (bimonthly becomes a half-amount monthly). */
export function toBudgetSchedule({ frequency, amount }) {
  if (frequency === 'half-yearly') return { frequency: 'halfYearly', amount }
  if (frequency === 'bimonthly') return { frequency: 'monthly', amount: round2(amount / 2) }
  return { frequency, amount }
}

// Generic budget names → what the payee/category looks like in bank data
const HINTS = [
  [/energy|electric|power/, /powershop|ovo|agl|origin|engie|energy|alinta|lumo|red energy|simply/],
  [/\bgas\b/, /gas|engie|powershop|ovo|agl|origin/],
  [/water/, /water/],
  [/internet|nbn|broadband|wifi/, /tangerine|exetel|superloop|telstra|optus|aussie|tpg|iinet|belong|internet/],
  [/phone|mobile/, /telstra|optus|vodafone|amaysim|boost|belong|lebara|felix|circles|phone/],
  [/health ins|private health|hospital cover/, /hcf|bupa|medibank|nib|health fund|ahm|hbf/],
  [/child ?care|daycare|creche|kinder|early learning/, /childcare|only about|goodstart|creche|kinder|early learning/],
  [/rates|council/, /rates|council/],
  [/owners ?corp|strata|body corp/, /owners corp|strata|body corp/],
  [/car ins|roadside|comprehensive/, /budget direct|aami|racv|nrma|allianz|youi|qbe|suncorp|gio|insurance/],
  [/contents|home ins|building ins/, /budget direct|aami|racv|nrma|allianz|youi|qbe|suncorp|gio|insurance/],
  [/\brego\b|registration/, /vicroads|rego|service nsw/],
  [/\bloan\b|mortgage/, /^loan$/],
  [/parents? loan|family loan/, /^debt_repayment$/],
  [/tzedak|charity|donation|maaser|ma'aser/, /gifts & donations|donation|charity/],
  [/gym|fitness|pilates|yoga/, /fitness|gym|pilates|yoga/],
  [/psych|therap|counsel/, /psych|therap|counsel/],
  [/medication|pharmacy|chemist/, /chemist|pharmacy|priceline/],
  [/clean/, /clean/],
  [/myki|public transport/, /myki|public transport|ptv/]
]

const words = (s) => String(s || '').toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 3)

function nameScore(expense, s) {
  const name = `${expense.name || ''} ${expense.company || ''}`.toLowerCase()
  // Fields of the series we compare against
  const target = `${s.merchant || ''} ${s.category || ''}`.toLowerCase()
  const kindish = s.kind === 'loan_repayment' ? 'loan' : s.kind
  for (const [want, have] of HINTS) {
    if (want.test(name) && (have.test(target) || have.test(kindish))) return 1
  }
  const a = new Set(words(name))
  const b = words(target)
  const overlap = b.filter(w => a.has(w) || [...a].some(x => x.length >= 4 && (w.startsWith(x) || x.startsWith(w)))).length
  return overlap ? Math.min(0.9, 0.5 + 0.2 * overlap) : 0
}

function seriesAnnual(s) {
  const { frequency, amount } = toBudgetSchedule(s)
  return amount * (PER_YEAR[frequency] || 0)
}

/** 0..1 — how likely this budget expense is this recurring payment. */
export function matchScore(expense, s) {
  const name = nameScore(expense, s)
  const a = annualAmount(expense)
  const b = seriesAnnual(s)
  const amount = a > 0 && b > 0 ? Math.min(a, b) / Math.max(a, b) : 0
  const sameFreq = toBudgetSchedule(s).frequency === expense.frequency
  if (name > 0) return 0.55 * name + 0.35 * amount + 0.1 * (sameFreq ? 1 : 0.5)
  // No name in common: only an almost identical amount on the same schedule counts
  return amount >= 0.99 && sameFreq ? 0.55 : 0.3 * amount
}

const PAYMENT_TYPE = { direct_debit: 'direct_debit', card: 'card', manual: 'manual', loan: 'direct_debit' }

function suggestionFor(s) {
  const { frequency, amount } = toBudgetSchedule(s)
  return { amount, frequency, nextDueDate: s.nextDue, paymentType: PAYMENT_TYPE[s.paymentType] || 'manual' }
}

function compare(expense, s) {
  const suggestion = suggestionFor(s)
  if (!s.active) return { status: 'stopped', suggestion }
  // Paid at uneven times (e.g. rates): only the yearly total matters
  if (s.unevenTiming) {
    const ok = Math.abs(s.annual - annualAmount(expense)) <= annualAmount(expense) * 0.03
    // Keep the budget's own schedule, with the amount that adds up to what was really paid
    const amount = round2(s.annual / (PER_YEAR[expense.frequency] || 1))
    return ok ? { status: 'ok', suggestion } : { status: 'changed', suggestion: { ...suggestion, frequency: expense.frequency, amount } }
  }
  const sameFreq = suggestion.frequency === expense.frequency
  const diff = Math.abs(suggestion.amount - Number(expense.amount || 0))
  const close = s.pattern === 'variable'
    ? Math.abs(seriesAnnual(s) - annualAmount(expense)) <= annualAmount(expense) * 0.03
    : diff <= Math.max(0.5, suggestion.amount * 0.02)
  return { status: sameFreq && close ? 'ok' : 'changed', suggestion }
}

export function auditBills({ expenses, series, today, links = {}, dismissed = [], txns = [], accounts = [] }) {
  const checked = expenses.filter(e => itemType(e) === 'expense' && isActive(e, today))
  const bySeriesKey = Object.fromEntries(series.map(s => [s.key, s]))
  const taken = new Set()
  const matchOf = {}

  // 1. Links set by hand
  for (const e of checked) {
    const s = bySeriesKey[links[e.id]]
    if (s) { matchOf[e.id] = { s, score: 1, linked: true }; taken.add(s.key) }
  }
  // 2. Best remaining pairs, highest score first
  const pairs = []
  for (const e of checked) {
    if (matchOf[e.id] || links[e.id] === CONFIRMED) continue
    for (const s of series) {
      // Only live bills are matched automatically (stopped ones can still be linked by hand)
      if (taken.has(s.key) || !s.active || !s.isBill) continue
      const score = matchScore(e, s)
      if (score >= 0.5) pairs.push({ e, s, score })
    }
  }
  pairs.sort((a, b) => b.score - a.score)
  for (const { e, s, score } of pairs) {
    if (matchOf[e.id] || taken.has(s.key)) continue
    matchOf[e.id] = { s, score }
    taken.add(s.key)
  }

  const since = toISODate(addMonths(parseDate(today), -13))
  const recentOut = txns.filter(t => t.date >= since && t.amount < 0 && OUT_KINDS.has(t.kind))
  const items = checked.map(e => {
    const m = matchOf[e.id]
    if (m) return { expense: e, series: m.s, score: round2(m.score), linked: !!m.linked, ...compare(e, m.s) }
    if (links[e.id] === CONFIRMED) return { expense: e, status: 'ok', confirmed: true }
    // Not a regular pattern: maybe paid once in the last year (yearly bills)
    const seen = RARE.has(e.frequency) ? lastSeenByName(e, recentOut) : null
    if (seen) {
      const amount = round2(-seen.amount)
      const ok = Math.abs(amount - Number(e.amount || 0)) <= Math.max(0.5, amount * 0.02)
      const lastSeen = { date: seen.date, amount, merchant: seen.merchant }
      return { expense: e, lastSeen, status: ok ? 'ok' : 'changed', suggestion: { amount, frequency: e.frequency, nextDueDate: nextAfter(seen.date, e.frequency) } }
    }
    return { expense: e, status: isAutoPay(e) && e.paymentType !== 'card' ? 'missing' : 'not_seen' }
  })

  const dismissedSet = new Set(dismissed)
  const loanAccounts = new Set(accounts.filter(a => a.kind === 'loan').map(a => a.id))
  const newBills = series
    .filter(s => s.isBill && s.active && !taken.has(s.key) && !dismissedSet.has(s.key) && seriesAnnual(s) >= 60)
    .map(s => ({
      series: s,
      suggestion: {
        name: s.merchant, ...suggestionFor(s), category: s.category || null,
        // Fees charged straight to a loan don't come out of the bills account
        fromBillsAccount: !s.accounts.every(id => loanAccounts.has(id))
      }
    }))

  let budgetAnnual = 0
  let suggestedAnnual = 0
  let variableBuffer = 0
  for (const r of items) {
    const budget = annualAmount(r.expense, today)
    budgetAnnual += budget
    if (r.series && r.status !== 'stopped') {
      suggestedAnnual += r.suggestion.amount * (PER_YEAR[r.suggestion.frequency] || 0)
      if (r.series.pattern === 'variable') variableBuffer += Math.max(0, r.series.maxAmount - r.series.amount)
    } else if (r.status !== 'stopped') suggestedAnnual += budget
  }
  const newAnnual = newBills.reduce((n, b) => n + b.suggestion.amount * (PER_YEAR[b.suggestion.frequency] || 0), 0)

  return {
    items,
    newBills,
    variableBuffer: round2(variableBuffer),
    totals: { budgetAnnual: round2(budgetAnnual), suggestedAnnual: round2(suggestedAnnual), newAnnual: round2(newAnnual) }
  }
}

/**
 * What actually went in and out of one account between two dates.
 * Returns { moneyIn, moneyOut, net, inByKind, outByKind, startBalance, endBalance }.
 */
export function billsAccountFlows(txns, accountId, { from, to }) {
  // Stored newest first (and newest first within a day, as the bank exports them)
  const list = txns.filter(t => t.accountId === accountId && t.date >= from && t.date <= to)
  const chrono = [...list].reverse().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const inByKind = {}
  const outByKind = {}
  let moneyIn = 0
  let moneyOut = 0
  for (const t of chrono) {
    if (t.amount >= 0) { moneyIn += t.amount; inByKind[t.kind] = round2((inByKind[t.kind] || 0) + t.amount) }
    else { moneyOut -= t.amount; outByKind[t.kind] = round2((outByKind[t.kind] || 0) - t.amount) }
  }
  const first = chrono.find(t => t.balance !== undefined)
  const last = [...chrono].reverse().find(t => t.balance !== undefined)
  return {
    moneyIn: round2(moneyIn),
    moneyOut: round2(moneyOut),
    net: round2(moneyIn - moneyOut),
    inByKind,
    outByKind,
    startBalance: first ? round2(first.balance - first.amount) : null,
    endBalance: last ? last.balance : null
  }
}

// Budget category for a new bill, from the bank-side category name
const BUDGET_CATEGORY_HINTS = [
  [/utilit|phone|internet/i, /utilit/i], [/insurance/i, /insur|home/i], [/rates|strata/i, /home/i],
  [/health|fitness/i, /health/i], [/childcare|kids|education/i, /kid|child|yakira/i], [/car|fuel|transport|parking/i, /car|transport/i],
  [/subscription|media|entertain/i, /subscri|entertain/i], [/fees|interest/i, /loan|fee/i]
]
function budgetCategoryId(name, categories = []) {
  if (!name) return null
  const exact = categories.find(c => c.name.toLowerCase() === name.toLowerCase())
  if (exact) return exact.id
  for (const [from, to] of BUDGET_CATEGORY_HINTS) {
    if (from.test(name)) { const c = categories.find(x => to.test(x.name)); if (c) return c.id }
  }
  const other = categories.find(c => /^other$/i.test(c.name))
  return other ? other.id : null
}

/**
 * The budget's expenses with suggestions applied (pure — nothing is saved).
 *   only:       expense ids / series keys to apply (default: all changed items and new bills)
 *   includeNew: add new bills as expenses
 */
export function applySuggestions(expenses, audit, { only = null, includeNew = true, categories = [], now = Date.now() } = {}) {
  const pick = (id) => !only || only.includes(id)
  const changes = Object.fromEntries(audit.items
    .filter(r => r.status === 'changed' && r.suggestion && pick(r.expense.id))
    .map(r => [r.expense.id, r.suggestion]))
  const next = expenses.map(e => (changes[e.id] ? { ...e, ...changes[e.id] } : e))
  if (includeNew) {
    audit.newBills.filter(b => pick(b.series.key)).forEach((b, i) => {
      const { category, ...rest } = b.suggestion
      next.push({
        itemType: 'expense', paused: false, personId: null, lastPaid: '', notes: 'Added from bank data',
        ...rest, categoryId: budgetCategoryId(category, categories), id: now + i
      })
    })
  }
  return next
}
