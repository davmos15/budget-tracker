import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyAll } from './classify.js'

const accounts = [
  { id: 'spending', name: 'Spending', kind: 'transaction', number: '11112222' },
  { id: 'bills', name: 'Bills', kind: 'offset', number: '33334444' },
  { id: 'savings', name: 'Savings', kind: 'loan' },
  { id: 'qantas', name: 'Qantas CC', kind: 'card', repaymentMatch: 'QANTAS' }
]
let n = 0
const tx = (accountId, date, amount, rawDesc, extra = {}) => ({ id: `t${++n}`, accountId, date, amount, rawDesc, ...extra })
const byId = (list) => Object.fromEntries(list.map(t => [t.id, t]))

test('receipt-matched internal transfer is a transfer on both sides', () => {
  const a = tx('spending', '2026-11-19', -50, 'Coles - Internal Transfer - Receipt 645723 Orange Everyday 0033334444')
  const b = tx('bills', '2026-11-19', 50, 'Coles - Internal Transfer - Receipt 645723 Orange Everyday 0011112222')
  const out = byId(classifyAll([a, b], accounts))
  assert.equal(out[a.id].kind, 'transfer')
  assert.equal(out[b.id].kind, 'transfer')
  assert.equal(out[a.id].transferPairId, b.id)
  assert.equal(out[b.id].transferPairId, a.id)
  assert.equal(out[a.id].label, 'Coles')
})

test('loan redraw paired into Bills is a transfer with its note; repayment into loan', () => {
  const r = tx('savings', '2026-11-10', -54, 'Depop - Receipt No 682986Transfer to 923100 33334444')
  const rb = tx('bills', '2026-11-10', 54, 'Depop - Receipt 682986 Savings 1234')
  const p = tx('savings', '2026-11-13', 864, 'Savings - Receipt No 520518From 0011112222')
  const out = byId(classifyAll([r, rb, p], accounts))
  assert.equal(out[r.id].kind, 'transfer')
  assert.equal(out[r.id].label, 'Depop')
  assert.equal(out[p.id].kind, 'loan_repayment')
})

test('unpaired loan redraw to own account is still a transfer; BPAY from loan is spending', () => {
  const r = tx('savings', '2026-11-01', -55, 'Gym signup - Receipt No 825320Transfer to 923100 33334444')
  const h = tx('savings', '2025-06-01', -4240.72, 'BPAY - TAX OFFICE PAYMENTS - HECS FINAL - Receipt No 111111')
  const i = tx('savings', '2026-10-31', -870.12, 'Interest Charge - Receipt No 902106')
  const f = tx('savings', '2025-12-23', -299, 'OA ANNUAL FEES - Receipt No 710923')
  const out = byId(classifyAll([r, h, i, f], accounts))
  assert.equal(out[r.id].kind, 'transfer')
  assert.equal(out[h.id].kind, 'redraw_spend')
  assert.equal(out[i.id].kind, 'loan_interest')
  assert.equal(out[f.id].kind, 'fee')
})

test('card repayments: unitemised before card data, ignored after', () => {
  const card = tx('qantas', '2026-05-26', -47.8, 'COLES 7757 RICHMOND VIC', { txType: 'CREDIT CARD PURCHASE' })
  const pay = tx('qantas', '2026-06-20', 900, 'PAYMENT RECEIVED THANK YOU', { txType: 'PAYMENT' })
  const before = tx('bills', '2026-04-20', -1200, 'QANTAS CC REPAYMENT - BPAY - Receipt 1')
  const after = tx('bills', '2026-06-20', -900, 'QANTAS CC REPAYMENT - BPAY - Receipt 2')
  const anz = tx('bills', '2025-03-01', -700, 'ANZ CC REPAYMENT - BPAY - Receipt 3')
  const out = byId(classifyAll([card, pay, before, after, anz], accounts))
  assert.equal(out[card.id].kind, 'spend')
  assert.equal(out[pay.id].kind, 'transfer')
  assert.equal(out[before.id].kind, 'card_unitemised')
  assert.equal(out[after.id].kind, 'cc_repayment')
  assert.equal(out[anz.id].kind, 'card_unitemised')
})

test('card refunds and fees', () => {
  const r = tx('qantas', '2026-07-01', 30, 'AMAZON REFUND', { txType: 'CREDIT CARD REFUND' })
  const f = tx('qantas', '2026-07-01', -1.02, 'INTERNATIONAL TRANSACTION FEE', { txType: 'FEES' })
  const out = byId(classifyAll([r, f], accounts))
  assert.equal(out[r.id].kind, 'refund')
  assert.equal(out[f.id].kind, 'fee')
})

test('everyday income, spending and unpaired internal transfers', () => {
  const s = tx('spending', '2026-11-01', 3200, 'SALARY ACME - Salary Deposit - Receipt 9')
  const p = tx('spending', '2026-11-02', -12.5, 'CAFE X - Visa Purchase - Receipt 10')
  const u = tx('spending', '2026-11-03', -100, 'Joint - Internal Transfer - Receipt 11 Orange Everyday 0099999999')
  const out = byId(classifyAll([s, p, u], accounts))
  assert.equal(out[s.id].kind, 'income')
  assert.equal(out[p.id].kind, 'spend')
  assert.equal(out[u.id].kind, 'transfer')
  assert.equal(out[u.id].unpaired, true)
})

test('manual kinds are kept', () => {
  const p = tx('spending', '2026-11-02', -500, 'Mum - Internal Transfer - Receipt 12 Orange Everyday 0011111111', { kind: 'spend', kindLocked: true })
  const out = byId(classifyAll([p], accounts))
  assert.equal(out[p.id].kind, 'spend')
})
