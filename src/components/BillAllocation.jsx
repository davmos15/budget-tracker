import { useState, useMemo } from 'react'
import { Info, Plus, X } from 'lucide-react'

export default function BillAllocation({ 
  expenses, 
  setExpenses, 
  salaries, 
  people, 
  categories, 
  settings,
  lastTransfers,
  setLastTransfers,
  staticAmounts,
  setStaticAmounts
}) {
  const [showAddStatic, setShowAddStatic] = useState(false)

  const calculateDaysSince = (date) => {
    if (!date) return null
    const past = new Date(date)
    const today = new Date()
    const diffTime = Math.abs(today - past)
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const calculateRequiredInAccount = (expense, personId) => {
    if (!expense.lastPaid) return expense.amount // Never paid, need full amount
    
    const lastTransferDate = lastTransfers[personId]
    if (!lastTransferDate) return expense.amount // No transfer recorded, need full amount
    
    const lastPaidDate = new Date(expense.lastPaid)
    const transferDate = new Date(lastTransferDate)
    
    // If bill was paid on or after the last transfer, we don't need money for it yet
    if (lastPaidDate >= transferDate) {
      return 0
    }
    
    // Bill was paid before last transfer, need to accumulate for next payment
    const today = new Date()
    const daysSinceTransfer = Math.ceil((today - transferDate) / (1000 * 60 * 60 * 24))
    
    // Calculate based on frequency
    switch (expense.frequency) {
      case 'weekly':
        // For weekly bills, accumulate based on weeks since transfer
        const weeksSinceTransfer = daysSinceTransfer / 7
        return expense.amount * Math.floor(weeksSinceTransfer + 1)
        
      case 'fortnightly':
        // For fortnightly bills, accumulate based on 2-week periods
        const fortnightsSinceTransfer = daysSinceTransfer / 14
        return expense.amount * Math.floor(fortnightsSinceTransfer + 1)
        
      case 'monthly':
        // For monthly bills, if we've passed the usual payment day, need full amount
        const lastPaidDay = lastPaidDate.getDate()
        const currentDay = today.getDate()
        const monthsPassed = (today.getFullYear() - lastPaidDate.getFullYear()) * 12 + 
                           (today.getMonth() - lastPaidDate.getMonth())
        
        // If we've passed the payment day this month or it's been over a month
        if (currentDay >= lastPaidDay || monthsPassed >= 1) {
          return expense.amount
        }
        return 0
        
      case 'quarterly':
        // For quarterly bills, check if 3 months have passed
        const quartersSinceLastPaid = Math.floor(daysSinceTransfer / 91)
        return quartersSinceLastPaid >= 1 ? expense.amount : 0
        
      case 'yearly':
        // For yearly bills, check if a year has passed
        const yearsSinceLastPaid = daysSinceTransfer / 365
        return yearsSinceLastPaid >= 1 ? expense.amount : 0
        
      default:
        return expense.amount
    }
  }

  const totalRequiredInAccount = useMemo(() => {
    const expensesTotal = expenses.reduce((sum, expense) => {
      const person = people.find(p => p.id === expense.personId)
      if (!person) return sum
      return sum + calculateRequiredInAccount(expense, person.id)
    }, 0)
    
    const staticTotal = staticAmounts.reduce((sum, item) => sum + item.amount, 0)
    return expensesTotal + staticTotal
  }, [expenses, staticAmounts, people, lastTransfers])

  const handleUpdateLastPaid = (expenseId, newDate) => {
    const updatedExpenses = expenses.map(expense => 
      expense.id === expenseId 
        ? { ...expense, lastPaid: newDate }
        : expense
    )
    setExpenses(updatedExpenses)
  }

  const handleAddStaticAmount = (newAmount) => {
    setStaticAmounts([...staticAmounts, { ...newAmount, id: Date.now() }])
    setShowAddStatic(false)
  }

  const handleDeleteStaticAmount = (id) => {
    setStaticAmounts(staticAmounts.filter(item => item.id !== id))
  }

  const formatCurrency = (amount) => {
    return `${settings.currency}${amount.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`
  }


  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold">Bills Account Balance</h3>
            <p className="text-sm text-gray-600 mt-1">
              Track how much should be in your bills account based on payment timing
            </p>
          </div>
          <div className="relative group">
            <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
            <div className="absolute right-0 top-6 w-80 p-3 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              The required amount is calculated based on when bills were last paid relative to your last transfer. 
              Bills paid after your last transfer show $0 as they're already covered.
            </div>
          </div>
        </div>

        <div className="bg-blue-50 rounded-lg p-6 mb-6">
          <p className="text-sm text-blue-600 font-medium mb-2">Total Bills Account Balance</p>
          <p className="text-3xl font-bold text-blue-800">{formatCurrency(totalRequiredInAccount)}</p>
          <p className="text-xs text-blue-600 mt-2">
            Amount needed to cover upcoming bills based on your transfer schedule
          </p>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-md font-semibold">Last Transfer to Bills Account</h4>
            <div className="relative group">
              <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
              <div className="absolute right-0 top-6 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                Enter when you last transferred money to your bills account. This affects the required balance calculations.
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {people.map(person => (
              <div key={person.id} className="flex items-center gap-3">
                <div className="flex items-center gap-2 min-w-[100px]">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: person.color }} />
                  <span className="text-sm font-medium">{person.name}</span>
                </div>
                <input
                  type="date"
                  value={lastTransfers[person.id] || ''}
                  onChange={(e) => setLastTransfers({ ...lastTransfers, [person.id]: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {lastTransfers[person.id] && (
                  <span className="text-xs text-gray-500 min-w-[80px]">
                    {calculateDaysSince(lastTransfers[person.id])} days ago
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">Bills Breakdown</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bill</th>
                <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Frequency</th>
                <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Paid</th>
                <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Required in Account</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {expenses.map(expense => {
                const person = people.find(p => p.id === expense.personId)
                const category = categories.find(c => c.id === expense.categoryId)
                const requiredAmount = calculateRequiredInAccount(expense, expense.personId)
                
                return (
                  <tr key={expense.id} className="hover:bg-gray-50">
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: category?.color }} />
                        <span className="text-sm font-medium text-gray-900">{expense.name}</span>
                      </div>
                    </td>
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: person?.color }} />
                        <span className="text-sm text-gray-600">{person?.name}</span>
                      </div>
                    </td>
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(expense.amount)}
                    </td>
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap text-sm text-gray-600 capitalize">
                      {expense.frequency}
                    </td>
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={expense.lastPaid || ''}
                          onChange={(e) => handleUpdateLastPaid(expense.id, e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {expense.lastPaid && (
                          <span className="text-xs text-gray-500">
                            ({calculateDaysSince(expense.lastPaid)}d ago)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-semibold ${requiredAmount > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {formatCurrency(requiredAmount)}
                      </span>
                      {requiredAmount === 0 && expense.lastPaid && lastTransfers[expense.personId] && (
                        <span className="text-xs text-gray-500 block">Paid this period</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Static Amounts</h3>
          <button
            onClick={() => setShowAddStatic(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Static Amount
          </button>
        </div>
        
        {staticAmounts.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No static amounts added yet</p>
        ) : (
          <div className="space-y-2">
            {staticAmounts.map(item => {
              const person = people.find(p => p.id === item.personId)
              return (
                <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: person?.color }} />
                      <span className="text-sm font-medium">{person?.name}</span>
                    </div>
                    <span className="text-sm text-gray-600">{item.description}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{formatCurrency(item.amount)}</span>
                    <button
                      onClick={() => handleDeleteStaticAmount(item.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <X className="h-4 w-4" />
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
          people={people}
          onSave={handleAddStaticAmount}
          onClose={() => setShowAddStatic(false)}
        />
      )}
    </div>
  )
}

function StaticAmountModal({ people, onSave, onClose }) {
  const [formData, setFormData] = useState({
    personId: people[0]?.id || '',
    description: '',
    amount: ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...formData,
      amount: parseFloat(formData.amount),
      personId: parseInt(formData.personId)
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Add Static Amount</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Person</label>
            <select
              value={formData.personId}
              onChange={(e) => setFormData({ ...formData, personId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              {people.map(person => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g., Emergency fund, Buffer amount"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
            <input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Add Amount
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}