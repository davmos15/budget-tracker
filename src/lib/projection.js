// Month-by-month projection of cash, loans and net worth, with planned life
// events. Pure functions only.
//
// Scenario: {
//   start: 'YYYY-MM', cash, homeValue,
//   incomePerMonth: { [personId]: amount },  spendingPerMonth (excludes loan repayments),
//   loans: [{ id, name, balance, rate (0.06), repayment (per month), offset (true = cash offsets it) }],
//   debts: [{ id, name, balance, repayment }],
//   assumptions: { salaryGrowth, inflation, homeGrowth }  (yearly, 0.03 = 3%)
//   events: [Event]
// }
// Amounts on events are the effect on cash: negative = costs money, positive = brings money in.

export const EVENT_TYPES = {
  one_off: { label: 'One-off cost or windfall', fields: ['date', 'amount'], help: 'A trip (−), a bonus (+), a big purchase (−)' },
  recurring: { label: 'Ongoing change', fields: ['date', 'endDate', 'amount'], help: 'Per month from the date: a new cost (−) or a cost ending (+)' },
  income_change: { label: 'Pay change', fields: ['person', 'date', 'percent', 'amount'], help: 'A pay rise or new job, as a % and/or $ per month' },
  leave: { label: 'Time off work', fields: ['person', 'date', 'endDate', 'percentOfPay'], help: 'e.g. parental leave at 0% or 50% of pay' },
  rate_change: { label: 'Interest rate change', fields: ['loanId', 'date', 'rate'], help: 'New yearly rate in %' },
  extra_repayment: { label: 'Extra loan repayments', fields: ['loanId', 'date', 'endDate', 'amount'], help: 'Extra per month on top of the normal repayment' },
  lump_sum: { label: 'Lump sum off a loan', fields: ['loanId', 'date', 'amount'], help: 'Paid from cash straight off the loan' }
}

const round2 = (n) => Math.round(n * 100) / 100

function addMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const within = (e, month) => (!e.date || month >= e.date) && (!e.endDate || month <= e.endDate)

/**
 * Run the scenario for `months` months (stops early once everything is paid and
 * `stopWhenDebtFree` is set). Returns {
 *   months: [{ month, income, spending, loanPayments, debtPayments, interest, events, cash, loans, debts, homeValue, totalDebt, netWorth }],
 *   years: end-of-December snapshots, lowestCash, warnings, payoff: { loanId: months }, payoffDates, debtFree (months)
 * }
 */
