// Bring older budget documents up to the current shape *in memory*.
// Nothing is written back until the user next saves that part of the budget,
// so opening an old budget never changes it on its own.

import { scheduleFromLegacySalary, scheduleFromLegacyTransfer } from './schedule.js'

export function normalizeSalaries(salaries) {
  return (salaries || []).map(s => {
    if (s.schedule) return s
    const schedule = scheduleFromLegacySalary(s)
    return schedule ? { ...s, schedule } : s
  })
}

export function normalizeSettings(settings, people, salaries, lastTransfers) {
  const s = { ...(settings || {}) }
  const pts = { ...(s.peopleTransferSettings || {}) }
  ;(people || []).forEach(p => {
    const old = pts[p.id]
    const hasPay = (salaries || []).some(x => x.personId === p.id && x.schedule)
    if (!old) {
      pts[p.id] = { followsPay: true }
      return
    }
    if (old.followsPay !== undefined || old.schedule) return
    // Legacy {frequency, type, dayOfWeek...}
    pts[p.id] = hasPay
      ? { followsPay: true }
      : { followsPay: false, schedule: scheduleFromLegacyTransfer(old, lastTransfers?.[p.id]) }
  })
  s.peopleTransferSettings = pts
  return s
}
