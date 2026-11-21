import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spendingAmount, monthlyTotals, categoryStats, periodFactor, highlights, cashflow, merchantsIn } from './spending.js'

const TODAY = '2026-11-21'
let n = 0
const t = (date, amount, category, extra = {}) => ({ id: `t${++n}`, accountId: 'card', date, amount, category, merchant: category + ' shop', kind: amount < 0 ? 'spend' : 'refund', ...extra })

test('spendingAmount counts spending, nets refunds, ignores transfers and income', () => {
  assert.equal(spendingAmount(t('2026-11-01', -50, 'Groceries')), 50)
  assert.equal(spendingAmount(t('2026-11-01', 10, 'Groceries')), -10)
  assert.equal(spendingAmount(t('2026-11-01', -100, null, { kind: 'transfer' })), 0)
  assert.equal(spendingAmount(t('2026-11-01', 3000, 'Income', { kind: 'income' })), 0)
  assert.equal(spendingAmount(t('2026-11-01', -500, 'Card (unitemised)', { kind: 'card_unitemised' })), 500)
  assert.equal(spendingAmount(t('2026-11-01', -350, null, { kind: 'debt_repayment' })), 0)
})

test('monthlyTotals groups spending by month and category', () => {
  const tx = [t('2026-10-03', -100, 'Groceries'), t('2026-10-20', -50, 'Groceries'), t('2026-10-21', 20, 'Groceries'), t('2026-11-02', -30, 'Fuel')]
  const m = monthlyTotals(tx, { months: 2, today: TODAY })
  assert.deepEqual(m.map(x => x.month), ['2026-10', '2026-11'])
  assert.equal(m[0].total, 130)
  assert.equal(m[0].byCategory.Groceries, 130)
  assert.equal(m[1].byCategory.Fuel, 30)
})

test('periodFactor converts a monthly figure', () => {
  assert.equal(periodFactor('monthly'), 1)
  assert.equal(periodFactor('yearly'), 12)
  assert.ok(Math.abs(periodFactor('weekly') - 12 / 52) < 1e-9)
  assert.ok(Math.abs(periodFactor('fortnightly') - 12 / 26) < 1e-9)
})

test('categoryStats: 12-month average uses complete months only, plus recent trend', () => {
  const tx = []
  // Groceries $400/month for a year, then $600 for the last 3 complete months
  for (let i = 1; i <= 12; i++) {
    const month = new Date(2026, 10 - i, 15)
    const iso = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-15`
    tx.push(t(iso, i <= 3 ? -600 : -400, 'Groceries'))
  }
  tx.push(t('2026-11-10', -999, 'Groceries')) // current month: excluded from the average
  const stats = categoryStats(tx, { today: TODAY })
  const g = stats.find(s => s.category === 'Groceries')
  assert.equal(g.monthlyAvg, 450)
  assert.equal(g.recentAvg, 600)
  assert.equal(g.thisMonth, 999)
  assert.equal(g.change, 0.33)
})

test('highlights flag categories running hot and new regular payees', () => {
  const tx = []
  for (let i = 1; i <= 12; i++) {
    const d = new Date(2026, 10 - i, 15)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`
    tx.push(t(iso, i <= 3 ? -600 : -400, 'Groceries'))
    tx.push(t(iso, -100, 'Fuel'))
  }
  for (const d of ['2026-09-02', '2026-10-02', '2026-11-02']) tx.push(t(d, -30, 'Fitness', { merchant: 'New Gym' }))
  const h = highlights(tx, { today: TODAY })
  assert.ok(h.some(x => x.type === 'up' && x.category === 'Groceries'))
  assert.ok(!h.some(x => x.category === 'Fuel'))
  assert.ok(h.some(x => x.type === 'new_payee' && x.merchant === 'New Gym'))
})

test('cashflow over a range: income, spending, mortgage, other', () => {
  const tx = [
    t('2026-10-01', 5000, 'Income', { kind: 'income' }),
    t('2026-10-02', -1000, 'Groceries'),
    t('2026-10-03', 3500, null, { kind: 'loan_repayment', rawDesc: 'Repayment - Receipt 1', accountId: 'loan' }),
    t('2026-10-04', -2900, null, { kind: 'loan_interest', accountId: 'loan' }),
    t('2026-10-05', -350, null, { kind: 'debt_repayment' }),
    t('2026-10-06', -800, null, { kind: 'transfer' })
  ]
  const c = cashflow(tx, { from: '2026-10-01', to: '2026-10-31' })
  assert.deepEqual(c, { income: 5000, spending: 1000, mortgage: 3500, interest: 2900, debt: 350, leftOver: 150 })
})

test('merchantsIn lists the top payees of a category', () => {
  const tx = [t('2026-10-01', -10, 'Groceries', { merchant: 'Coles' }), t('2026-10-02', -30, 'Groceries', { merchant: 'Woolworths' }), t('2026-10-03', -15, 'Groceries', { merchant: 'Coles' })]
  assert.deepEqual(merchantsIn(tx, 'Groceries', { from: '2026-01-01', to: TODAY }), [{ merchant: 'Woolworths', total: 30, count: 1 }, { merchant: 'Coles', total: 25, count: 2 }])
})

test('itemisedSince ignores small leftovers of unitemised card spending', async () => {
  const { itemisedSince } = await import('./spending.js')
  const tx = [
    t('2026-04-10', -2000, 'Card (unitemised)', { kind: 'card_unitemised' }), t('2026-04-11', -500, 'Groceries'),
    t('2026-06-10', -1000, 'Groceries'), t('2026-09-10', -100, 'Card (unitemised)', { kind: 'card_unitemised' }), t('2026-09-11', -1500, 'Groceries')
  ]
  assert.equal(itemisedSince(tx, { today: TODAY }), '2026-05')
  assert.equal(itemisedSince([t('2026-06-10', -10, 'Groceries')], { today: TODAY }), null)
})
