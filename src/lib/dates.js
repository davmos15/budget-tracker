// Date helpers that work in *local calendar days*.
//
// Dates are stored as 'YYYY-MM-DD' strings. `new Date('2026-11-01')` parses
// as UTC midnight and `toISOString()` converts back through UTC, which shifts
// the day for anyone outside UTC (e.g. in Australia "today" before 10/11am
// became yesterday). Everything here avoids UTC entirely.

const MS_PER_DAY = 86400000

/** Parse 'YYYY-MM-DD' (or a Date) into a local-midnight Date. Returns null if invalid. */
export function parseDate(value) {
  if (!value) return null
  if (value instanceof Date) {
    if (isNaN(value)) return null
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      return isNaN(d) ? null : d
    }
  }
  const d = new Date(value)
  if (isNaN(d)) return null
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Format a Date as 'YYYY-MM-DD' using local calendar fields. */
export function toISODate(date) {
  const d = parseDate(date)
  if (!d) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function today() {
  return parseDate(new Date())
}

export function todayISO() {
  return toISODate(today())
}

export function addDays(date, n) {
  const d = parseDate(date)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

export function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

/**
 * Add calendar months, clamping to the end of the month.
 * `dayOfMonth` lets repeated additions keep the original day (31 Jan -> 28 Feb -> 31 Mar)
 * instead of drifting (31 Jan -> 28 Feb -> 28 Mar).
 */
export function addMonths(date, n, dayOfMonth) {
  const d = parseDate(date)
  const target = dayOfMonth ?? d.getDate()
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1)
  const day = Math.min(target, daysInMonth(first.getFullYear(), first.getMonth()))
  return new Date(first.getFullYear(), first.getMonth(), day)
}

/** Whole calendar days from a to b (b - a). DST-safe. */
export function diffDays(a, b) {
  const da = parseDate(a)
  const db = parseDate(b)
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate())
  return Math.round((ub - ua) / MS_PER_DAY)
}

export function isWeekend(date) {
  const day = parseDate(date).getDay()
  return day === 0 || day === 6
}

/** Shift weekend dates: 'before' -> previous Friday, 'after' -> next Monday, otherwise unchanged. */
export function adjustForWeekend(date, mode) {
  const d = parseDate(date)
  if (!mode || mode === 'none') return d
  const day = d.getDay()
  if (day === 6) return addDays(d, mode === 'before' ? -1 : 2)
  if (day === 0) return addDays(d, mode === 'before' ? -2 : 1)
  return d
}

export function minDate(a, b) {
  return parseDate(a) <= parseDate(b) ? parseDate(a) : parseDate(b)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Format using the budget's dateFormat setting (default dd/MM/yyyy). */
export function formatDate(value, format = 'dd/MM/yyyy') {
  const d = parseDate(value)
  if (!d) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const MM = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = String(d.getFullYear())
  const MMM = MONTHS[d.getMonth()]
  switch (format) {
    case 'MM/dd/yyyy': return `${MM}/${dd}/${yyyy}`
    case 'yyyy-MM-dd': return `${yyyy}-${MM}-${dd}`
    case 'dd-MM-yyyy': return `${dd}-${MM}-${yyyy}`
    case 'MMM dd, yyyy': return `${MMM} ${dd}, ${yyyy}`
    case 'dd MMM yyyy': return `${dd} ${MMM} ${yyyy}`
    case 'dd/MM/yyyy':
    default: return `${dd}/${MM}/${yyyy}`
  }
}

/** Short friendly date: "Fri 27 Nov" (adds the year if not this year). */
export function formatShort(value, ref = today()) {
  const d = parseDate(value)
  if (!d) return ''
  const base = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === parseDate(ref).getFullYear() ? base : `${base} ${d.getFullYear()}`
}

/** "today", "tomorrow", "in 5 days", "3 days ago" */
export function relativeDays(value, ref = today()) {
  const d = parseDate(value)
  if (!d) return ''
  const n = diffDays(ref, d)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  return n > 0 ? `in ${n} days` : `${-n} days ago`
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
