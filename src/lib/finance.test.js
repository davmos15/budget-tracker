// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDate, toISODate, addMonths, diffDays, adjustForWeekend, formatDate } from './dates.js'
import { nextOccurrence, prevOccurrence, occurrencesBetween, scheduleFromLegacyTransfer, describeSchedule } from './schedule.js'
import { billStatus, accrualBetween, markBillPaid, transferPlan, billsSnapshot, annualAmount, effectiveAmount, perPeriod, formatMoney, forecast } from './finance.js'

const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `expected ${a} ≈ ${b} (±${tol})`)
const D = (s) => parseDate(s)

// ---------------------------------------------------------------- dates
test('parseDate/toISODate use local calendar days (no UTC shift)', () => {
  assert.equal(toISODate(D('2026-11-01')), '2026-11-01')
  assert.equal(D('2026-11-01').getDate(), 1)
  assert.equal(toISODate(new Date(2026, 10, 20, 0, 30)), '2026-11-20')
})

test('addMonths clamps and keeps the original day', () => {
  assert.equal(toISODate(addMonths(D('2026-01-31'), 1, 31)), '2026-02-28')
  assert.equal(toISODate(addMonths(D('2026-01-31'), 2, 31)), '2026-03-31')
  assert.equal(toISODate(addMonths(D('2024-02-29'), 12)), '2025-02-28')
})

test('diffDays is DST safe', () => {
  assert.equal(diffDays('2026-10-01', '2026-10-31'), 30) // AU DST starts 4 Oct
  assert.equal(diffDays('2026-03-01', '2026-04-30'), 60)
})

test('weekend adjustment', () => {
  assert.equal(toISODate(adjustForWeekend('2026-12-27', 'before')), '2026-12-25') // Sun -> Fri
  assert.equal(toISODate(adjustForWeekend('2026-12-26', 'after')), '2026-12-28') // Sat -> Mon
  assert.equal(toISODate(adjustForWeekend('2026-12-24', 'before')), '2026-12-24')
})

test('formatDate honours the setting', () => {
  assert.equal(formatDate('2026-11-07', 'dd/MM/yyyy'), '07/11/2026')
  assert.equal(formatDate('2026-11-07', 'MM/dd/yyyy'), '11/07/2026')
  assert.equal(formatDate('2026-11-07', 'dd MMM yyyy'), '07 Nov 2026')
})

// ---------------------------------------------------------------- schedules
test('monthly pay on the 27th, moved to Friday if on a weekend (sheet: Davi)', () => {
  const s = { frequency: 'monthly', anchor: '2026-10-27', weekend: 'before' }
  assert.equal(toISODate(prevOccurrence(s, '2026-11-20')), '2026-10-27')
  assert.equal(toISODate(nextOccurrence(s, '2026-11-20')), '2026-11-27')
  // 27 Dec 2026 is a Sunday -> Friday 25th
  assert.equal(toISODate(nextOccurrence(s, '2026-11-27')), '2026-12-25')
  // 27 Feb 2027 is a Saturday -> Friday 26th
  assert.equal(toISODate(nextOccurrence(s, '2027-02-01')), '2027-02-26')
})

test('fortnightly pay (sheet: Zeec, anchored 7 Aug 2026)', () => {
  const s = { frequency: 'fortnightly', anchor: '2026-08-07' }
  assert.equal(toISODate(prevOccurrence(s, '2026-11-20')), '2026-11-13')
  assert.equal(toISODate(nextOccurrence(s, '2026-11-20')), '2026-11-27')
  assert.equal(toISODate(nextOccurrence(s, '2026-11-27', { inclusive: true })), '2026-11-27')
  assert.deepEqual(occurrencesBetween(s, '2026-11-13', '2026-12-11').map(toISODate), ['2026-11-27', '2026-12-11'])
})

test('nth weekday monthly rule', () => {
  const s = { frequency: 'monthly', anchor: '2026-11-13', rule: 'nthWeekday', week: '2nd', weekday: 5 }
  assert.equal(toISODate(nextOccurrence(s, '2026-11-20')), '2026-12-11')
  assert.match(describeSchedule(s), /2nd Friday/)
})

test('legacy fortnightly transfer uses last transfer to pick the right week', () => {
  const s = scheduleFromLegacyTransfer({ frequency: 'fortnightly', type: 'dayOfWeek', dayOfWeek: 'Friday' }, '2026-11-13')
  assert.equal(s.frequency, 'fortnightly')
  assert.equal(toISODate(nextOccurrence(s, '2026-11-20')), '2026-11-27')
})

// ---------------------------------------------------------------- bills
const today = '2026-11-20'

test('direct debit rolls over on its own and is full on the due date', () => {
  const loan = { amount: 1242, frequency: 'monthly', paymentType: 'direct_debit', nextDueDate: '2026-08-01' }
  const st = billStatus(loan, today)
  assert.equal(toISODate(st.nextDue), '2026-12-01')
  assert.equal(toISODate(st.cycleStart), '2026-11-01')
  near(st.accrued, 1242 * 19 / 30)
  near(billStatus(loan, '2026-11-30').accrued, 1242 * 29 / 30)
  near(billStatus(loan, '2026-12-01').accrued, 0) // debited this morning
  assert.equal(billStatus(loan, '2026-12-01').debitedToday, true)
  assert.equal(st.overdue, false)
})

