import { test } from 'node:test'
import assert from 'node:assert/strict'
import { importStatement, listTransactions, reviewQueue, categorise, addRule, removeRule, setAccount, spendingSummary } from './ledger.js'

const empty = { byMonth: {}, config: { accounts: [], rules: [] } }
const csv = [
  'Date,Description,Credit,Debit,Balance',
  '19/11/2026,COLES 123 - Visa Purchase - Receipt 1,,-80.00,100',
  '18/11/2026,ZZYZX THING - Visa Purchase - Receipt 2,,-20.00,180',
  '17/10/2026,ZZYZX THING - Visa Purchase - Receipt 3,,-25.00,200',
  '16/10/2026,SALARY ACME - Salary Deposit - Receipt 4,3000.00,,225'
].join('\n')

// Apply a tool result to a ledger, like writing it to Firestore would
const apply = (ledger, r) => {
  const byMonth = { ...ledger.byMonth }
  for (const [m, txns] of Object.entries(r.months)) { if (txns.length) byMonth[m] = txns; else delete byMonth[m] }
  return { byMonth, config: r.config }
}

test('import creates the account, then re-import adds nothing', () => {
  const r = importStatement(empty, csv, { filename: 'Spending.csv', account: 'Spending' })
  assert.equal(r.summary.added, 4)
  assert.equal(r.summary.needReview, 2)
  assert.equal(r.config.accounts[0].name, 'Spending')
  const l = apply(empty, r)
  const again = importStatement(l, csv, { filename: 'Spending.csv', account: 'Spending' })
  assert.equal(again.summary.added, 0)
  assert.deepEqual(again.months, {})
})

test('review, categorise with a rule, list and summarise', () => {
  let l = apply(empty, importStatement(empty, csv, { filename: 'Spending.csv', account: 'Spending' }))
  const q = reviewQueue(l)
  assert.equal(q.top[0].merchant, 'Zzyzx Thing')
  l = apply(l, categorise(l, { merchant: 'Zzyzx Thing', category: 'Gifts & donations', remember: true }))
  assert.equal(reviewQueue(l).groups, 0)
  assert.equal(l.config.rules.length, 1)
  const list = listTransactions(l, { category: 'gifts & donations' })
  assert.equal(list.count, 2)
  assert.equal(list.total, -45)
  const s = spendingSummary(l, { from: '2026-10-01', to: '2026-11-30' })
  assert.equal(s.spending, 125)
  assert.equal(s.income, 3000)
})

test('addRule / removeRule / setAccount', () => {
  let l = apply(empty, importStatement(empty, csv, { filename: 'Spending.csv', account: 'Spending' }))
  const r = addRule(l, { field: 'rawDesc', op: 'contains', value: 'zzyzx', category: 'Other' })
  assert.equal(r.summary.matched, 2)
  l = apply(l, r)
  l = apply(l, removeRule(l, r.summary.rule.id))
  assert.equal(reviewQueue(l).groups, 1)
  l = apply(l, setAccount(l, { account: 'Spending', number: '0011112222' }))
  assert.equal(l.config.accounts[0].number, '0011112222')
  assert.throws(() => setAccount(l, { account: 'Nope' }), /give its kind/)
})