export function project(scenario, { months = 36, stopWhenDebtFree = false } = {}) {
  const a = { salaryGrowth: 0, inflation: 0, homeGrowth: 0, ...(scenario.assumptions || {}) }
  const events = (scenario.events || []).filter(e => e.enabled !== false)
  const loans = scenario.loans.map(l => ({ ...l, bal: l.balance, rate: l.rate }))
  const debts = (scenario.debts || []).map(d => ({ ...d, bal: d.balance }))
  let cash = scenario.cash
  const out = []
  const payoff = {}
  const payoffDates = {}
  let debtFree = loans.every(l => l.bal <= 0) && debts.every(d => d.bal <= 0) ? 0 : Infinity
  const warnings = []
  let lowestCash = { month: scenario.start, amount: cash }

  // Pay per person, adjusted by pay-change events as they happen
  const pay = { ...scenario.incomePerMonth }

  for (let i = 0; i < months; i++) {
    const month = addMonth(scenario.start, i)
    const yearIdx = Math.floor(i / 12)
    const growth = (r) => Math.pow(1 + r, yearIdx)

    // --- Income
    for (const e of events) {
      if (e.type === 'income_change' && e.date === month && e.person in pay) {
        pay[e.person] = pay[e.person] * (1 + (Number(e.percent) || 0) / 100) + (Number(e.amount) || 0)
      }
    }
    let income = 0
    for (const [person, amount] of Object.entries(pay)) {
      const leave = events.find(e => e.type === 'leave' && e.person === person && within(e, month))
      income += amount * growth(a.salaryGrowth) * (leave ? (Number(leave.percentOfPay) || 0) / 100 : 1)
    }

    // --- Spending and other cash events
    let spending = scenario.spendingPerMonth * growth(a.inflation)
    let other = 0
    const happened = []
    for (const e of events) {
      if (e.type === 'recurring' && within(e, month)) { spending -= Number(e.amount) || 0 }
      if (e.type === 'one_off' && e.date === month) { other += Number(e.amount) || 0; happened.push(e.name) }
      if (e.type === 'rate_change' && e.date === month) {
        for (const l of loans) if (!e.loanId || e.loanId === l.id) l.rate = (Number(e.rate) || 0) / 100
        happened.push(e.name || `Rate → ${e.rate}%`)
      }
    }

    // --- Loans (cash in the offset reduces interest)
    let loanPayments = 0
    let interestTotal = 0
    const dearest = [...loans].filter(l => l.bal > 0).sort((x, y) => y.rate - x.rate)[0]
    for (const l of loans) {
      if (l.bal <= 0.005) { l.bal = 0; continue }
      const interest = Math.max(0, l.bal - (l.offset ? Math.max(0, cash) : 0)) * l.rate / 12
      let repay = l.repayment
      for (const e of events) {
        const target = e.loanId ? e.loanId === l.id : dearest && dearest.id === l.id
        if (e.type === 'extra_repayment' && within(e, month) && target) repay += Number(e.amount) || 0
      }
      const paid = Math.min(l.bal + interest, repay)
      l.bal = l.bal + interest - paid
      loanPayments += paid
      interestTotal += interest
      for (const e of events) {
        const target = e.loanId ? e.loanId === l.id : dearest && dearest.id === l.id
        if (e.type === 'lump_sum' && e.date === month && target) {
          const amt = Math.min(Number(e.amount) || 0, l.bal)
          l.bal -= amt
          other -= amt
          happened.push(e.name || 'Lump sum')
        }
      }
      if (l.bal <= 0.005 && payoff[l.id] === undefined) { l.bal = 0; payoff[l.id] = i + 1; payoffDates[l.id] = month }
    }

    // --- Other debts
    let debtPayments = 0
    for (const d of debts) {
      if (d.bal <= 0) continue
      const p = Math.min(d.bal, d.repayment)
      d.bal -= p
      debtPayments += p
    }

    cash += income - spending - loanPayments - debtPayments + other
    const homeValue = scenario.homeValue * Math.pow(1 + a.homeGrowth, (i + 1) / 12 >= 1 ? Math.floor((i + 1) / 12) : 0)
    const totalDebt = loans.reduce((s, l) => s + l.bal, 0) + debts.reduce((s, d) => s + d.bal, 0)
    if (debtFree === Infinity && totalDebt <= 0.01) debtFree = i + 1

    const row = {
      month,
      income: round2(income), spending: round2(spending), loanPayments: round2(loanPayments), debtPayments: round2(debtPayments),
      interest: round2(interestTotal), other: round2(other), events: happened,
      cash: round2(cash),
      loans: Object.fromEntries(loans.map(l => [l.id, round2(l.bal)])),
      debts: Object.fromEntries(debts.map(d => [d.id, round2(d.bal)])),
      homeValue: round2(homeValue), totalDebt: round2(totalDebt),
      netWorth: round2(homeValue + cash - totalDebt)
    }
    out.push(row)
    if (cash < lowestCash.amount) lowestCash = { month, amount: round2(cash) }
    // One warning per stretch below zero, with its deepest point
    if (cash < 0) {
      const w = warnings[warnings.length - 1]
      if (w && w.lastMonth === addMonth(month, -1)) {
        w.lastMonth = month
        if (cash < w.worst) { w.worst = round2(cash); w.worstMonth = month }
      } else {
        warnings.push({ month, lastMonth: month, worst: round2(cash), worstMonth: month, cause: happened.join(', ') })
      }
    }
    if (stopWhenDebtFree && debtFree !== Infinity) break
  }

  for (const l of loans) if (payoff[l.id] === undefined) payoff[l.id] = Infinity
  for (const w of warnings) {
    w.cash = w.worst
    w.message = `Cash runs out from ${w.month}${w.cause ? ` (${w.cause})` : ''}${w.lastMonth !== w.month ? ` until ${w.lastMonth}` : ''} — at worst you'd need to redraw about ${-w.worst} (${w.worstMonth}).`
  }
  return {
    months: out,
    years: out.filter(m => m.month.endsWith('-12')).map(m => ({ year: Number(m.month.slice(0, 4)), ...m })),
    lowestCash, warnings, payoff, payoffDates, debtFree
  }
}