test('manual bill becomes overdue and keeps accruing', () => {
  const rates = { amount: 354, frequency: 'quarterly', paymentType: 'manual', nextDueDate: '2027-01-25' }
  near(billStatus(rates, today).accrued, 354 * 26 / 92) // 25 Oct -> 25 Jan is 92 days
  const late = billStatus(rates, '2027-02-04')
  assert.equal(late.overdue, true)
  assert.equal(late.daysOverdue, 10)
  assert.ok(late.accrued > 354)
})

test('lastPaid alone is enough to place a bill in its cycle', () => {
  const st = billStatus({ amount: 156, frequency: 'yearly', paymentType: 'direct_debit', lastPaid: '2025-12-26' }, today)
  assert.equal(toISODate(st.nextDue), '2026-12-26')
  near(st.accrued, 156 * 329 / 365)
})

test('marking a manual bill paid advances one cycle from the due date (not the paid date)', () => {
  const bill = { amount: 130, frequency: 'monthly', paymentType: 'manual', nextDueDate: '2026-11-29' }
  const patch = markBillPaid(bill, '2026-11-25')
  assert.equal(patch.nextDueDate, '2026-12-29')
  assert.equal(patch.lastPaid, '2026-11-25')
  // Paying reduces the reserve by exactly one bill amount
  const before = billStatus(bill, '2026-11-25').accrued
  const after = billStatus({ ...bill, ...patch }, '2026-11-25').accrued
  near(before - after, 130, 1) // within a day of accrual (30 vs 31 day months)
})

test('paused / ended / price-changed items', () => {
  assert.equal(annualAmount({ amount: 10, frequency: 'monthly', paused: true }, today), 0)
  assert.equal(annualAmount({ amount: 10, frequency: 'monthly', subscriptionEndDate: '2026-11-01' }, today), 0)
  assert.equal(effectiveAmount({ amount: 10, priceChangeDate: '2026-11-01', priceChangeAmount: 12 }, today), 12)
  assert.equal(effectiveAmount({ amount: 10, priceChangeDate: '2026-12-01', priceChangeAmount: 12 }, today), 10)
  assert.equal(billStatus({ amount: 10, frequency: 'monthly', paused: true, nextDueDate: '2026-12-01' }, today).accrued, 0)
})

test('a fund (Yakira) keeps building with every fortnight and is never due', () => {
  const fund = { amount: 20, frequency: 'fortnightly', paymentType: 'manual', fund: true, fundStart: '2024-03-22', fundOpening: 500 }
  const st = billStatus(fund, today)
  assert.equal(st.overdue, false)
  assert.equal(st.nextDue, null)
  assert.equal(st.fund, true)
  near(st.accrued, 500 + 20 * diffDays('2024-03-22', today) / 14, 0.01)
  assert.deepEqual(markBillPaid(fund), {})
  // Counts towards the bills transfers, and the forecast never "pays it out"
  near(annualAmount(fund, today), 520)
  const fc = forecast({ expenses: [fund], people, salaries, settings: { transferSplit: 'income' }, balance: 0, date: today, days: 30 })
  assert.equal(fc.payments.length, 0)
})

test('accrual over a whole cycle equals the bill amount', () => {
  const b = { amount: 300, frequency: 'monthly', paymentType: 'direct_debit', nextDueDate: '2026-12-05' }
  near(accrualBetween(b, '2026-11-05', '2026-12-05'), 300)
  near(accrualBetween(b, '2026-11-05', '2027-11-05'), 3600)
})

test('period conversions are consistent', () => {
  near(perPeriod(annualAmount({ amount: 1242, frequency: 'monthly' }), 'fortnightly'), 1242 * 12 / 26)
  near(perPeriod(annualAmount({ amount: 60, frequency: 'weekly' }), 'monthly'), 260)
})

test('formatMoney', () => {
  assert.equal(formatMoney(1234.5), '$1,234.50')
  assert.equal(formatMoney(-12), '-$12.00')
  assert.equal(formatMoney(-0.001), '$0.00')
  assert.equal(formatMoney(5, '$', { signed: true }), '+$5.00')
})

