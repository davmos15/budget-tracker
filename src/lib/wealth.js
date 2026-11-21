// Net worth and projection inputs from imported transactions + the Wealth
// settings saved on the budget. Pure functions only.
//
// budget.wealth = {
//   homeValues: [{ date, value }],
//   loans: { [accountId]: { rate? (0.0573), repayment?, offsetAccountId? } },
//   debts: [{ id, name, startBalance, startDate, repayment }],   // repaid via 'debt_repayment' transactions
//   assumptions: { salaryGrowth, inflation, homeGrowth, incomeSource: 'actual'|'budget', incomePerMonth?, spendingPerMonth? }
// }
// budget.plans = [projection events]

import { balanceSeries, monthEndBalances, loanSummary, debtBalance } from './mortgage.js'
import { cashflow } from './spending.js'
import { personAnnualIncome } from './finance.js'
import { toISODate, addMonths, parseDate } from './dates.js'

const round2 = (n) => Math.round(n * 100) / 100

export const DEFAULT_ASSUMPTIONS = { salaryGrowth: 0.03, inflation: 0.03, homeGrowth: 0.04, incomeSource: 'actual' }

const isCash = (a) => a.kind === 'transaction' || a.kind === 'offset'

/** Home value on a date: the latest value entered on or before it (or the first one). */
export function homeValueOn(homeValues = [], date) {
  const sorted = [...homeValues].sort((a, b) => (a.date < b.date ? -1 : 1))
  if (!sorted.length) return 0
  let v = sorted[0].value
  for (const h of sorted) { if (h.date <= date) v = h.value }
  return Number(v) || 0
}

/** Accounts with their latest balance from the imports (cards and accounts without balances are skipped). */
export function accountBalances(txns, accounts) {
  return accounts.map(a => {
    const s = balanceSeries(txns, a.id)
    const last = s[s.length - 1]
    return last ? { ...a, balance: last.balance, asOf: last.date } : null
  }).filter(Boolean)
}

/** Net worth today. */
export function netWorthNow({ txns, accounts, wealth = {}, today }) {
  const balances = accountBalances(txns, accounts)
  const cash = balances.filter(isCash).reduce((s, a) => s + Math.max(0, a.balance), 0)
  const loans = balances.filter(a => a.kind === 'loan').map(a => ({ id: a.id, name: a.name, balance: round2(-a.balance), asOf: a.asOf }))
  const debts = (wealth.debts || []).map(d => ({ ...d, ...debtBalance(txns, d) }))
  const home = homeValueOn(wealth.homeValues, today)
  const owing = loans.reduce((s, l) => s + l.balance, 0) + debts.reduce((s, d) => s + d.balance, 0)
  return {
    home, cash: round2(cash), loans, debts,
    cashAccounts: balances.filter(isCash).map(a => ({ id: a.id, name: a.name, balance: a.balance, asOf: a.asOf })),
    equity: round2(home - loans.reduce((s, l) => s + l.balance, 0)),
    netWorth: round2(home + cash - owing)
  }
}

/** Month-end net worth history from `from` (YYYY-MM) to `to`. */
export function netWorthHistory({ txns, accounts, wealth = {}, from, to }) {
  const series = accounts.map(a => ({ a, m: Object.fromEntries(monthEndBalances(txns, a.id, { from, to }).map(x => [x.month, x.balance])) }))
  const debtDefs = wealth.debts || []
  const out = []
  for (let d = parseDate(from + '-01'); toISODate(d).slice(0, 7) <= to; d = addMonths(d, 1)) {
    const month = toISODate(d).slice(0, 7)
    const end = toISODate(addMonths(d, 1)).slice(0, 7) + '-01'
    let cash = 0, loans = 0
    for (const { a, m } of series) {
      if (m[month] === undefined) continue
      if (isCash(a)) cash += Math.max(0, m[month])
      if (a.kind === 'loan') loans += -m[month]
    }
    const before = txns.filter(t => t.date < end)
    const debts = debtDefs.filter(x => x.startDate < end).reduce((s, x) => s + debtBalance(before, x).balance, 0)
    const home = homeValueOn(wealth.homeValues, end)
    out.push({ month, home, cash: round2(cash), loans: round2(loans), debts: round2(debts), netWorth: round2(home + cash - loans - debts) })
  }
  return out
}

/** Loan summaries with the user's overrides applied. */
export function loans({ txns, accounts, wealth = {}, today }) {
  return accounts.filter(a => a.kind === 'loan').map(a => ({
    name: a.name,
    ...loanSummary(txns, { id: a.id, ...(wealth.loans?.[a.id] || {}) }, { today }),
    offsetAccountId: wealth.loans?.[a.id]?.offsetAccountId || null
  }))
}

/**
 * Projection inputs from the real data. Income/spending default to what the bank shows
 * over the last `window` complete months; assumptions can override them.
 */
export function buildScenario({ txns, accounts, wealth = {}, plans = [], budget = {}, today, window = 6 }) {
  const a = { ...DEFAULT_ASSUMPTIONS, ...(wealth.assumptions || {}) }
  const now = parseDate(today)
  const range = {
    from: toISODate(addMonths(new Date(now.getFullYear(), now.getMonth(), 1), -window)),
    to: toISODate(new Date(now.getFullYear(), now.getMonth(), 0))
  }
  const flow = cashflow(txns, range)
  const nw = netWorthNow({ txns, accounts, wealth, today })

  let incomePerMonth
  if (a.incomePerMonth) incomePerMonth = { household: Number(a.incomePerMonth) }
  else if (a.incomeSource === 'budget' && budget.people?.length) {
    incomePerMonth = Object.fromEntries(budget.people.map(p => [String(p.id), round2(personAnnualIncome(p.id, budget.salaries, today) / 12)]))
  } else {
    // Actual income from the bank, split between people in line with their budget salaries
    // so per-person events (leave, pay rises) apply to the right share
    const actual = flow.income / window
    const shares = (budget.people || []).map(p => [String(p.id), personAnnualIncome(p.id, budget.salaries, today)]).filter(([, v]) => v > 0)
    const total = shares.reduce((x, [, v]) => x + v, 0)
    incomePerMonth = total > 0 ? Object.fromEntries(shares.map(([id, v]) => [id, round2(actual * v / total)])) : { household: round2(actual) }
  }

  const loanList = loans({ txns, accounts, wealth, today })
  return {
    start: toISODate(addMonths(new Date(now.getFullYear(), now.getMonth(), 1), 1)).slice(0, 7),
    cash: nw.cash,
    homeValue: nw.home,
    incomePerMonth,
    spendingPerMonth: a.spendingPerMonth ? Number(a.spendingPerMonth) : round2(flow.spending / window),
    loans: loanList.map(l => ({ id: l.id, name: l.name, balance: l.balance, rate: l.rate, repayment: l.repayment, offset: !!l.offsetAccountId })),
    debts: nw.debts.filter(d => d.balance > 0).map(d => ({ id: d.id, name: d.name, balance: d.balance, repayment: Number(d.repayment) || 0 })),
    assumptions: { salaryGrowth: a.salaryGrowth, inflation: a.inflation, homeGrowth: a.homeGrowth },
    events: plans,
    basis: { window, range, actualIncomePerMonth: round2(flow.income / window), actualSpendingPerMonth: round2(flow.spending / window) }
  }
}
