import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rowsToTxns, buildLedger, groupByMonth, changedMonths, reviewGroups, needsReview, ruleFromGroup } from './ledger.js'

const accounts = [
  { id: 'spending', name: 'Spending', kind: 'transaction', number: '11112222' },
  { id: 'bills', name: 'Bills', kind: 'offset', number: '33334444' }
]
const rows = [
  { date: '2026-11-02', amount: -4.5, rawDesc: 'CAFE X - Visa Purchase - Receipt 10', balance: 100 },
  { date: '2026-11-02', amount: -4.5, rawDesc: 'CAFE X - Visa Purchase - Receipt 10', balance: 95.5 },
  { date: '2026-10-30', amount: -80, rawDesc: 'COLES 123 - Visa Purchase - Receipt 11', balance: 104.5 },
  { date: '2026-10-29', amount: -20, rawDesc: 'ZZYZX THING - Visa Purchase - Receipt 12', balance: 184.5 }
]

test('rowsToTxns gives stable ids and keeps identical rows apart', () => {
  const a = rowsToTxns(rows, 'spending')
  const b = rowsToTxns(rows, 'spending')
  assert.deepEqual(a.map(t => t.id), b.map(t => t.id))
  assert.notEqual(a[0].id, a[1].id)
  assert.equal(a[0].merchant, 'Cafe X')
  assert.equal(a[0].accountId, 'spending')
})

test('importing the same file twice adds nothing', () => {
  const first = buildLedger([], rowsToTxns(rows, 'spending'), { accounts, rules: [] })
  assert.equal(first.added, 4)
  const second = buildLedger(first.all, rowsToTxns(rows, 'spending'), { accounts, rules: [] })
  assert.equal(second.added, 0)
  assert.equal(second.duplicates, 4)
  assert.equal(second.all.length, 4)
})

test('manual edits survive a re-import', () => {
  const first = buildLedger([], rowsToTxns(rows, 'spending'), { accounts, rules: [] })
  const edited = first.all.map(t => t.merchant === 'Zzyzx Thing' ? { ...t, category: 'Gifts & donations', source: 'manual' } : t)
  const again = buildLedger(edited, rowsToTxns(rows, 'spending'), { accounts, rules: [] })
  assert.equal(again.all.find(t => t.merchant === 'Zzyzx Thing').category, 'Gifts & donations')
})

test('a later import can pair a previously unpaired transfer', () => {
  const s = rowsToTxns([{ date: '2026-11-19', amount: -50, rawDesc: 'Coles - Internal Transfer - Receipt 645723 Orange Everyday 0033334444' }], 'spending')
  const b = rowsToTxns([{ date: '2026-11-19', amount: 50, rawDesc: 'Coles - Internal Transfer - Receipt 645723 Orange Everyday 0011112222' }], 'bills')
  const one = buildLedger([], s, { accounts, rules: [] })
  assert.equal(one.all[0].unpaired, true)
  const two = buildLedger(one.all, b, { accounts, rules: [] })
  assert.ok(two.all.every(t => t.kind === 'transfer' && !t.unpaired && t.transferPairId))
})

test('groupByMonth and changedMonths', () => {
  const { all } = buildLedger([], rowsToTxns(rows, 'spending'), { accounts, rules: [] })
  const months = groupByMonth(all)
  assert.deepEqual(Object.keys(months).sort(), ['2026-10', '2026-11'])
  assert.deepEqual(changedMonths(months, all), {})
  const edited = all.map(t => t.merchant === 'Zzyzx Thing' ? { ...t, category: 'Other', source: 'manual' } : t)
  assert.deepEqual(Object.keys(changedMonths(months, edited)), ['2026-10'])
})

test('review groups: uncategorised counted transactions and unpaired transfers, by merchant', () => {
  const { all } = buildLedger([], rowsToTxns(rows, 'spending'), { accounts, rules: [] })
  assert.equal(all.filter(needsReview).length, 1)
  const groups = reviewGroups(all)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].merchant, 'Zzyzx Thing')
  assert.equal(groups[0].count, 1)
  assert.equal(groups[0].total, -20)
  assert.deepEqual(groups[0].ids.length, 1)
})

test('ruleFromGroup + rebuild categorises the group', () => {
  const { all } = buildLedger([], rowsToTxns(rows, 'spending'), { accounts, rules: [] })
  const rule = ruleFromGroup(reviewGroups(all)[0], { category: 'Gifts & donations' })
  const again = buildLedger(all, [], { accounts, rules: [rule] })
  assert.equal(again.all.find(t => t.merchant === 'Zzyzx Thing').category, 'Gifts & donations')
  assert.equal(again.all.filter(needsReview).length, 0)
})

test('guessAccount from file names', async () => {
  const { guessAccount } = await import('./ledger.js')
  assert.deepEqual(guessAccount('QantasCC.csv', 'qantas'), { id: 'qantascc', name: 'QantasCC', kind: 'card', repaymentMatch: 'QANTAS' })
  assert.equal(guessAccount('Savings (Loan).csv', 'ing').kind, 'loan')
  assert.equal(guessAccount('Bills (Offset).csv', 'ing').kind, 'offset')
  assert.equal(guessAccount('Bills (Offset).csv', 'ing').id, 'bills-offset')
  assert.equal(guessAccount('Spending.csv', 'ing').kind, 'transaction')
})

test('a remembered "transfer" answer clears unpaired transfers from review', () => {
  const s = rowsToTxns([{ date: '2026-11-03', amount: -100, rawDesc: 'Old saver - Internal Transfer - Receipt 11 Orange Everyday 0099999999' }], 'spending')
  const { all } = buildLedger([], s, { accounts, rules: [] })
  assert.equal(reviewGroups(all).length, 1)
  const rule = ruleFromGroup(reviewGroups(all)[0], { kind: 'transfer' })
  const again = buildLedger(all, [], { accounts, rules: [rule] })
  assert.equal(reviewGroups(again.all).length, 0)
  const removed = buildLedger(again.all, [], { accounts, rules: [] })
  assert.equal(reviewGroups(removed.all).length, 1)
})
