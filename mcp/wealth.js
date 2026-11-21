// Pure helpers behind the wealth/plan tools. Same maths as the app's Wealth tab.

import { netWorthNow, loans as loanList, buildScenario, DEFAULT_ASSUMPTIONS } from '../src/lib/wealth.js'
import { project, EVENT_TYPES } from '../src/lib/projection.js'
import { itemisedSince } from '../src/lib/spending.js'
import { normalizeSalaries } from '../src/lib/migrate.js'
import { BudgetError } from './budget.js'

const allTxns = (ledger) => Object.values(ledger.byMonth).flat()
const ym = /^\d{4}-\d{2}$/

function windowMonths(txns, today) {
  const since = itemisedSince(txns, { today })
  if (!since) return 12
  const now = new Date(today)
  return Math.max(3, Math.min(12, (now.getFullYear() - Number(since.slice(0, 4))) * 12 + now.getMonth() - (Number(since.slice(5)) - 1)))
}

function scenarioFor(ledger, budget, today, events) {
  const txns = allTxns(ledger)
  return buildScenario({
    txns, accounts: ledger.config.accounts, wealth: budget.wealth || {}, plans: events ?? (budget.plans || []),
    budget: { people: budget.people || [], salaries: normalizeSalaries(budget.salaries) }, today, window: windowMonths(txns, today)
  })
}

export function wealthSummary(ledger, budget, { today }) {
  const txns = allTxns(ledger)
  const wealth = budget.wealth || {}
  const nw = netWorthNow({ txns, accounts: ledger.config.accounts, wealth, today })
  return {
    netWorth: nw.netWorth, home: nw.home, cash: nw.cash, equity: nw.equity,
    loans: loanList({ txns, accounts: ledger.config.accounts, wealth, today }).map(l => ({
      id: l.id, name: l.name, balance: l.balance, rate: l.rate, inferredRate: l.inferredRate, repayment: l.repayment,
      interestLast12: l.interestLast12, paidOffLast12: l.principalLast12, payoffDate: l.payoff.date, interestRemaining: l.payoff.totalInterest,
      offsetAccountId: l.offsetAccountId, offsetBalance: l.offsetBalance
    })),
    otherDebts: nw.debts.map(d => ({ id: d.id, name: d.name, balance: d.balance, startBalance: d.startBalance, startDate: d.startDate, repaid: d.repaid })),
    assumptions: { ...DEFAULT_ASSUMPTIONS, ...(wealth.assumptions || {}) },
    plans: budget.plans || []
  }
}

/** Projection summary: next 36 months (by quarter) plus the long view. */
export function projectionSummary(ledger, budget, { today, withPlans = true }) {
  const s = scenarioFor(ledger, budget, today, withPlans ? undefined : [])
  const r = project(s, { months: 480 })
  return {
    basis: s.basis, startCash: s.cash, incomePerMonth: s.incomePerMonth, spendingPerMonth: s.spendingPerMonth,
    lowestCash: r.lowestCash,
    warnings: r.warnings.map(w => w.message),
    payoffDates: r.payoffDates,
    next3Years: r.months.slice(0, 36).filter((_, i) => i % 3 === 2).map(m => ({ month: m.month, cash: m.cash, mortgage: Object.values(m.loans).reduce((a, b) => a + b, 0), netWorth: m.netWorth, events: m.events })),
    longView: r.years.filter((_, i) => i % 5 === 0).map(y => ({ year: y.year, mortgage: Object.values(y.loans).reduce((a, b) => a + b, 0), otherDebts: Object.values(y.debts).reduce((a, b) => a + b, 0), cash: y.cash, netWorth: y.netWorth }))
  }
}

export function setHomeValue(budget, { value, date }) {
  if (!(Number(value) > 0)) throw new BudgetError('value must be a positive number')
  const wealth = budget.wealth || {}
  const homeValues = [...(wealth.homeValues || []).filter(h => h.date !== date), { date, value: Number(value) }]
  return { update: { wealth: { ...wealth, homeValues } }, message: `Home value set to ${value} on ${date}.` }
}

