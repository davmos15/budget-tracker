import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectRecurring, frequencyFromDays, seriesKey } from './recurring.js'
import { toISODate, addMonths, parseDate } from './dates.js'

const TODAY = '2026-11-21'
let n = 0
const t = (date, amount, merchant, extra = {}) => ({ id: `t${++n}`, accountId: 'bills', date, amount, merchant, rawDesc: merchant.toUpperCase(), kind: 'spend', category: 'Utilities', ...extra })
const monthly = (merchant, amount, months = 14, day = 7, extra = {}) =>
  Array.from({ length: months }, (_, i) => t(toISODate(addMonths(parseDate('2026-11-07'), -i, day)), typeof amount === 'function' ? amount(i) : amount, merchant, extra))
const every = (days, count, merchant, amount, start = '2026-11-14', extra = {}) =>
  Array.from({ length: count }, (_, i) => { const d = parseDate(start); d.setDate(d.getDate() - i * days); return t(toISODate(d), amount, merchant, extra) })
const find = (list, merchant) => list.find(s => s.merchant === merchant)

test('frequencyFromDays', () => {
  assert.equal(frequencyFromDays(7), 'weekly')
  assert.equal(frequencyFromDays(14), 'fortnightly')
  assert.equal(frequencyFromDays(30.4), 'monthly')
  assert.equal(frequencyFromDays(91), 'quarterly')
  assert.equal(frequencyFromDays(365), 'yearly')
  assert.equal(frequencyFromDays(45), null)
})

test('fixed monthly direct debit', () => {
  const s = find(detectRecurring(monthly('Tangerine', -68.9), { today: TODAY }), 'Tangerine')
  assert.equal(s.frequency, 'monthly')
  assert.equal(s.pattern, 'fixed')
  assert.equal(s.amount, 68.9)
  assert.equal(s.active, true)
  assert.equal(s.nextDue, '2026-12-07')
  assert.ok(Math.abs(s.annual - 826.8) < 1)
  assert.equal(s.isBill, true)
})

test('variable quarterly bill uses the 12-month average and keeps the max', () => {
  const amounts = [-280, -320, -300, -400, -290, -310]
  const tx = amounts.map((a, i) => t(toISODate(addMonths(parseDate('2026-10-09'), -3 * i)), a, 'Sew Water Bill'))
  const s = find(detectRecurring(tx, { today: TODAY }), 'Sew Water Bill')
  assert.equal(s.frequency, 'quarterly')
  assert.equal(s.pattern, 'variable')
  // last 12 months = first four
  assert.equal(s.amount, 325)
  assert.equal(s.maxAmount, 400)
  assert.equal(s.annual, 1300)
})

test('fortnightly childcare and a price change', () => {
  const tx = every(14, 26, 'Only About Child', -303.82, '2026-11-18', { category: 'Childcare' })
    .map((x, i) => (i < 6 ? { ...x, amount: -320.5 } : x))
  const s = find(detectRecurring(tx, { today: TODAY }), 'Only About Child')
  assert.equal(s.frequency, 'fortnightly')
  assert.equal(s.amount, 320.5) // latest price wins for fixed bills
  assert.equal(s.pattern, 'fixed')
  assert.equal(s.priceChange.from, 303.82)
})

test('yearly bill seen twice', () => {
  const tx = [t('2026-03-03', -1010, 'Budget Direct', { category: 'Insurance' }), t('2025-03-04', -950, 'Budget Direct', { category: 'Insurance' })]
  const s = find(detectRecurring(tx, { today: TODAY }), 'Budget Direct')
  assert.equal(s.frequency, 'yearly')
  assert.equal(s.nextDue, '2027-03-03')
  assert.equal(s.amount, 1010)
})

test('stopped series are flagged inactive', () => {
  const tx = monthly('Exetel', -59.99, 10).map(x => ({ ...x, date: toISODate(addMonths(parseDate(x.date), -8)) }))
  const s = find(detectRecurring(tx, { today: TODAY }), 'Exetel')
  assert.equal(s.active, false)
})

