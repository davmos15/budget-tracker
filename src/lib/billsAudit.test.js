import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditBills, matchScore, toBudgetSchedule, billsAccountFlows } from './billsAudit.js'

const TODAY = '2026-11-21'
const series = (o) => ({
  key: o.merchant.toLowerCase(), kind: 'spend', accounts: ['bills'], pattern: 'fixed', active: true, isBill: true,
  count: 12, first: '2025-01-01', last: '2026-11-07', nextDue: '2026-12-07', paymentType: 'direct_debit',
  maxAmount: o.amount, annual: o.amount * ({ weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1 }[o.frequency]), ...o
})
const item = (o) => ({ id: o.name, itemType: 'expense', paymentType: 'direct_debit', fromBillsAccount: true, ...o })

test('toBudgetSchedule maps detected frequencies onto the budget ones', () => {
  assert.deepEqual(toBudgetSchedule({ frequency: 'half-yearly', amount: 100 }), { frequency: 'halfYearly', amount: 100 })
  assert.deepEqual(toBudgetSchedule({ frequency: 'bimonthly', amount: 120 }), { frequency: 'monthly', amount: 60 })
})

test('name hints link generic budget names to real payees', () => {
  assert.ok(matchScore(item({ name: 'Internet', amount: 68.9, frequency: 'monthly' }), series({ merchant: 'Tangerine Telecom', category: 'Phone & internet', amount: 72.9, frequency: 'monthly' })) > 0.5)
  assert.ok(matchScore(item({ name: 'Health Insurance', amount: 107.05, frequency: 'fortnightly' }), series({ merchant: 'Hcfhealth', category: 'Health & medical', amount: 107.05, frequency: 'fortnightly' })) > 0.8)
  assert.ok(matchScore(item({ name: 'Spotify', amount: 14, frequency: 'monthly' }), series({ merchant: 'Tangerine Telecom', category: 'Phone & internet', amount: 72.9, frequency: 'monthly' })) < 0.4)
})

test('audit: matched, changed, new, missing and not seen', () => {
  const items = [
    item({ name: 'Health Insurance', amount: 107.05, frequency: 'fortnightly' }),
    item({ name: 'Internet', amount: 68.9, frequency: 'monthly' }),
    item({ name: 'Netflix', amount: 25, frequency: 'monthly' }),
    item({ name: 'Rego', amount: 864.4, frequency: 'yearly', paymentType: 'manual' }),
    { id: 'sav', name: 'General', itemType: 'saving', amount: 720, frequency: 'monthly' }
  ]
  const found = [
    series({ merchant: 'Hcfhealth', category: 'Health & medical', amount: 107.05, frequency: 'fortnightly' }),
    series({ merchant: 'Tangerine Telecom', category: 'Phone & internet', amount: 72.9, frequency: 'monthly', paymentType: 'card' }),
    series({ merchant: 'Mace Fitness', category: 'Fitness', amount: 30, frequency: 'weekly' })
  ]
  const a = auditBills({ expenses: items, series: found, today: TODAY })
  const by = Object.fromEntries(a.items.map(r => [r.expense.name, r]))
  assert.equal(by['Health Insurance'].status, 'ok')
  assert.equal(by['Internet'].status, 'changed')
  assert.equal(by['Internet'].suggestion.amount, 72.9)
  assert.equal(by['Internet'].suggestion.nextDueDate, '2026-12-07')
  assert.equal(by['Netflix'].status, 'missing')
  assert.equal(by['Rego'].status, 'not_seen')
  assert.equal(by['General'], undefined) // savings aren't checked
  assert.equal(a.newBills.length, 1)
  assert.equal(a.newBills[0].series.merchant, 'Mace Fitness')
  assert.deepEqual(a.newBills[0].suggestion, { name: 'Mace Fitness', amount: 30, frequency: 'weekly', paymentType: 'direct_debit', nextDueDate: '2026-12-07', category: 'Fitness', fromBillsAccount: true })
})

