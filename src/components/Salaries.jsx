import { useState } from 'react'
import { Plus, Edit2, Trash2, X, UserPlus, Briefcase, TrendingUp } from 'lucide-react'

export default function Salaries({ salaries, setSalaries, people, setPeople, settings }) {
  const [showSalaryModal, setShowSalaryModal] = useState(false)
  const [showPersonModal, setShowPersonModal] = useState(false)
  const [editingSalary, setEditingSalary] = useState(null)
  const [editingPerson, setEditingPerson] = useState(null)

  const frequencies = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly']

  const calculateYearlyAmount = (amount, frequency) => {
    const multipliers = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1 }
    return amount * (multipliers[frequency] || 0)
  }

  const getTotalByPerson = (personId) => {
    return salaries.filter(s => s.personId === personId)
      .reduce((sum, s) => sum + calculateYearlyAmount(s.amount, s.frequency), 0)
  }

  const formatCurrency = (amount) => {
    return `${settings.currency || '$'}${Math.abs(amount).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`
  }

  const handleAddSalary = (newSalary) => {
    if (editingSalary) {
      setSalaries(salaries.map(s => s.id === editingSalary.id ? { ...newSalary, id: s.id } : s))
    } else {
      setSalaries([...salaries, { ...newSalary, id: Date.now() }])
    }
    setShowSalaryModal(false)
    setEditingSalary(null)
  }

  const handleDeleteSalary = (id) => {
    if (window.confirm('Are you sure you want to delete this salary?')) {
      setSalaries(salaries.filter(s => s.id !== id))
    }
  }

  const handleAddPerson = (newPerson) => {
    setPeople([...people, { ...newPerson, id: Date.now() }])
    setShowPersonModal(false)
  }

  const handleUpdatePerson = (updatedPerson) => {
    setPeople(people.map(p =>
      p.id === editingPerson.id ? { ...updatedPerson, id: p.id } : p
    ))
    setEditingPerson(null)
  }

  const handleDeletePerson = (id) => {
    if (salaries.some(s => s.personId === id)) {
      alert('Cannot delete person with associated salaries. Please delete their salaries first.')
      return
    }
    if (window.confirm('Are you sure you want to delete this person?')) {
      setPeople(people.filter(p => p.id !== id))
    }
  }

  const totalYearly = salaries.reduce((sum, s) => sum + calculateYearlyAmount(s.amount, s.frequency), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Income Sources</h2>
          <p className="text-sm text-slate-500 mt-1">Manage salaries and income for each person</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setEditingPerson(null); setShowPersonModal(true) }}
            className="btn-secondary text-sm"
          >
            <UserPlus className="h-4 w-4" />
            Add Person
          </button>
          <button
            onClick={() => { setEditingSalary(null); setShowSalaryModal(true) }}
            className="btn-primary text-sm"
          >
            <Plus className="h-4 w-4" />
            Add Income
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card bg-gradient-success">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/80 font-medium">Annual Income</p>
            <div className="p-2 bg-white/20 rounded-xl">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totalYearly)}</p>
          <p className="text-xs text-white/60 mt-1">per year</p>
        </div>
        <div className="stat-card bg-gradient-info">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/80 font-medium">Monthly Average</p>
            <div className="p-2 bg-white/20 rounded-xl">
              <Briefcase className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totalYearly / 12)}</p>
          <p className="text-xs text-white/60 mt-1">per month</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-violet-500 to-purple-600">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/80 font-medium">Income Sources</p>
            <div className="p-2 bg-white/20 rounded-xl">
              <Plus className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold">{salaries.length}</p>
          <p className="text-xs text-white/60 mt-1">across {people.length} {people.length === 1 ? 'person' : 'people'}</p>
        </div>
      </div>

      {/* People cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {people.map(person => {
          const personYearly = getTotalByPerson(person.id)
          const personSalaries = salaries.filter(s => s.personId === person.id)
          const percentage = totalYearly > 0 ? (personYearly / totalYearly * 100) : 0

          return (
            <div key={person.id} className="card overflow-hidden">
              <div className="h-1.5" style={{ backgroundColor: person.color }} />
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                      style={{ backgroundColor: person.color }}>
                      {person.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{person.name}</h3>
                      <p className="text-sm text-slate-500">
                        {formatCurrency(personYearly)} / year
                        <span className="text-slate-400 ml-1">({percentage.toFixed(0)}%)</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditingPerson(person); setShowPersonModal(true) }}
                      className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-brand-600 transition-colors"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeletePerson(person.id)}
                      className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%`, backgroundColor: person.color }}
                  />
                </div>

                {/* Salary items */}
                <div className="space-y-2">
                  {personSalaries.map(salary => {
                    const getPayDayLabel = () => {
                      if (!salary.payScheduleType) return null
                      if (salary.payScheduleType === 'dayOfMonth') {
                        const d = salary.payDayOfMonth || 15
                        const suffix = d === 1 || d === 21 ? 'st' : d === 2 || d === 22 ? 'nd' : d === 3 || d === 23 ? 'rd' : 'th'
                        return `${d}${suffix} of month`
                      }
                      if (salary.payScheduleType === 'dayOfWeek') {
                        const interval = salary.payWeekInterval || 1
                        const prefix = interval === 1 ? 'Every' : interval === 2 ? 'Every 2nd' : `Every ${interval}th`
                        return `${prefix} ${salary.payDayOfWeek || 'Friday'}`
                      }
                      return null
                    }
                    const payLabel = getPayDayLabel()

                    return (
                    <div key={salary.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors group">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{salary.source}</p>
                        <p className="text-xs text-slate-400">
                          {formatCurrency(salary.amount)} {salary.frequency}
                          <span className="text-slate-300 mx-1">=</span>
                          {formatCurrency(calculateYearlyAmount(salary.amount, salary.frequency) / 12)}/mo
                        </p>
                        {payLabel && (
                          <p className="text-xs text-brand-500 mt-0.5">Pay day: {payLabel}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditingSalary(salary); setShowSalaryModal(true) }}
                          className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-brand-600 transition-colors"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSalary(salary.id)}
                          className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    )
                  })}

                  {personSalaries.length === 0 && (
                    <div className="text-center py-6 text-slate-400">
                      <p className="text-sm">No income sources yet</p>
                      <button
                        onClick={() => { setEditingSalary(null); setShowSalaryModal(true) }}
                        className="text-xs text-brand-600 hover:text-brand-700 mt-1 font-medium"
                      >
                        Add one now
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {people.length === 0 && (
          <div className="col-span-full card p-12 text-center">
            <UserPlus className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="font-medium text-slate-500">No people added yet</p>
            <p className="text-sm text-slate-400 mt-1">Add people to start tracking income</p>
            <button
              onClick={() => setShowPersonModal(true)}
              className="btn-primary text-sm mt-4"
            >
              <UserPlus className="h-4 w-4" />
              Add First Person
            </button>
          </div>
        )}
      </div>

      {showSalaryModal && (
        <SalaryModal
          salary={editingSalary}
          people={people}
          frequencies={frequencies}
          onSave={handleAddSalary}
          onClose={() => { setShowSalaryModal(false); setEditingSalary(null) }}
        />
      )}

      {showPersonModal && (
        <PersonModal
          person={editingPerson}
          onSave={editingPerson ? handleUpdatePerson : handleAddPerson}
          onClose={() => { setShowPersonModal(false); setEditingPerson(null) }}
        />
      )}
    </div>
  )
}

function SalaryModal({ salary, people, frequencies, onSave, onClose }) {
  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  const [formData, setFormData] = useState({
    personId: salary?.personId || people[0]?.id || '',
    amount: salary?.amount || '',
    frequency: salary?.frequency || 'monthly',
    source: salary?.source || '',
    payScheduleType: salary?.payScheduleType || 'dayOfMonth',
    payDayOfMonth: salary?.payDayOfMonth || 15,
    payDayOfWeek: salary?.payDayOfWeek || 'Friday',
    payWeekInterval: salary?.payWeekInterval || 1
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...formData,
      amount: parseFloat(formData.amount),
      personId: parseInt(formData.personId),
      payDayOfMonth: parseInt(formData.payDayOfMonth),
      payWeekInterval: parseInt(formData.payWeekInterval)
    })
  }

  const getOrdinal = (n) => {
    if (n === 1 || n === 21) return `${n}st`
    if (n === 2 || n === 22) return `${n}nd`
    if (n === 3 || n === 23) return `${n}rd`
    return `${n}th`
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-semibold text-slate-900">{salary ? 'Edit' : 'Add'} Income Source</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="input-label">Person</label>
            <select
              value={formData.personId}
              onChange={(e) => setFormData({ ...formData, personId: e.target.value })}
              className="input"
              required
            >
              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="input-label">Source Name</label>
            <input
              type="text"
              value={formData.source}
              onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              placeholder="e.g., Main Job, Freelance, Investments"
              className="input"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Amount</label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="input"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="input-label">Frequency</label>
              <select
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                className="input"
                required
              >
                {frequencies.map(freq => (
                  <option key={freq} value={freq}>{freq.charAt(0).toUpperCase() + freq.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Pay Schedule */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <label className="input-label text-xs uppercase tracking-wider text-slate-500">Pay Day Schedule</label>

            <div>
              <label className="input-label">Paid on</label>
              <select
                value={formData.payScheduleType}
                onChange={(e) => setFormData({ ...formData, payScheduleType: e.target.value })}
                className="input"
              >
                <option value="dayOfMonth">Specific day of month</option>
                <option value="dayOfWeek">Specific day of week</option>
              </select>
            </div>

            {formData.payScheduleType === 'dayOfMonth' && (
              <div>
                <label className="input-label">Day of Month</label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={formData.payDayOfMonth}
                  onChange={(e) => setFormData({ ...formData, payDayOfMonth: e.target.value })}
                  className="input"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Paid on the {getOrdinal(parseInt(formData.payDayOfMonth) || 1)} of each month
                </p>
              </div>
            )}

            {formData.payScheduleType === 'dayOfWeek' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label">Day</label>
                  <select
                    value={formData.payDayOfWeek}
                    onChange={(e) => setFormData({ ...formData, payDayOfWeek: e.target.value })}
                    className="input"
                  >
                    {weekDays.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="input-label">Every</label>
                  <select
                    value={formData.payWeekInterval}
                    onChange={(e) => setFormData({ ...formData, payWeekInterval: e.target.value })}
                    className="input"
                  >
                    <option value="1">Every week</option>
                    <option value="2">Every 2nd week</option>
                    <option value="4">Every 4th week</option>
                  </select>
                </div>
                <p className="col-span-2 text-xs text-slate-400">
                  Paid every {formData.payWeekInterval === '1' || formData.payWeekInterval === 1 ? '' : formData.payWeekInterval === '2' || formData.payWeekInterval === 2 ? '2nd ' : '4th '}{formData.payDayOfWeek}
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1">
              {salary ? 'Update' : 'Add'} Income
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PersonModal({ person, onSave, onClose }) {
  const [name, setName] = useState(person?.name || '')
  const [color, setColor] = useState(person?.color || '#6366f1')

  const presetColors = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#0ea5e9', '#14b8a6']

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({ name, color })
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-slate-900">{person ? 'Edit' : 'Add'} Person</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="input-label">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="Enter name"
              required
            />
          </div>

          <div>
            <label className="input-label">Color</label>
            <div className="flex items-center gap-3 mb-2">
              {presetColors.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-all ${
                    color === c ? 'ring-2 ring-offset-2 ring-brand-500 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="input h-10 p-1 cursor-pointer"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1">
              {person ? 'Update' : 'Add'} Person
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
