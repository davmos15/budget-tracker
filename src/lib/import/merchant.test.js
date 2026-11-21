import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractReceipt, extractCounterparty, transferLabel, cleanMerchant } from './merchant.js'

test('ING internal transfer', () => {
  const d = 'Coles - Internal Transfer - Receipt 645723 Orange Everyday 0011112222'
  assert.equal(extractReceipt(d), '645723')
  assert.equal(extractCounterparty(d), '11112222')
  assert.equal(transferLabel(d), 'Coles')
})

test('loan redraw and repayment', () => {
  const d = 'Physio appt - Receipt No 854768Transfer to 923100 33334444'
  assert.equal(extractReceipt(d), '854768')
  assert.equal(extractCounterparty(d), '33334444')
  assert.equal(transferLabel(d), 'Physio appt')
  const r = 'Emergency - Receipt No 520703From 0011112222'
  assert.equal(extractCounterparty(r), '11112222')
  assert.equal(transferLabel(r), 'Emergency')
})

test('no counterparty in ordinary purchases', () => {
  assert.equal(extractCounterparty('EXETEL - Direct Debit - Receipt 158105 410253'), null)
  assert.equal(extractReceipt('Interest Charge - Receipt No 902106'), '902106')
})

test('cleanMerchant for ING descriptions', () => {
  assert.equal(cleanMerchant('EXETEL - Direct Debit - Receipt 158105 410253'), 'Exetel')
  assert.equal(cleanMerchant('MCARE BENEFITS   123456789 CYWQ  - Receipt 120199'), 'Mcare Benefits Cywq')
  assert.equal(cleanMerchant('CORNER STORE PTY L - Visa Purchase - Receipt 122968In CARLTON Date 20 Nov 2019 Card 400000xxxxxx0000'), 'Corner Store Pty L')
  assert.equal(cleanMerchant('Coles - Internal Transfer - Receipt 645723 Orange Everyday 0011112222'), 'Coles')
})

test('cleanMerchant prefers the bank merchant name, minus location', () => {
  assert.equal(cleanMerchant('CHEMIST WAREHOUSE RICHMOND', 'Chemist Warehouse (Richmond)'), 'Chemist Warehouse')
  assert.equal(cleanMerchant('COLES 7757 RICHMOND VIC', 'Coles (Richmond Plaza)'), 'Coles')
})

test('cleanMerchant ignores payment-processor names', () => {
  assert.equal(cleanMerchant('SQ *SWEET HEART BY NAA Carlton Nth AUS', 'Square'), 'Sweet Heart By Naa Carlton Nth')
  assert.equal(cleanMerchant('PAYPAL *TARGET ONLI 4029357733 AUS'), 'Target Onli')
})

test('counterparty with 9-10 digit account numbers and "To BSB"', () => {
  assert.equal(extractCounterparty('Weekend away - Receipt No 877697Transfer to 923100 055556666'), '55556666')
  assert.equal(extractCounterparty('Weekend - Internal Transfer - Receipt 661285 Savings Maximiser 0055556666'), '55556666')
  assert.equal(extractCounterparty('Ma - Transfer to Sam ING ACCOUNT - Receipt 589999 To 923100 009999999'), '09999999')
})

test('cleanMerchant drops reference codes that mix letters and digits', () => {
  assert.equal(cleanMerchant('Spotify P48C4CB5BD - Visa Purchase - Receipt 197006In Sydney'), 'Spotify')
  assert.equal(cleanMerchant('Only About Child A00NQGTU031N  - Receipt 113769'), 'Only About Child')
  assert.equal(cleanMerchant('7-Eleven 2051 - Visa Purchase'), '7-Eleven')
})

test('cleanMerchant drops stray backslashes', () => {
  assert.equal(cleanMerchant('TANGERINE TELECOM\\ - Visa Purchase - Receipt 1'), 'Tangerine Telecom')
})

test('bpayBiller', async () => {
  const { bpayBiller } = await import('./merchant.js')
  assert.equal(bpayBiller('Council Rates - BPAY Bill Payment - Receipt 513809 To CITY COUNCIL'), 'CITY COUNCIL')
  assert.equal(bpayBiller('Coles - Visa Purchase'), null)
})
