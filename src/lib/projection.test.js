import { test } from 'node:test'
import assert from 'node:assert/strict'
import { project, EVENT_TYPES } from './projection.js'

const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `expected ${a} ≈ ${b} (±${tol})`)

const base = () => ({
  start: '2026-12',
  cash: 10000,
  homeValue: 1000000,
  incomePerMonth: { a: 8000, b: 4000 },
  spendingPerMonth: 7000,
  loans: [{ id: 'l1', name: 'Loan', balance: 300000, rate: 0.06, repayment: 2500, offset: true }],
  debts: [{ id: 'd1', name: 'Family', balance: 10000, repayment: 500 }],
  assumptions: { salaryGrowth: 0, inflation: 0, homeGrowth: 0 },
  events: []
})

test('event types are documented', () => {
  assert.deepEqual(Object.keys(EVENT_TYPES).sort(), ['extra_repayment', 'income_change', 'leave', 'lump_sum', 'one_off', 'rate_change', 'recurring'])
})

test('baseline month: income - spending - loan - debt goes to cash; offset cuts interest', () => {
  const r = project(base(), { months: 2 })
  const m = r.months[0]
  assert.equal(m.month, '2026-12')
  assert.equal(m.income, 12000)
  assert.equal(m.spending, 7000)
  assert.equal(m.loanPayments, 2500)
  assert.equal(m.debtPayments, 500)
  near(m.cash, 10000 + 12000 - 7000 - 2500 - 500)
  // interest on (300000 - 10000 offset) at 6%
  near(m.interest, 290000 * 0.005)
  near(m.loans.l1, 300000 + 1450 - 2500)
  assert.equal(m.debts.d1, 9500)
  near(m.netWorth, m.homeValue + m.cash - m.loans.l1 - m.debts.d1)
})

test('one-off costs and windfalls; a cash shortfall is reported', () => {
  const s = base()
  s.events = [{ id: 'e1', type: 'one_off', name: 'Trip', date: '2027-02', amount: -30000 }, { id: 'e2', type: 'one_off', name: 'Bonus', date: '2027-03', amount: 5000 }]
  const r = project(s, { months: 6 })
  const feb = r.months.find(m => m.month === '2027-02')
  assert.ok(feb.cash < 0)
  assert.equal(r.lowestCash.month, '2027-02')
  assert.ok(r.warnings.some(w => w.month === '2027-02'))
  const mar = r.months.find(m => m.month === '2027-03')
  near(mar.cash - feb.cash, 12000 - 7000 - 2500 - 500 + 5000, 1)
})

test('leave and income changes are per person', () => {
  const s = base()
  s.events = [
    { id: 'e1', type: 'leave', person: 'b', date: '2027-01', endDate: '2027-03', percentOfPay: 0 },
    { id: 'e2', type: 'income_change', person: 'a', date: '2027-02', percent: 10 }
  ]
  const r = project(s, { months: 5 })
  const by = Object.fromEntries(r.months.map(m => [m.month, m.income]))
  assert.equal(by['2026-12'], 12000)
  assert.equal(by['2027-01'], 8000)
  assert.equal(by['2027-02'], 8800)
  assert.equal(by['2027-04'], 12800)
})

test('recurring costs between dates; disabled events are ignored', () => {
  const s = base()
  s.events = [
    { id: 'e1', type: 'recurring', name: 'Childcare ends', date: '2027-01', amount: 1500 },
    { id: 'e2', type: 'recurring', name: 'Gym', date: '2027-01', endDate: '2027-02', amount: -100 },
    { id: 'e3', type: 'one_off', name: 'Off', date: '2027-01', amount: -99999, enabled: false }
  ]
  const r = project(s, { months: 4 })
  const by = Object.fromEntries(r.months.map(m => [m.month, m.spending]))
  assert.equal(by['2026-12'], 7000)
  assert.equal(by['2027-01'], 7000 - 1500 + 100)
  assert.equal(by['2027-03'], 5500)
})

test('mortgage events: rate change, extra repayments, lump sum; payoff dates', () => {
  const plain = project(base(), { months: 600 })
  const s = base()
  s.events = [
    { id: 'r', type: 'rate_change', date: '2027-06', rate: 5 },
    { id: 'x', type: 'extra_repayment', date: '2027-01', amount: 500 },
    { id: 'l', type: 'lump_sum', date: '2027-12', amount: 20000 }
  ]
  const r = project(s, { months: 600 })
  assert.ok(r.payoff.l1 < plain.payoff.l1)
  const dec = r.months.find(m => m.month === '2027-12')
  const nov = r.months.find(m => m.month === '2027-11')
  assert.ok(nov.loans.l1 - dec.loans.l1 > 20000)
  assert.ok(r.debtFree <= plain.debtFree)
})

test('growth assumptions compound yearly', () => {
  const s = base()
  s.assumptions = { salaryGrowth: 0.03, inflation: 0.02, homeGrowth: 0.05 }
  const r = project(s, { months: 13 })
  const first = r.months[0]
  const year = r.months[12]
  near(year.income, first.income * 1.03, 0.5)
  near(year.spending, first.spending * 1.02, 0.5)
  near(year.homeValue, 1000000 * 1.05, 1)
})

test('yearly summary for the long view', () => {
  const r = project(base(), { months: 36 })
  assert.equal(r.years.length, 3)
  assert.equal(r.years[0].year, 2026)
  assert.ok(r.years[2].netWorth > r.years[0].netWorth)
})

test('one warning per stretch below zero, with the deepest point', () => {
  const s = base()
  s.events = [{ id: 'e1', type: 'one_off', name: 'Trip', date: '2027-02', amount: -30000 }]
  const r = project(s, { months: 24 })
  assert.equal(r.warnings.length, 1)
  const w = r.warnings[0]
  assert.equal(w.month, '2027-02')
  assert.equal(w.worstMonth, '2027-02')
  assert.ok(w.lastMonth > w.month)
  assert.ok(w.message.includes('Trip'))
})
