import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setHomeValue, setLoanSettings, setAssumptions, addPlanEvent, updatePlanEvent, removePlanEvent, wealthSummary, projectionSummary } from './wealth.js'

const accounts = [{ id: 'loan', name: 'Home Loan', kind: 'loan' }, { id: 'off', name: 'Offset', kind: 'offset' }]
const budget = { people: [{ id: 1, name: 'Alex' }, { id: 2, name: 'Sam' }], salaries: [], wealth: {}, plans: [] }
const ledger = {
  config: { accounts },
  byMonth: {
    '2026-10': [
      { id: 'a', accountId: 'loan', date: '2026-10-01', amount: 2000, kind: 'loan_repayment', rawDesc: 'Repayment', balance: -300000 },
      { id: 'b', accountId: 'loan', date: '2026-10-31', amount: -1400, kind: 'loan_interest', balance: -301400 },
      { id: 'c', accountId: 'off', date: '2026-10-15', amount: 5000, kind: 'income', balance: 5000 }
    ]
  }
}

test('home value, loan settings and assumptions', () => {
  assert.deepEqual(setHomeValue(budget, { value: 1100000, date: '2026-11-22' }).update.wealth.homeValues, [{ date: '2026-11-22', value: 1100000 }])
  assert.throws(() => setHomeValue(budget, { value: -1, date: '2026-11-22' }))
  const l = setLoanSettings(budget, accounts, { loan: 'home loan', rate: 5.5, offsetAccount: 'Offset' }).update.wealth.loans.loan
  assert.deepEqual(l, { rate: 0.055, offsetAccountId: 'off' })
  assert.equal(setAssumptions(budget, { homeGrowth: 4, spendingPerMonth: 9000 }).update.wealth.assumptions.homeGrowth, 0.04)
})

test('plan events are validated, people resolved by name', () => {
  const add = addPlanEvent(budget, { type: 'leave', name: 'Leave', person: 'sam', date: '2027-03', endDate: '2027-08', percentOfPay: 0 })
  const e = add.update.plans[0]
  assert.equal(e.person, '2')
  assert.equal(e.enabled, true)
  assert.throws(() => addPlanEvent(budget, { type: 'trip', date: '2027-01' }), /type must be/)
  assert.throws(() => addPlanEvent(budget, { type: 'one_off', date: '2027' }), /YYYY-MM/)
  const b2 = { ...budget, plans: [e] }
  assert.equal(updatePlanEvent(b2, e.id, { percentOfPay: 50 }).update.plans[0].percentOfPay, 50)
  assert.equal(removePlanEvent(b2, e.id).update.plans.length, 0)
})

test('summaries run on a small ledger', () => {
  const w = wealthSummary(ledger, { ...budget, wealth: { homeValues: [{ date: '2026-01-01', value: 900000 }] } }, { today: '2026-11-22' })
  assert.equal(w.loans[0].balance, 301400)
  assert.equal(w.netWorth, 900000 + 5000 - 301400)
  const p = projectionSummary(ledger, budget, { today: '2026-11-22' })
  assert.equal(p.next3Years.length, 12)
})
