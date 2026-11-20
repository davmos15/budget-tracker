// Recurring date schedules (pay days, transfer days, bill due dates).
//
// A schedule is { frequency, anchor, weekend?, rule?, week?, weekday? }
//   frequency: one of FREQUENCIES
//   anchor:    'YYYY-MM-DD' — any one real occurrence (past or future)
//   weekend:   'none' | 'before' | 'after' — move weekend dates to Fri / Mon
//   estimated: true when converted from old data and worth the user confirming
//   rule:      'nthWeekday' (monthly only) — e.g. "2nd Friday of each month";
//              uses week ('1st'..'4th' | 'Last') and weekday (0=Sun..6=Sat)
//
// Monthly-type schedules keep the anchor's day of month (31st stays the 31st
// where possible). Occurrence n=0 is the anchor itself.

import { parseDate, addDays, addMonths, diffDays, adjustForWeekend, daysInMonth, toISODate, today } from './dates.js'

export const FREQUENCIES = ['weekly', 'fortnightly', 'fourWeekly', 'monthly', 'quarterly', 'halfYearly', 'yearly']

export const FREQUENCY_LABELS = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  fourWeekly: 'Every 4 weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  halfYearly: 'Every 6 months',
  yearly: 'Yearly'
}

/** Occurrences per year — used for every per-period conversion in the app. */
export const PER_YEAR = {
  weekly: 52,
  fortnightly: 26,
  fourWeekly: 13,
  monthly: 12,
  quarterly: 4,
  halfYearly: 2,
  yearly: 1
}

const DAY_STEP = { weekly: 7, fortnightly: 14, fourWeekly: 28 }
const MONTH_STEP = { monthly: 1, quarterly: 3, halfYearly: 6, yearly: 12 }

export function isValidFrequency(f) {
  return Object.prototype.hasOwnProperty.call(PER_YEAR, f)
}

/** Approximate length of one period in days (only for estimates / searching). */
export function approxPeriodDays(frequency) {
  if (DAY_STEP[frequency]) return DAY_STEP[frequency]
  return (MONTH_STEP[frequency] || 1) * 30.436875
}

function nthWeekdayOfMonth(year, month, week, weekday) {
  if (week === 'Last') {
    const last = new Date(year, month, daysInMonth(year, month))
    const back = (last.getDay() - weekday + 7) % 7
    return new Date(year, month, last.getDate() - back)
  }
  const idx = { '1st': 0, '2nd': 1, '3rd': 2, '4th': 3 }[week] ?? 0
  const first = new Date(year, month, 1)
  const offset = (weekday - first.getDay() + 7) % 7
  return new Date(year, month, 1 + offset + idx * 7)
}

/** Raw (not weekend-adjusted) occurrence n of a schedule. */
export function rawOccurrence(schedule, n) {
  const anchor = parseDate(schedule.anchor)
  const f = schedule.frequency
  if (DAY_STEP[f]) return addDays(anchor, n * DAY_STEP[f])
  const step = MONTH_STEP[f] || 1
  if (schedule.rule === 'nthWeekday') {
    const m = new Date(anchor.getFullYear(), anchor.getMonth() + n * step, 1)
    const weekday = schedule.weekday ?? anchor.getDay()
    return nthWeekdayOfMonth(m.getFullYear(), m.getMonth(), schedule.week || '1st', weekday)
  }
  const day = schedule.monthDay === 'last' ? 31 : anchor.getDate()
  return addMonths(anchor, n * step, day)
}

/** Occurrence n, after weekend adjustment. */
export function occurrence(schedule, n) {
  return adjustForWeekend(rawOccurrence(schedule, n), schedule.weekend)
}

function isUsable(schedule) {
  return schedule && isValidFrequency(schedule.frequency) && parseDate(schedule.anchor)
}

/**
 * Index of the last occurrence on or before `date` (raw dates unless adjusted=true).
 */
export function indexAtOrBefore(schedule, date, adjusted = false) {
  const d = parseDate(date)
  const get = adjusted ? occurrence : rawOccurrence
  let n = Math.floor(diffDays(schedule.anchor, d) / approxPeriodDays(schedule.frequency))
  while (get(schedule, n) > d) n--
  while (get(schedule, n + 1) <= d) n++
  return n
}

/** First occurrence strictly after `date` (or on/after when inclusive). */
export function nextOccurrence(schedule, date = today(), { inclusive = false } = {}) {
  if (!isUsable(schedule)) return null
  const d = parseDate(date)
  const ref = inclusive ? addDays(d, -1) : d
  const n = indexAtOrBefore(schedule, ref, true)
  return occurrence(schedule, n + 1)
}

/** Last occurrence on or before `date` (or strictly before when exclusive). */
export function prevOccurrence(schedule, date = today(), { exclusive = false } = {}) {
  if (!isUsable(schedule)) return null
  const d = parseDate(date)
  const ref = exclusive ? addDays(d, -1) : d
  return occurrence(schedule, indexAtOrBefore(schedule, ref, true))
}

