import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarize, updateItems, addItem, removeItem, markPaid, updateBillsSettings, setBuffer, BudgetError } from './budget.js'

const doc = () => ({
  info: { name: 'Home' },
  people: [{ id: 1, name: 'Davi' }, { id: 2, name: 'Zeec' }],
  categories: [{ id: 1, name: 'Housing' }],
  salaries: [
    { id: 1, personId: 1, amount: 7702, frequency: 'monthly', schedule: { frequency: 'monthly', anchor: '2026-10-27', weekend: 'before' } },
    { id: 2, personId: 2, amount: 3132, frequency: 'fortnightly', schedule: { frequency: 'fortnightly', anchor: '2026-08-07' } }
  ],
  expenses: [
    { id: 10, name: 'Phone – Davi', amount: 150, frequency: 'yearly', paymentType: 'direct_debit', lastPaid: '2026-06-16', categoryId: 1, personId: 1 },
    { id: 11, name: 'Cleaner', amount: 130, frequency: 'monthly', paymentType: 'manual', nextDueDate: '2026-11-29', categoryId: 1, personId: 1 }
  ],
  settings: { billsAccountBalance: 871, cardOwing: 250 },
  staticAmounts: []
})

test('summarize gives Bills-tab numbers and per-item status', () => {
  const s = summarize(doc(), '2026-11-20')
  assert.equal(s.items.length, 2)
  assert.equal(s.items[0].nextDue, '2027-06-16')
  assert.ok(s.billsAccount.requiredToday > 0)
  assert.equal(s.billsAccount.transfers[0].nextDate, '2026-11-27')
})

test('update_items matches names loosely and validates', () => {
  const { update } = updateItems(doc(), [{ item: 'phone - davi', set: { amount: 160, lastPaid: '2026-06-20', category: 'Utilities' } }])
  const phone = update.expenses.find(e => e.id === 10)
  assert.equal(phone.amount, 160)
  assert.equal(phone.lastPaid, '2026-06-20')
  assert.ok(update.categories.some(c => c.name === 'Utilities' && c.id === phone.categoryId))
  assert.throws(() => updateItems(doc(), [{ item: 'Cleaner', set: { frequency: 'daily' } }]), BudgetError)
  assert.throws(() => updateItems(doc(), [{ item: 'Nope', set: { amount: 1 } }]), BudgetError)
  assert.throws(() => updateItems(doc(), [{ item: 'Cleaner', set: { lastPaid: '20/11/2026' } }]), BudgetError)
})

test('add, remove, mark paid', () => {
  const added = addItem(doc(), { name: 'Gas', amount: 300, frequency: 'quarterly', paymentType: 'manual', lastPaid: '2026-10-02', person: 'shared' })
  const gas = added.update.expenses.at(-1)
  assert.equal(gas.personId, null)
  assert.equal(gas.fromBillsAccount, true)
  assert.throws(() => addItem(doc(), { name: 'cleaner', amount: 1, frequency: 'monthly' }), BudgetError)
  assert.equal(removeItem(doc(), 'Cleaner').update.expenses.length, 1)
  const paid = markPaid(doc(), 'Cleaner', '2026-11-28').update.expenses.find(e => e.id === 11)
  assert.equal(paid.nextDueDate, '2026-12-29')
})

test('bills account settings and buffers', () => {
  const { update } = updateBillsSettings(doc(), { balance: 1000, transferSplit: 'custom', people: [{ person: 'Davi', mode: 'percent', percentOfIncome: 100 }, { person: 'Zeec', mode: 'topUp' }] })
  assert.equal(update.settings.billsAccountBalance, 1000)
  assert.equal(update.settings.peopleTransferSettings[1].amountType, 'percent')
  assert.equal(update.settings.peopleTransferSettings[2].topUp, true)
  const b = setBuffer(doc(), { description: 'Zaida gift', amount: 500 })
  assert.equal(b.update.staticAmounts[0].amount, 500)
})