test('manual links win and dismissed series are not offered again', () => {
  const items = [item({ name: 'Tzedakah', amount: 200, frequency: 'fortnightly', paymentType: 'manual' })]
  const found = [series({ merchant: 'Ma', category: 'Gifts & donations', amount: 200, frequency: 'fortnightly', paymentType: 'manual' }),
    series({ merchant: 'Paystay', category: 'Parking & tolls', amount: 10, frequency: 'quarterly' })]
  const a = auditBills({ expenses: items, series: found, today: TODAY, links: { Tzedakah: 'ma' }, dismissed: ['paystay'] })
  assert.equal(a.items[0].status, 'ok')
  assert.equal(a.items[0].series.merchant, 'Ma')
  assert.equal(a.newBills.length, 0)
})

test('variable bills: buffer covers a worse-than-average bill; totals', () => {
  const items = [item({ name: 'Water', amount: 295, frequency: 'quarterly' })]
  const found = [series({ merchant: 'Sew Water Bill', category: 'Utilities', amount: 306, maxAmount: 400, frequency: 'quarterly', pattern: 'variable' })]
  const a = auditBills({ expenses: items, series: found, today: TODAY })
  assert.equal(a.items[0].status, 'changed')
  assert.equal(a.variableBuffer, 94)
  assert.equal(a.totals.budgetAnnual, 1180)
  assert.equal(a.totals.suggestedAnnual, 1224)
})

test('billsAccountFlows sums money in and out of the bills account over a year', () => {
  const tx = [
    { accountId: 'bills', date: '2026-01-10', amount: 1000, kind: 'transfer', balance: 2000 },
    { accountId: 'bills', date: '2026-02-01', amount: -300, kind: 'spend', balance: 1700 },
    { accountId: 'bills', date: '2026-03-01', amount: -500, kind: 'cc_repayment', balance: 1200 },
    { accountId: 'bills', date: '2026-04-01', amount: 200, kind: 'refund', balance: 1400 },
    { accountId: 'spending', date: '2026-04-01', amount: -99, kind: 'spend' }
  ]
  const f = billsAccountFlows(tx, 'bills', { from: '2026-01-01', to: '2026-12-31' })
  assert.equal(f.moneyIn, 1200)
  assert.equal(f.moneyOut, 800)
  assert.equal(f.net, 400)
  assert.equal(f.outByKind.cc_repayment, 500)
  assert.equal(f.startBalance, 1000)
  assert.equal(f.endBalance, 1400)
})

test('items paid once a year are found by name in the transactions', () => {
  const items = [item({ name: 'Google One', amount: 43.99, frequency: 'yearly' }), item({ name: 'Amazon Prime', amount: 79, frequency: 'yearly' })]
  const txns = [
    { id: 'g', accountId: 'bills', date: '2026-07-07', amount: -79.99, kind: 'spend', merchant: 'Google One', rawDesc: 'Google One - Visa Purchase' },
    { id: 'a', accountId: 'spending', date: '2026-10-22', amount: -79, kind: 'spend', merchant: 'Amznprimea Amznprimea', rawDesc: 'AMZNPRIMEA* AMZNPRIMEA - Visa Purchase' }
  ]
  const a = auditBills({ expenses: items, series: [], txns, today: TODAY })
  const by = Object.fromEntries(a.items.map(r => [r.expense.name, r]))
  assert.equal(by['Google One'].status, 'changed')
  assert.equal(by['Google One'].lastSeen.amount, 79.99)
  assert.equal(by['Google One'].suggestion.amount, 79.99)
  assert.equal(by['Google One'].suggestion.nextDueDate, '2027-07-07')
  assert.equal(by['Amazon Prime'].status, 'ok')
})