// ---------------------------------------------------------------- the sheet, end to end
const people = [{ id: 1, name: 'Davi' }, { id: 2, name: 'Zeec' }]
const salaries = [
  { id: 1, personId: 1, amount: 7702, frequency: 'monthly', schedule: { frequency: 'monthly', anchor: '2026-10-27', weekend: 'before' } },
  { id: 2, personId: 2, amount: 3132, frequency: 'fortnightly', schedule: { frequency: 'fortnightly', anchor: '2026-08-07' } }
]
const bill = (name, amount, frequency, paymentType, lastPaid, extra = {}) => ({ id: name, name, amount, frequency, paymentType, lastPaid, personId: 1, ...extra })
const sheetBills = [
  bill('Smaller Home Loan', 1242, 'monthly', 'direct_debit', '2026-11-01'),
  bill('Bigger Home Loan', 3670, 'monthly', 'direct_debit', '2026-11-01'),
  bill('Rates', 354, 'quarterly', 'manual', '2026-10-25'),
  bill('Owners corp', 399, 'quarterly', 'manual', '2026-09-11'),
  bill('Contents insurance', 260, 'yearly', 'direct_debit', '2026-11-13'),
  bill('Cleaner', 130, 'monthly', 'manual', '2026-10-30'),
  bill('Energy', 106, 'monthly', 'direct_debit', '2026-10-17'),
  bill('Gas', 300, 'quarterly', 'manual', '2026-10-02'),
  bill('Water', 294, 'quarterly', 'manual', '2026-10-09'),
  bill('Internet', 73, 'monthly', 'direct_debit', '2026-11-07'),
  bill('Health insurance', 125, 'fortnightly', 'direct_debit', '2026-11-13'),
  bill('Childcare', 630, 'fortnightly', 'direct_debit', '2026-11-11'),
  bill('Spotify', 27.99, 'monthly', 'direct_debit', '2026-11-05')
]
const settings = {
  transferSplit: 'custom',
  peopleTransferSettings: { 1: { followsPay: true, fixedAmount: 5000 }, 2: { followsPay: true, topUp: true } }
}

test('custom split: fixed monthly + fortnightly top-up covers bills exactly', () => {
  const plan = transferPlan({ expenses: sheetBills, people, salaries, settings, date: today })
  const davi = plan.people[1]
  const zeec = plan.people[2]
  near(davi.perTransfer, 5000)
  assert.equal(toISODate(davi.nextDate), '2026-11-27')
  near(davi.annual + zeec.annual, plan.annualNeeded)
  near(zeec.perTransfer, (plan.annualNeeded - 5000 * 12) / 26)
  assert.ok(zeec.perTransfer > 0)
  assert.equal(plan.shortfallAnnual, 0)
})

test('percentage of pay: 100% of Davi\'s salary, Zeec tops up the rest', () => {
  const pctSettings = { transferSplit: 'custom', peopleTransferSettings: { 1: { amountType: 'percent', percentOfIncome: 100 }, 2: { topUp: true } } }
  const bigBills = [...sheetBills, bill('Extra', 2000, 'monthly', 'direct_debit', '2026-11-01')]
  const plan = transferPlan({ expenses: bigBills, people, salaries, settings: pctSettings, date: today })
  near(plan.people[1].perTransfer, 7702) // whole monthly salary
  near(plan.people[2].perTransfer, (plan.annualNeeded - 7702 * 12) / 26)
  near(plan.people[1].annual + plan.people[2].annual, plan.annualNeeded)
  // 50% halves it
  const half = transferPlan({ expenses: bigBills, people, salaries, settings: { ...pctSettings, peopleTransferSettings: { 1: { amountType: 'percent', percentOfIncome: 50 }, 2: { topUp: true } } }, date: today })
  near(half.people[1].perTransfer, 3851)
})

test('income split is proportional to income', () => {
  const plan = transferPlan({ expenses: sheetBills, people, salaries, settings: { transferSplit: 'income' }, date: today })
  const inc1 = 7702 * 12, inc2 = 3132 * 26
  near(plan.people[1].annual / plan.annualNeeded, inc1 / (inc1 + inc2), 1e-9)
})

test('required today matches the sheet: reserve + build-up − transfers by next payday', () => {
  const opts = { expenses: sheetBills, people, salaries, settings: { transferSplit: 'income' }, staticAmounts: [{ amount: 100 }], balance: 871, cardOwing: 250, date: today }
  const snap = billsSnapshot(opts)
  near(snap.reserve, snap.accruedBills + 100 + 250)
  // Both people are next paid on 27 Nov
  assert.equal(toISODate(snap.checkpoint), '2026-11-27')
  const growth = sheetBills.reduce((s, b) => s + accrualBetween(b, today, '2026-11-27'), 0)
  const incoming = snap.plan.people[1].perTransfer + snap.plan.people[2].perTransfer
  near(snap.buildUp, growth)
  near(snap.incoming, incoming)
  near(snap.onTrack, snap.reserve + growth - incoming)
  near(snap.required, Math.max(snap.onTrack, snap.cashNeed))
  near(snap.surplus, 871 - snap.required)
  // Cash floor: card + bills due before 27 Nov (Childcare 25 Nov) + Health insurance on payday itself
  near(snap.cashNeed, 250 + 630 + 125)
})

test('starting with the on-track amount, the account is fully set aside after payday', () => {
  const base = { expenses: sheetBills, people, salaries, settings: { transferSplit: 'income' }, date: today }
  const snap = billsSnapshot({ ...base, balance: 0 })
  const fc = forecast({ ...base, balance: snap.onTrack, days: 30 })
  const payday = fc.series.find(p => p.date === '2026-11-27')
  near(payday.balance, payday.reserve, 0.05)
})