export function setLoanSettings(budget, accounts, { loan, rate, repayment, offsetAccount }) {
  const a = accounts.find(x => x.kind === 'loan' && (x.id === loan || x.name.toLowerCase() === String(loan).toLowerCase()))
  if (!a) throw new BudgetError(`No loan "${loan}". Loans: ${accounts.filter(x => x.kind === 'loan').map(x => x.name).join(', ')}`)
  const wealth = budget.wealth || {}
  const cfg = { ...(wealth.loans?.[a.id] || {}) }
  if (rate !== undefined) cfg.rate = rate === null ? null : Number(rate) / 100
  if (repayment !== undefined) cfg.repayment = repayment === null ? null : Number(repayment)
  if (offsetAccount !== undefined) {
    const o = offsetAccount && accounts.find(x => x.id === offsetAccount || x.name.toLowerCase() === String(offsetAccount).toLowerCase())
    if (offsetAccount && !o) throw new BudgetError(`No account "${offsetAccount}".`)
    cfg.offsetAccountId = o ? o.id : null
  }
  return { update: { wealth: { ...wealth, loans: { ...(wealth.loans || {}), [a.id]: cfg } } }, message: `Updated ${a.name}.` }
}

export function setAssumptions(budget, patch) {
  const wealth = budget.wealth || {}
  const a = { ...(wealth.assumptions || {}) }
  for (const k of ['salaryGrowth', 'inflation', 'homeGrowth']) if (patch[k] !== undefined) a[k] = Number(patch[k]) / 100
  for (const k of ['incomePerMonth', 'spendingPerMonth']) if (patch[k] !== undefined) a[k] = patch[k] === null ? null : Number(patch[k])
  if (patch.incomeSource) a.incomeSource = patch.incomeSource
  return { update: { wealth: { ...wealth, assumptions: a } }, message: 'Assumptions updated.' }
}

function cleanEvent(e, people) {
  if (!EVENT_TYPES[e.type]) throw new BudgetError(`type must be one of ${Object.keys(EVENT_TYPES).join(', ')}`)
  if (!e.date || !ym.test(e.date)) throw new BudgetError('date must be YYYY-MM')
  if (e.endDate && !ym.test(e.endDate)) throw new BudgetError('endDate must be YYYY-MM')
  const out = { ...e }
  if (EVENT_TYPES[e.type].fields.includes('person')) {
    const p = people.find(x => String(x.id) === String(e.person) || x.name.toLowerCase() === String(e.person || '').toLowerCase())
    if (!p) throw new BudgetError(`person must be one of ${people.map(x => x.name).join(', ')}`)
    out.person = String(p.id)
  }
  for (const k of ['amount', 'percent', 'percentOfPay', 'rate']) if (out[k] !== undefined && out[k] !== null) out[k] = Number(out[k])
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined))
}

export function addPlanEvent(budget, event) {
  const e = cleanEvent({ enabled: true, ...event, id: `p${Date.now()}` }, budget.people || [])
  return { update: { plans: [...(budget.plans || []), e] }, message: `Added "${e.name || e.type}" (id ${e.id}).` }
}

export function updatePlanEvent(budget, id, patch) {
  const plans = budget.plans || []
  const cur = plans.find(p => p.id === id)
  if (!cur) throw new BudgetError(`No plan event ${id}.`)
  const e = cleanEvent({ ...cur, ...patch, id }, budget.people || [])
  return { update: { plans: plans.map(p => (p.id === id ? e : p)) }, message: `Updated "${e.name || e.type}".` }
}

export function removePlanEvent(budget, id) {
  const plans = budget.plans || []
  if (!plans.some(p => p.id === id)) throw new BudgetError(`No plan event ${id}.`)
  return { update: { plans: plans.filter(p => p.id !== id) }, message: 'Removed.' }
}