/** All occurrences in (start, end] — start exclusive, end inclusive. */
export function occurrencesBetween(schedule, start, end) {
  if (!isUsable(schedule)) return []
  const s = parseDate(start)
  const e = parseDate(end)
  const out = []
  let n = indexAtOrBefore(schedule, s, true) + 1
  let d = occurrence(schedule, n)
  let guard = 0
  while (d <= e && guard++ < 2000) {
    if (d > s) out.push(d)
    n++
    d = occurrence(schedule, n)
  }
  return out
}

/** Human description, e.g. "Fortnightly on Fridays" or "Monthly on the 27th (Fri before if weekend)". */
export function describeSchedule(schedule) {
  if (!isUsable(schedule)) return 'Not set'
  const anchor = parseDate(schedule.anchor)
  const f = schedule.frequency
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  let text
  if (DAY_STEP[f]) {
    text = `${FREQUENCY_LABELS[f]} on ${dayNames[anchor.getDay()]}s`
  } else if (schedule.rule === 'nthWeekday') {
    text = `${FREQUENCY_LABELS[f]} on the ${schedule.week || '1st'} ${dayNames[schedule.weekday ?? anchor.getDay()]}`
  } else if (schedule.monthDay === 'last') {
    text = `${FREQUENCY_LABELS[f]} on the last day`
  } else {
    text = `${FREQUENCY_LABELS[f]} on the ${ordinal(anchor.getDate())}`
  }
  if (schedule.weekend === 'before') text += ' (Friday before if on a weekend)'
  if (schedule.weekend === 'after') text += ' (Monday after if on a weekend)'
  return text
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// ---------------------------------------------------------------------------
// Legacy conversion
// ---------------------------------------------------------------------------

const DAY_NUM = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 }

function recentWeekday(weekday, ref = today()) {
  const d = parseDate(ref)
  return addDays(d, -((d.getDay() - weekday + 7) % 7))
}

function recentDayOfMonth(day, ref = today()) {
  const d = parseDate(ref)
  let candidate = addMonths(new Date(d.getFullYear(), d.getMonth(), 1), 0, day)
  if (candidate > d) candidate = addMonths(new Date(d.getFullYear(), d.getMonth() - 1, 1), 0, day)
  return candidate
}

/**
 * Convert an old-style transfer setting ({frequency, type, dayOfWeek, dayOfMonth,
 * weekNumber, weekDayOfMonth}) + optional last-transfer date into a schedule.
 */
export function scheduleFromLegacyTransfer(ps, lastTransfer) {
  if (!ps) return null
  if (ps.schedule) return ps.schedule
  const frequency = isValidFrequency(ps.frequency) ? ps.frequency : 'fortnightly'
  if (ps.type === 'dayOfMonth') {
    return { frequency: MONTH_STEP[frequency] ? frequency : 'monthly', anchor: toISODate(recentDayOfMonth(ps.dayOfMonth || 1)), weekend: 'none', estimated: true }
  }
  if (ps.type === 'weekDayOfMonth') {
    const weekday = DAY_NUM[ps.weekDayOfMonth] ?? 1
    const t = today()
    const anchor = nthWeekdayOfMonth(t.getFullYear(), t.getMonth(), ps.weekNumber || '1st', weekday)
    return { frequency: 'monthly', anchor: toISODate(anchor), rule: 'nthWeekday', week: ps.weekNumber || '1st', weekday, weekend: 'none', estimated: true }
  }
  // dayOfWeek (default)
  const weekday = DAY_NUM[ps.dayOfWeek] ?? 5
  let anchor = recentWeekday(weekday)
  if (lastTransfer) {
    // Use the recorded transfer to pick the right week for fortnightly schedules
    const lt = parseDate(lastTransfer)
    if (lt) anchor = addDays(lt, (weekday - lt.getDay() + 7) % 7)
  }
  return { frequency: DAY_STEP[frequency] ? frequency : 'weekly', anchor: toISODate(anchor), weekend: 'none', estimated: !lastTransfer && frequency !== 'weekly' }
}

/** Convert an old-style salary pay schedule into a schedule. */
export function scheduleFromLegacySalary(salary) {
  if (!salary) return null
  if (salary.schedule && parseDate(salary.schedule.anchor)) return salary.schedule
  if (!salary.payScheduleType) return null
  if (salary.payScheduleType === 'dayOfMonth') {
    const frequency = MONTH_STEP[salary.frequency] ? salary.frequency : 'monthly'
    return { frequency, anchor: toISODate(recentDayOfMonth(salary.payDayOfMonth || 15)), weekend: 'none', estimated: true }
  }
  const weekday = DAY_NUM[salary.payDayOfWeek] ?? 5
  const interval = Number(salary.payWeekInterval) || 1
  const frequency = interval === 4 ? 'fourWeekly' : interval === 2 ? 'fortnightly' : 'weekly'
  // Old data didn't record *which* week, so fortnightly/4-weekly dates are a guess
  return { frequency, anchor: toISODate(recentWeekday(weekday)), weekend: 'none', estimated: interval > 1 }
}