test('inactive or everyday series are never matched; loan fees are not bills-account items', () => {
  const items = [item({ name: 'Rego', amount: 864.4, frequency: 'yearly', paymentType: 'manual' })]
  const found = [
    series({ merchant: 'Vic Fruit Palace', category: 'Groceries', amount: 280, frequency: 'yearly', isBill: false }),
    series({ merchant: 'Oa Annual Fee', category: 'Fees & interest', amount: 299, frequency: 'yearly', accounts: ['loan1'], kind: 'fee' }),
    series({ merchant: 'Car Wash', category: 'Car', amount: 9, frequency: 'quarterly' })
  ]
  const accounts = [{ id: 'loan1', kind: 'loan' }, { id: 'bills', kind: 'offset' }]
  const a = auditBills({ expenses: items, series: found, today: TODAY, accounts })
  assert.equal(a.items[0].status, 'not_seen')
  assert.equal(a.newBills.length, 1)
  assert.equal(a.newBills[0].suggestion.fromBillsAccount, false)
})

test('unevenly timed bills are judged on the yearly total only', () => {
  const items = [item({ name: 'Council Rates', amount: 1925.85, frequency: 'yearly', paymentType: 'manual' })]
  const found = [series({ merchant: 'Council Rates', category: 'Rates & strata', amount: 477.91, frequency: 'quarterly', pattern: 'variable', unevenTiming: true, annual: 1911.65 })]
  const a = auditBills({ expenses: items, series: found, today: TODAY })
  assert.equal(a.items[0].status, 'ok')
  const gas = auditBills({ expenses: [item({ name: 'Gas', amount: 100, frequency: 'monthly' })], series: [series({ merchant: 'Powershop', category: 'Utilities', amount: 108, frequency: 'monthly', pattern: 'variable', unevenTiming: true, annual: 1297.27 })], today: TODAY })
  assert.deepEqual([gas.items[0].suggestion.frequency, gas.items[0].suggestion.amount], ['monthly', 108.11])
})

test('bills marked correct as is are ok and not matched to anything', async () => {
  const { CONFIRMED } = await import('./billsAudit.js')
  const items = [item({ name: 'Cleaner', amount: 130, frequency: 'monthly', paymentType: 'manual' })]
  const found = [series({ merchant: 'Clean Co', category: 'Services', amount: 130, frequency: 'monthly' })]
  const a = auditBills({ expenses: items, series: found, today: TODAY, links: { Cleaner: CONFIRMED } })
  assert.equal(a.items[0].status, 'ok')
  assert.equal(a.items[0].confirmed, true)
  assert.equal(a.items[0].series, undefined)
})

test('applySuggestions updates changed items and adds new bills (nothing else touched)', async () => {
  const { applySuggestions } = await import('./billsAudit.js')
  const items = [item({ name: 'Internet', amount: 68.9, frequency: 'monthly' }), item({ name: 'Rego', amount: 864.4, frequency: 'yearly', paymentType: 'manual' })]
  const found = [series({ merchant: 'Tangerine Telecom', category: 'Phone & internet', amount: 72.9, frequency: 'monthly' }),
    series({ merchant: 'Mace Fitness', category: 'Fitness', amount: 30, frequency: 'weekly' })]
  const a = auditBills({ expenses: items, series: found, today: TODAY })
  const cats = [{ id: 4, name: 'Utilities' }, { id: 3, name: 'Health' }, { id: 6, name: 'Other' }]
  const next = applySuggestions(items, a, { categories: cats, now: 1000 })
  assert.equal(next.length, 3)
  assert.equal(next[0].amount, 72.9)
  assert.equal(next[1], items[1])
  assert.equal(next[2].name, 'Mace Fitness')
  assert.equal(next[2].categoryId, 3)
  assert.equal(next[2].id, 1000)
  const onlyInternet = applySuggestions(items, a, { only: ['Internet'], includeNew: false })
  assert.equal(onlyInternet.length, 2)
  assert.equal(onlyInternet[0].amount, 72.9)
})
