import { useState, useMemo } from 'react'
import { Plus, X, CalendarClock, AlertTriangle, CheckCircle2, Clock, CreditCard, ArrowRight, Zap, Edit2 } from 'lucide-react'

export default function BillAllocation({
  expenses,
  setExpenses,
  salaries,
  people,
  categories,
  settings,
  setSettings,
  lastTransfers,
  setLastTransfers,
  staticAmounts,
  setStaticAmounts
}) {
  const [showAddStatic, setShowAddStatic] = useState(false)
  const [editingStatic, setEditingStatic] = useState(null)
  const [currentBalance, setCurrentBalance] = useState(settings.billsAccountBalance ?? '')

  const handleBalanceChange = (value) => {
    setCurrentBalance(value)
    const numVal = parseFloat(value)
    if (!isNaN(numVal) || value === '') {
      setSettings({ ...settings, billsAccountBalance: value === '' ? null : numVal })
    }
  }

  const formatCurrency = (amount) => {
    return `${settings.currency || '$'}${Math.abs(amount).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`
  }

  const calculateDaysSince = (date) => {
    if (!date) return null
    const past = new Date(date)
    const today = new Date()
    return Math.ceil(Math.abs(today - past) / (1000 * 60 * 60 * 24))
  }

  const getNextDueDateFromLastPaid = (lastPaid, frequency) => {
    if (!lastPaid) return null
    const date = new Date(lastPaid)
    switch (frequency) {
      case 'weekly': date.setDate(date.getDate() + 7); break
      case 'fortnightly': date.setDate(date.getDate() + 14); break
      case 'monthly': date.setMonth(date.getMonth() + 1); break
      case 'quarterly': date.setMonth(date.getMonth() + 3); break
      case 'yearly': date.setFullYear(date.getFullYear() + 1); break
    }
    return date
  }

  // Calculate the required amount for each bill.
  // Logic: each bill needs its full amount set aside for the upcoming payment.
  // If we know the next due date and last paid date, we prorate based on
  // how far through the billing cycle we are. Otherwise, the full amount.
  const calculateRequiredInAccount = (expense) => {
    // If we have both lastPaid and nextDueDate, prorate
    if (expense.lastPaid && expense.nextDueDate) {
      const lastPaid = new Date(expense.lastPaid)
      const nextDue = new Date(expense.nextDueDate)
      const today = new Date()
      lastPaid.setHours(0, 0, 0, 0)
      nextDue.setHours(0, 0, 0, 0)
      today.setHours(0, 0, 0, 0)

      const totalCycleDays = Math.max(1, (nextDue - lastPaid) / (1000 * 60 * 60 * 24))
      const daysSinceLastPaid = Math.max(0, (today - lastPaid) / (1000 * 60 * 60 * 24))

      // If past due date, need the full amount
      if (today >= nextDue) return expense.amount

      // Prorate: what fraction of the cycle has elapsed
      const fraction = Math.min(daysSinceLastPaid / totalCycleDays, 1)
      return Math.round(expense.amount * fraction * 100) / 100
    }

    // No date info: need the full bill amount
    return expense.amount
  }

  const { totalRequired, byPerson, expenseDetails } = useMemo(() => {
    const byPerson = {}
    const expenseDetails = []

    people.forEach(person => {
      byPerson[person.id] = { expenses: 0, static: 0, total: 0 }
    })

    expenses.forEach(expense => {
      const required = calculateRequiredInAccount(expense)
      expenseDetails.push({
        ...expense,
        requiredAmount: required
      })

      if (byPerson[expense.personId]) {
        byPerson[expense.personId].expenses += required
      }
    })

    const staticTotal = staticAmounts.reduce((sum, item) => sum + item.amount, 0)

    Object.keys(byPerson).forEach(id => {
      byPerson[id].total = byPerson[id].expenses
    })

    const totalRequired = Object.values(byPerson).reduce((sum, p) => sum + p.total, 0) + staticTotal

    return { totalRequired, byPerson, expenseDetails }
  }, [expenses, staticAmounts, people, lastTransfers])

  // Transfer reminder logic
  const transferReminders = useMemo(() => {
    const reminders = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    people.forEach(person => {
      const personSettings = settings.peopleTransferSettings?.[person.id]
      const lastTransfer = lastTransfers[person.id]

      if (!personSettings) return

      let nextTransferDate = null
      const freq = personSettings.frequency || 'fortnightly'

      if (lastTransfer) {
        const last = new Date(lastTransfer)
        nextTransferDate = new Date(last)

        switch (freq) {
          case 'weekly': nextTransferDate.setDate(nextTransferDate.getDate() + 7); break
          case 'fortnightly': nextTransferDate.setDate(nextTransferDate.getDate() + 14); break
          case 'monthly': nextTransferDate.setMonth(nextTransferDate.getMonth() + 1); break
          case 'quarterly': nextTransferDate.setMonth(nextTransferDate.getMonth() + 3); break
        }
      }

      if (nextTransferDate) {
        nextTransferDate.setHours(0, 0, 0, 0)
        const daysUntil = Math.ceil((nextTransferDate - today) / (1000 * 60 * 60 * 24))

        if (daysUntil <= 3) {
          reminders.push({
            person,
            daysUntil,
            nextDate: nextTransferDate,
            amount: byPerson[person.id]?.total || 0,
            isOverdue: daysUntil < 0
          })
        }
      }
    })

    return reminders
  }, [people, settings, lastTransfers, byPerson])

  const handleUpdateLastPaid = (expenseId, newDate) => {
    const updatedExpenses = expenses.map(expense => {
      if (expense.id !== expenseId) return expense

      const updated = { ...expense, lastPaid: newDate }

      // Auto-calculate next due date for direct debits and standing orders
      if ((expense.paymentType === 'direct_debit' || expense.paymentType === 'standing_order') && newDate) {
        const nextDate = getNextDueDateFromLastPaid(newDate, expense.frequency)
        if (nextDate) {
          updated.nextDueDate = nextDate.toISOString().split('T')[0]
        }
      }

      return updated
    })
    setExpenses(updatedExpenses)
  }

  const handleAddStaticAmount = (newAmount) => {
    if (editingStatic) {
      setStaticAmounts(staticAmounts.map(item =>
        item.id === editingStatic.id ? { ...newAmount, id: item.id } : item
      ))
      setEditingStatic(null)
    } else {
      setStaticAmounts([...staticAmounts, { ...newAmount, id: Date.now() }])
    }
    setShowAddStatic(false)
  }

  const handleDeleteStaticAmount = (id) => {
    if (window.confirm('Delete this static amount?')) {
      setStaticAmounts(staticAmounts.filter(item => item.id !== id))
    }
  }

  const handleRecordTransfer = (personId) => {
    const today = new Date().toISOString().split('T')[0]
    setLastTransfers({ ...lastTransfers, [personId]: today })
  }

  return (
    <div className="space-y-6">
      {/* Transfer Reminders */}
      {transferReminders.length > 0 && (
        <div className="space-y-3">
          {transferReminders.map((reminder, i) => (
            <div
              key={i}
              className={`alert ${reminder.isOverdue ? 'alert-danger' : 'alert-warning'}`}
            >
              <CreditCard className="h-5 w-5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold">
                  {reminder.isOverdue
                    ? `Transfer overdue for ${reminder.person.name}`
                    : reminder.daysUntil === 0
                      ? `Transfer due today for ${reminder.person.name}`
                      : `Transfer due in ${reminder.daysUntil} day${reminder.daysUntil !== 1 ? 's' : ''} for ${reminder.person.name}`
                  }
                </p>
                <p className="text-xs opacity-75 mt-0.5">
                  Amount needed: {formatCurrency(reminder.amount)}
                </p>
              </div>
              <button
                onClick={() => handleRecordTransfer(reminder.person.id)}
                className="btn-ghost text-xs px-3 py-1.5 flex-shrink-0"
              >
                Mark Done
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Bills Overview Card */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-brand p-6 text-white">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Total Bills Owing */}
            <div>
              <p className="text-white/70 text-sm font-medium mb-1">Total Bills Owing</p>
              <p className="text-3xl font-bold">{formatCurrency(totalRequired)}</p>
              <p className="text-xs text-white/50 mt-1">Based on your transfer schedule</p>
            </div>

            {/* Current Bills Account */}
            <div>
              <p className="text-white/70 text-sm font-medium mb-1">Current Bills Account</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 font-semibold">{settings.currency || '$'}</span>
                <input
                  type="number"
                  step="0.01"
                  value={currentBalance}
                  onChange={(e) => handleBalanceChange(e.target.value)}
                  className="w-full pl-8 pr-3 py-2.5 bg-white/15 border border-white/20 rounded-xl text-white text-2xl font-bold placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30 focus:bg-white/20 transition-all"
                  placeholder="0.00"
                />
              </div>
              <p className="text-xs text-white/50 mt-1">Enter your actual account balance</p>
            </div>

            {/* Excess / Deficit */}
            {(() => {
              const balanceNum = parseFloat(currentBalance)
              if (isNaN(balanceNum)) return (
                <div>
                  <p className="text-white/70 text-sm font-medium mb-1">Excess / Deficit</p>
                  <p className="text-2xl font-bold text-white/40">-</p>
                  <p className="text-xs text-white/50 mt-1">Enter your balance to see</p>
                </div>
              )
              const difference = balanceNum - totalRequired
              const isExcess = difference >= 0
              return (
                <div>
                  <p className="text-white/70 text-sm font-medium mb-1">
                    {isExcess ? 'Excess' : 'Deficit'}
                  </p>
                  <p className={`text-3xl font-bold ${isExcess ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {isExcess ? '+' : '-'}{formatCurrency(difference)}
                  </p>
                  <p className="text-xs mt-1" style={{ color: isExcess ? 'rgba(167, 243, 208, 0.7)' : 'rgba(253, 164, 175, 0.7)' }}>
                    {isExcess
                      ? `You have ${formatCurrency(difference)} more than needed`
                      : `You need ${formatCurrency(difference)} more to cover bills`
                    }
                  </p>
                </div>
              )
            })()}
          </div>
        </div>

        {/* Per-person breakdown */}
        <div className="p-5">
          <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Balance by Person</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {people.map(person => {
              const personData = byPerson[person.id] || { expenses: 0, static: 0, total: 0 }
              const daysSince = calculateDaysSince(lastTransfers[person.id])

              return (
                <div key={person.id} className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold" style={{ backgroundColor: person.color }}>
                        {person.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 text-sm">{person.name}</p>
                        <p className="text-xs text-slate-400">
                          {daysSince !== null ? `Last transfer: ${daysSince}d ago` : 'No transfers recorded'}
                        </p>
                      </div>
                    </div>
                    <p className="text-lg font-bold text-slate-900">{formatCurrency(personData.total)}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="date"
                      value={lastTransfers[person.id] || ''}
                      onChange={(e) => setLastTransfers({ ...lastTransfers, [person.id]: e.target.value })}
                      className="input py-1.5 text-sm flex-1"
                    />
                    <button
                      onClick={() => handleRecordTransfer(person.id)}
                      className="btn-ghost text-xs px-3 py-1.5 text-brand-600 hover:text-brand-700 flex-shrink-0"
                    >
                      Today
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bills Breakdown */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Bills Breakdown</h3>
          <span className="badge badge-brand">{expenses.length} bills</span>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="table-header">Bill</th>
                <th className="table-header text-right">Amount</th>
                <th className="table-header text-right">Required</th>
                <th className="table-header">Owner</th>
                <th className="table-header">Type</th>
                <th className="table-header">Last Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenseDetails.map(expense => {
                const person = people.find(p => p.id === expense.personId)
                const category = categories.find(c => c.id === expense.categoryId)
                const nextDue = expense.nextDueDate ? new Date(expense.nextDueDate) : null
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                const isOverdue = nextDue && nextDue < today

                return (
                  <tr key={expense.id} className={`hover:bg-slate-50/50 transition-colors ${isOverdue ? 'bg-rose-50/30' : ''}`}>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: category?.color }} />
                        <div>
                          <span className="font-medium text-slate-900 text-sm">{expense.name}</span>
                          {expense.company && <p className="text-xs text-slate-400">{expense.company}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="table-cell text-right">
                      <span className="font-medium text-slate-900 text-sm">{formatCurrency(expense.amount)}</span>
                      <p className="text-xs text-slate-400 capitalize">{expense.frequency}</p>
                    </td>
                    <td className="table-cell text-right">
                      <span className={`text-sm font-semibold ${expense.requiredAmount > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                        {formatCurrency(expense.requiredAmount)}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-semibold" style={{ backgroundColor: person?.color }}>
                          {person?.name?.charAt(0)}
                        </div>
                        <span className="text-sm text-slate-600">{person?.name}</span>
                      </div>
                    </td>
                    <td className="table-cell">
                      {expense.paymentType ? (
                        <span className={`badge ${
                          expense.paymentType === 'direct_debit' ? 'badge-success' :
                          expense.paymentType === 'standing_order' ? 'badge-info' :
                          expense.paymentType === 'manual' ? 'badge-warning' : 'badge-brand'
                        }`}>
                          {expense.paymentType === 'direct_debit' ? 'DD' :
                           expense.paymentType === 'standing_order' ? 'SO' :
                           expense.paymentType === 'manual' ? 'Manual' : 'Card'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">-</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <input
                        type="date"
                        value={expense.lastPaid || ''}
                        onChange={(e) => handleUpdateLastPaid(expense.id, e.target.value)}
                        className="input py-1 px-2 text-xs w-[130px]"
                      />
                      {expense.nextDueDate && (
                        <p className={`text-[10px] mt-1 ${isOverdue ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
                          {isOverdue ? 'Overdue' : 'Next'}: {expense.nextDueDate}
                        </p>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {expenseDetails.map(expense => {
            const person = people.find(p => p.id === expense.personId)
            const category = categories.find(c => c.id === expense.categoryId)
            const nextDue = expense.nextDueDate ? new Date(expense.nextDueDate) : null
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const isOverdue = nextDue && nextDue < today

            return (
              <div key={expense.id} className={`p-4 ${isOverdue ? 'bg-rose-50/30' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: category?.color }} />
                    <p className="font-medium text-slate-900 text-sm truncate">{expense.name}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    {expense.paymentType && (
                      <span className={`badge text-[10px] px-1.5 py-0.5 ${
                        expense.paymentType === 'direct_debit' ? 'badge-success' :
                        expense.paymentType === 'standing_order' ? 'badge-info' :
                        expense.paymentType === 'manual' ? 'badge-warning' : 'badge-brand'
                      }`}>
                        {expense.paymentType === 'direct_debit' ? 'DD' :
                         expense.paymentType === 'standing_order' ? 'SO' :
                         expense.paymentType === 'manual' ? 'Manual' : 'Card'}
                      </span>
                    )}
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-semibold" style={{ backgroundColor: person?.color }}>
                      {person?.name?.charAt(0)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{formatCurrency(expense.amount)}</p>
                      <p className="text-[10px] text-slate-400 capitalize">{expense.frequency}</p>
                    </div>
                    <div className="text-slate-200">|</div>
                    <div>
                      <p className={`text-sm font-bold ${expense.requiredAmount > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                        {formatCurrency(expense.requiredAmount)}
                      </p>
                      <p className="text-[10px] text-slate-400">Required</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <input
                      type="date"
                      value={expense.lastPaid || ''}
                      onChange={(e) => handleUpdateLastPaid(expense.id, e.target.value)}
                      className="input py-1 px-2 text-[10px] w-[110px]"
                    />
                    {expense.nextDueDate && (
                      <p className={`text-[10px] mt-0.5 ${isOverdue ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
                        {isOverdue ? 'Overdue' : 'Next'}: {expense.nextDueDate}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Static Amounts */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-900">Static Amounts</h3>
            <p className="text-xs text-slate-400 mt-0.5">Fixed amounts that should always be in the bills account</p>
          </div>
          <button onClick={() => { setEditingStatic(null); setShowAddStatic(true) }} className="btn-primary text-sm">
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>

        {staticAmounts.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <p className="text-sm">No static amounts added yet</p>
            <p className="text-xs mt-1">Add buffer amounts or emergency funds</p>
          </div>
        ) : (
          <div className="space-y-2">
            {staticAmounts.map(item => {
              return (
                <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                  <span className="text-sm font-medium text-slate-700">{item.description}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{formatCurrency(item.amount)}</span>
                    <button
                      onClick={() => { setEditingStatic(item); setShowAddStatic(true) }}
                      className="p-1 hover:bg-white rounded-lg text-slate-400 hover:text-brand-600 transition-colors"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteStaticAmount(item.id)}
                      className="p-1 hover:bg-white rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showAddStatic && (
        <StaticAmountModal
          existing={editingStatic}
          onSave={handleAddStaticAmount}
          onClose={() => { setShowAddStatic(false); setEditingStatic(null) }}
        />
      )}
    </div>
  )
}

function StaticAmountModal({ existing, onSave, onClose }) {
  const [formData, setFormData] = useState({
    description: existing?.description || '',
    amount: existing?.amount || ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...formData,
      amount: parseFloat(formData.amount)
    })
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-slate-900">{existing ? 'Edit' : 'Add'} Static Amount</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="input-label">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g., Emergency fund, Buffer amount"
              className="input"
              required
            />
          </div>

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

          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1">{existing ? 'Update' : 'Add'} Amount</button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}
