import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, detectFormat, parseStatement } from './parse.js'

test('parseCsv handles quotes, embedded commas and CRLF', () => {
  const rows = parseCsv('a,b,c\r\n1,"x, y",3\r\n"he said ""hi""",,\r\n')
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1', 'x, y', '3'], ['he said "hi"', '', '']])
})

test('detectFormat', () => {
  assert.equal(detectFormat(['Date', 'Description', 'Credit', 'Debit', 'Balance']), 'ing')
  assert.equal(detectFormat(['Date', 'Amount', 'Account Number', '', 'Transaction Type', 'Transaction Details', 'Category', 'Merchant Name', 'Processed On']), 'qantas')
  assert.equal(detectFormat(['foo', 'bar']), null)
})

test('ING rows: credit, debit, balance, quoted description', () => {
  const text = [
    'Date,Description,Credit,Debit,Balance',
    '19/11/2026,MCARE BENEFITS   123456789 CYWQ  - Receipt 120199,209.45,,1485.31',
    '15/11/2026,Cc last week - Internal Transfer - Receipt 833944 Orange Everyday 0033334444,,-308.00,817.99',
    '22/11/2019,"MS Sam present - Deposit - Receipt 323549 ",18.00,,3492.52'
  ].join('\n')
  const { format, rows, errors } = parseStatement(text)
  assert.equal(format, 'ing')
  assert.deepEqual(errors, [])
  assert.deepEqual(rows[0], { date: '2026-11-19', amount: 209.45, rawDesc: 'MCARE BENEFITS   123456789 CYWQ  - Receipt 120199', balance: 1485.31 })
  assert.equal(rows[1].amount, -308)
  assert.equal(rows[1].date, '2026-11-15')
  assert.equal(rows[2].rawDesc, 'MS Sam present - Deposit - Receipt 323549')
})

test('Qantas rows', () => {
  const text = [
    'Date,Amount,Account Number,,Transaction Type,Transaction Details,Category,Merchant Name,Processed On',
    '20 Nov 26,-59.96,Card ending 0000,,MISCELLANEOUS DEBIT,CHEMIST WAREHOUSE RICHMOND,Medical,Chemist Warehouse (Richmond),',
    '27 May 26,-1.02,0003204002640383406,,FEES,INTERNATIONAL TRANSACTION FEE,Fees,,28 May 26'
  ].join('\n')
  const { format, rows } = parseStatement(text)
  assert.equal(format, 'qantas')
  assert.deepEqual(rows[0], {
    date: '2026-11-20', amount: -59.96, rawDesc: 'CHEMIST WAREHOUSE RICHMOND',
    bankCategory: 'Medical', merchantName: 'Chemist Warehouse (Richmond)', txType: 'MISCELLANEOUS DEBIT'
  })
  assert.equal(rows[1].txType, 'FEES')
  assert.equal(rows[1].merchantName, undefined)
})

test('unknown format and bad rows are reported, good rows kept', () => {
  assert.equal(parseStatement('x,y\n1,2').format, null)
  assert.ok(parseStatement('x,y\n1,2').errors.length > 0)
  const { rows, errors } = parseStatement('Date,Description,Credit,Debit,Balance\n32/13/2026,Bad,,-1,0\n01/02/2026,Good,,-5.5,10')
  assert.equal(rows.length, 1)
  assert.equal(errors.length, 1)
  assert.equal(errors[0].line, 2)
})

test('Qantas "Sept" month', () => {
  const { rows, errors } = parseStatement('Date,Amount,Account Number,,Transaction Type,Transaction Details,Category,Merchant Name,Processed On\n30 Sept 26,-13.71,Card ending 0000,,CREDIT CARD PURCHASE,LITTLE BANG,Cafe & coffee,,')
  assert.deepEqual(errors, [])
  assert.equal(rows[0].date, '2026-09-30')
})
