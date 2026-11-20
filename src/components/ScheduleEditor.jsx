import { FREQUENCIES, FREQUENCY_LABELS, occurrencesBetween, describeSchedule } from '../lib/schedule'
import { addDays, formatShort, today, todayISO } from '../lib/dates'

const MONTHLY = ['monthly', 'quarterly', 'halfYearly', 'yearly']

/**
 * Edit a recurring schedule as "how often" + "one real date" (+ weekend rule).
 * value: { frequency, anchor, weekend }
 * frequencies: optional subset; lockFrequency hides the frequency picker (e.g. it
 * comes from the income's own frequency).
 */
export default function ScheduleEditor({ value, onChange, frequencies = FREQUENCIES, lockFrequency = false, dateLabel = 'A recent or upcoming date' }) {
  const v = { frequency: 'fortnightly', anchor: '', weekend: 'none', ...(value || {}) }
  // Any edit means the user has confirmed the date, so drop the "estimated" flag
  const set = (patch) => {
    const { estimated: _estimated, ...rest } = v
    onChange({ ...rest, ...patch })
  }
  const isMonthly = MONTHLY.includes(v.frequency)
  const preview = v.anchor ? occurrencesBetween(v, addDays(today(), -1), addDays(today(), 120)).slice(0, 3) : []

  return (
    <div className="space-y-3">
      <div className={`grid gap-3 ${lockFrequency ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {!lockFrequency && (
          <div>
            <label className="input-label text-xs">How often</label>
            <select value={v.frequency} onChange={(e) => set({ frequency: e.target.value })} className="input text-sm py-2">
              {frequencies.map(f => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="input-label text-xs">{dateLabel}</label>
          <input
            type="date"
            value={v.anchor || ''}
            onChange={(e) => set({ anchor: e.target.value })}
            className="input text-sm py-2"
            placeholder={todayISO()}
          />
        </div>
      </div>

      {isMonthly && (
        <div>
          <label className="input-label text-xs">If it lands on a weekend</label>
          <select value={v.weekend || 'none'} onChange={(e) => set({ weekend: e.target.value })} className="input text-sm py-2">
            <option value="none">Same day</option>
            <option value="before">Friday before</option>
            <option value="after">Monday after</option>
          </select>
        </div>
      )}

      {v.estimated && (
        <p className="text-xs text-amber-600">This date was estimated from older settings — please check it's a real date.</p>
      )}
      <p className="text-xs text-slate-500">
        {v.anchor ? (
          <>
            {describeSchedule(v)}
            {preview.length > 0 && <> · Next: {preview.map(d => formatShort(d)).join(', ')}</>}
          </>
        ) : (
          'Pick any real date it happened (or will happen) — the rest are worked out from that.'
        )}
      </p>
    </div>
  )
}
