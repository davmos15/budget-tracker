import { test } from 'node:test'
import assert from 'node:assert/strict'
import { amortise, balanceSeries, monthEndBalances, loanSummary, extraRepaymentScenario, debtBalance } from './mortgage.js'

const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `expected ${a} ≈ ${b} (±${tol})`)

test('amortise: a standard loan pays off in its term', () => {
  // $500k at 6% over 30 years → repayment ≈ $2,997.75/month
  const r = amortise({ balance: 500000, annualRate: 0.06, repayment: 2997.76 })
  assert.equal(r.months, 360)
  near(r.totalInterest, 579190, 50)
})

test('amortise: offset cuts interest, extra repayments and lump sums cut the term', () => {
  const base = amortise({ balance: 500000, annualRate: 0.06, repayment: 2997.75 })
  const off = amortise({ balance: 500000, annualRate: 0.06, repayment: 2997.75, offset: 50000 })
  assert.ok(off.months < base.months && off.totalInterest < base.totalInterest)
  const extra = amortise({ balance: 500000, annualRate: 0.06, repayment: 2997.75, extra: 500 })
  assert.ok(extra.months < 260)
  const lump = amortise({ balance: 500000, annualRate: 0.06, repayment: 2997.75, lumpSums: [{ month: 12, amount: 50000 }] })
  assert.ok(lump.months < base.months)
})

test('amortise: a repayment that never covers interest is flagged', () => {
  const r = amortise({ balance: 500000, annualRate: 0.06, repayment: 2000 })
  assert.equal(r.neverPaysOff, true)
})

const tx = (accountId, date, amount, kind, balance, rawDesc = '') => ({ id: date + amount, accountId, date, amount, kind, balance, rawDesc })

test('balance history from the export balance column (loans shown as positive owing)', () => {
  const txns = [
    tx('loan', '2026-09-30', -2800, 'loan_interest', -561000),
    tx('loan', '2026-10-01', 3580.7, 'loan_repayment', -557419.3, 'Repayment - Receipt 1'),
    tx('loan', '2026-10-31', -2900, 'loan_interest', -560319.3),
    tx('loan', '2026-11-01', 3580.7, 'loan_repayment', -556738.6, 'Repayment - Receipt 2')
  ].reverse() // stored newest first
  const s = balanceSeries(txns, 'loan')
  assert.equal(s[0].date, '2026-09-30')
  assert.equal(s[s.length - 1].balance, -556738.6)
  const m = monthEndBalances(txns, 'loan', { from: '2026-09', to: '2026-11' })
  assert.deepEqual(m, [{ month: '2026-09', balance: -561000 }, { month: '2026-10', balance: -560319.3 }, { month: '2026-11', balance: -556738.6 }])
})

test('loanSummary infers the rate from interest, and accounts for an offset', () => {
  const txns = []
  let bal = -200000
  for (let i = 0; i < 12; i++) {
    const m = String(i + 1).padStart(2, '0')
    txns.push(tx('offset', `2026-${m}-01`, 0, 'spend', 10000))
    bal += 1300
    txns.push(tx('loan', `2026-${m}-01`, 1300, 'loan_repayment', bal, 'Repayment - Receipt'))
    const interest = Math.round((-bal - 10000) * 0.06 / 12 * 100) / 100
    bal -= interest
    txns.push(tx('loan', `2026-${m}-28`, -interest, 'loan_interest', bal))
  }
  const s = loanSummary(txns.reverse(), { id: 'loan', offsetAccountId: 'offset' }, { today: '2026-12-31' })
  near(s.balance, -bal, 0.01)
  near(s.rate, 0.06, 0.002)
  assert.equal(s.repayment, 1300)
  assert.equal(s.offsetBalance, 10000)
  near(s.interestLast12, txns.filter(t => t.kind === 'loan_interest').reduce((a, t) => a - t.amount, 0), 0.01)
  near(s.offsetSavingPerYear, 600, 5)
  assert.ok(s.payoff.months > 100)
})

test('extraRepaymentScenario compares with and without extra', () => {
  const loans = [{ balance: 300000, rate: 0.06, repayment: 2000, offsetBalance: 0 }, { balance: 100000, rate: 0.065, repayment: 800, offsetBalance: 0 }]
  const r = extraRepaymentScenario(loans, { extraPerMonth: 500 })
  assert.ok(r.monthsSaved > 0)
  assert.ok(r.interestSaved > 0)
  assert.ok(r.with.months < r.without.months)
})

test('debtBalance: start minus repayments since the start date', () => {
  const txns = [
    { date: '2025-01-28', amount: -350, kind: 'debt_repayment' },
    { date: '2025-02-28', amount: -350, kind: 'debt_repayment' },
    { date: '2024-12-01', amount: -350, kind: 'debt_repayment' },
    { date: '2025-03-01', amount: -350, kind: 'spend' }
  ]
  assert.deepEqual(debtBalance(txns, { startBalance: 193200, startDate: '2025-01-01' }), { balance: 192500, repaid: 700, payments: 2, lastPayment: '2025-02-28' })
})

test('closing balance does not depend on the order of same-day transactions', () => {
  const day = [
    { accountId: 'b', date: '2026-11-19', amount: 132.85, balance: 1225.86 },
    { accountId: 'b', date: '2026-11-19', amount: 209.45, balance: 1485.31 },
    { accountId: 'b', date: '2026-11-19', amount: 50, balance: 1275.86 }
  ]
  assert.equal(balanceSeries(day, 'b')[0].balance, 1485.31)
  assert.equal(balanceSeries([...day].reverse(), 'b')[0].balance, 1485.31)
})
