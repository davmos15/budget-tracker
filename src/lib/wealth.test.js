import { test } from 'node:test'
import assert from 'node:assert/strict'
import { homeValueOn, netWorthNow, netWorthHistory, buildScenario } from './wealth.js'
import { project } from './projection.js'

const accounts = [
  { id: 'spend', name: 'Spending', kind: 'transaction' },
  { id: 'bills', name: 'Bills', kind: 'offset' },
  { id: 'loan', name: 'Loan', kind: 'loan' },
  { id: 'card', name: 'Card', kind: 'card' }
]
const t = (accountId, date, amount, kind, balance, extra = {}) => ({ id: accountId + date + amount, accountId, date, amount, kind, balance, rawDesc: extra.rawDesc || '', ...extra })
const txns = [
  t('spend', '2026-09-15', 6000, 'income', 6500),
  t('spend', '2026-09-20', -2000, 'spend', 4500, { category: 'Groceries' }),
  t('bills', '2026-09-25', 1000, 'transfer', 3000),
  t('loan', '2026-09-30', -1500, 'loan_interest', -301500),
  t('loan', '2026-10-01', 2500, 'loan_repayment', -299000, { rawDesc: 'Repayment - Receipt 1' }),
  t('spend', '2026-10-15', 6000, 'income', 9000),
  t('spend', '2026-10-20', -2000, 'spend', 7000, { category: 'Groceries' }),
  t('loan', '2026-10-31', -1495, 'loan_interest', -300495),
  t('loan', '2026-11-01', 2500, 'loan_repayment', -297995, { rawDesc: 'Repayment - Receipt 2' }),
  t('card', '2026-11-02', -50, 'spend', undefined, { category: 'Fuel' }),
  t('spend', '2026-11-03', -350, 'debt_repayment', 6650)
].reverse()
const wealth = {
  homeValues: [{ date: '2026-01-01', value: 1000000 }, { date: '2026-11-01', value: 1100000 }],
  loans: { loan: { offsetAccountId: 'bills' } },
  debts: [{ id: 'fam', name: 'Family loan', startBalance: 10000, startDate: '2026-01-01', repayment: 350 }]
}

test('homeValueOn uses the latest value on or before the date', () => {
  assert.equal(homeValueOn(wealth.homeValues, '2026-06-01'), 1000000)
  assert.equal(homeValueOn(wealth.homeValues, '2026-11-22'), 1100000)
  assert.equal(homeValueOn(wealth.homeValues, '2025-01-01'), 1000000)
  assert.equal(homeValueOn([], '2026-01-01'), 0)
})

test('netWorthNow: home + cash − loans − other debts', () => {
  const nw = netWorthNow({ txns, accounts, wealth, today: '2026-11-22' })
  assert.equal(nw.cash, 6650 + 3000)
  assert.equal(nw.loans[0].balance, 297995)
  assert.equal(nw.debts[0].balance, 9650)
  assert.equal(nw.netWorth, 1100000 + 9650 - 297995 - 9650)
  assert.equal(nw.equity, 1100000 - 297995)
})

test('netWorthHistory by month', () => {
  const h = netWorthHistory({ txns, accounts, wealth, from: '2026-09', to: '2026-11' })
  assert.deepEqual(h.map(x => x.month), ['2026-09', '2026-10', '2026-11'])
  assert.equal(h[0].loans, 301500)
  assert.equal(h[0].cash, 4500 + 3000)
  assert.equal(h[2].debts, 9650)
  assert.equal(h[2].home, 1100000)
})

test('buildScenario uses actual income/spending and feeds the projection', () => {
  const s = buildScenario({ txns, accounts, wealth, plans: [], today: '2026-11-22', window: 2 })
  assert.equal(s.start, '2026-12')
  assert.deepEqual(s.incomePerMonth, { household: 6000 })
  assert.equal(s.spendingPerMonth, 2000)
  assert.equal(s.loans[0].offset, true)
  assert.equal(s.loans[0].repayment, 2500)
  assert.equal(s.debts[0].repayment, 350)
  const r = project(s, { months: 12 })
  assert.equal(r.months.length, 12)
  const budgetIncome = buildScenario({ txns, accounts, wealth: { ...wealth, assumptions: { incomeSource: 'budget' } }, today: '2026-11-22', window: 2,
    budget: { people: [{ id: 1, name: 'A' }], salaries: [{ personId: 1, amount: 5000, frequency: 'monthly' }] } })
  assert.deepEqual(budgetIncome.incomePerMonth, { 1: 5000 })
})

test('actual income is split between people by their budget salaries', () => {
  const s = buildScenario({ txns, accounts, wealth, today: '2026-11-22', window: 2,
    budget: { people: [{ id: 1 }, { id: 2 }], salaries: [{ personId: 1, amount: 3000, frequency: 'monthly' }, { personId: 2, amount: 1000, frequency: 'monthly' }] } })
  assert.deepEqual(s.incomePerMonth, { 1: 4500, 2: 1500 })
})