test('frequent variable shopping is a habit, not a bill', () => {
  const tx = every(7, 50, 'Coles', -120, '2026-11-15', { category: 'Groceries' }).map((x, i) => ({ ...x, amount: -(80 + (i * 37) % 90) }))
  const s = find(detectRecurring(tx, { today: TODAY }), 'Coles')
  assert.equal(s?.isBill ?? false, false)
})

test('irregular one-offs are not recurring', () => {
  const tx = [t('2026-01-03', -40, 'Random'), t('2026-06-20', -15, 'Random'), t('2026-07-01', -99, 'Random')]
  assert.equal(find(detectRecurring(tx, { today: TODAY }), 'Random'), undefined)
})

test('loan repayments count as outgoing bills; transfers and income are ignored', () => {
  const loan = monthly('Repayment', 1153.81, 12, 1, { accountId: 'savings', kind: 'loan_repayment', category: undefined })
  const tr = monthly('Coles', -50, 12, 2, { kind: 'transfer' })
  const list = detectRecurring([...loan, ...tr], { today: TODAY })
  const s = find(list, 'Repayment')
  assert.equal(s.amount, 1153.81)
  assert.equal(s.kind, 'loan_repayment')
  assert.equal(find(list, 'Coles'), undefined)
})

test('seriesKey is stable and ignores digits/case', () => {
  assert.equal(seriesKey({ merchant: 'HCFHEALTH 123' }), seriesKey({ merchant: 'Hcfhealth' }))
})

test('grouping ignores word order/filler words and uses the BPAY biller', () => {
  assert.equal(seriesKey({ merchant: 'Owners Corp Unit 5' }), seriesKey({ merchant: 'Unit 5 Owners Corp Fees' }))
  assert.equal(
    seriesKey({ merchant: 'Glen Eira Rates', rawDesc: 'Glen Eira Rates - BPAY Bill Payment - Receipt 1 To GLEN EIRA COUN' }),
    seriesKey({ merchant: 'Glen Eira City Council', rawDesc: 'Glen Eira City Council - BPAY Bill Payment - Receipt 2 To GLEN EIRA COUN' })
  )
})

test('one payee with two different yearly bills is split by time of year', () => {
  const ins = (date, amount) => t(date, amount, 'Budget Direct', { category: 'Insurance' })
  const tx = [ins('2024-12-03', -450), ins('2025-03-10', -950), ins('2025-12-03', -489.32), ins('2026-03-10', -1001.84)]
  const list = detectRecurring(tx, { today: TODAY }).filter(s => s.merchant === 'Budget Direct')
  assert.equal(list.length, 2)
  const byMonth = Object.fromEntries(list.map(s => [s.nextDue.slice(5, 7), s]))
  assert.equal(byMonth['03'].amount, 1001.84)
  assert.equal(byMonth['03'].frequency, 'yearly')
  assert.equal(byMonth['12'].amount, 489.32)
  assert.equal(byMonth['12'].nextDue, '2026-12-03')
})

test('core bills paid at uneven times still show, from what was paid in the last year', () => {
  const r = (date, amount) => t(date, amount, 'Glen Eira Rates', { category: 'Rates & strata' })
  const tx = [r('2025-02-10', -449.55), r('2025-05-11', -449.75), r('2025-08-06', -481.45), r('2025-10-29', -481.45),
    r('2026-01-22', -481.45), r('2026-01-27', -481.45), r('2026-03-20', -481.45), r('2026-10-25', -467.3)]
  const s = find(detectRecurring(tx, { today: TODAY }), 'Glen Eira Rates')
  assert.equal(s.frequency, 'quarterly')
  assert.equal(s.unevenTiming, true)
  assert.equal(s.annual, 1911.65) // 2025-11-21 .. 2026-11-21
  assert.equal(s.isBill, true)
})

test('series group on freshly cleaned payee names', () => {
  const tx = monthly('x', -27.99, 6).map((x, i) => ({ ...x, merchant: i % 2 ? `Spotify P${i}abc123d` : 'Spotify', rawDesc: `Spotify P${i}ABC123D - Visa Purchase - Receipt ${i}`, category: 'Subscriptions & media' }))
  const list = detectRecurring(tx, { today: TODAY })
  assert.equal(list.length, 1)
  assert.equal(list[0].merchant, 'Spotify')
})
