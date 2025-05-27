import { useState, useMemo } from 'react'
import { Info, Plus, X, Edit2, Save } from 'lucide-react'

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
  const [editingExpenseId, setEditingExpenseId] = useState(null)
  const [tempLastPaid, setTempLastPaid] = useState({})
  const [showAddStatic, setShowAddStatic] = useState(false)

  const calculateDaysSince = (date) => {
    if (!date) return null
    const past = new Date(date)
    const today = new Date()
    const diffTime = Math.abs(today - past)
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const calculateAccruedAmount = (expense) => {
    if (!expense.lastPaid) return 0
    
    const daysSince = calculateDaysSince(expense.lastPaid)
    const yearlyMultipliers = {
      weekly: 52,
      fortnightly: 26,
      monthly: 12,
      quarterly: 4,
      yearly: 1
    }
    
    const yearlyAmount = expense.amount * yearlyMultipliers[expense.frequency]
    const dailyAmount = yearlyAmount / 365.25
    
    return dailyAmount * daysSince
  }

  const totalAccrued = useMemo(() => {
    const expensesTotal = expenses.reduce((sum, expense) => 
      sum + calculateAccruedAmount(expense), 0
    )
    const staticTotal = staticAmounts.reduce((sum, item) => sum + item.amount, 0)
    return expensesTotal + staticTotal
  }, [expenses, staticAmounts])

  const totalByPerson = useMemo(() => {
    const result = {}
    
    people.forEach(person => {
      const personExpenses = expenses.filter(e => e.personId === person.id)
      const expenseAmount = personExpenses.reduce((sum, expense) => 
        sum + calculateAccruedAmount(expense), 0
      )
      
      const personStaticAmounts = staticAmounts.filter(s => s.personId === person.id)
      const staticAmount = personStaticAmounts.reduce((sum, item) => sum + item.amount, 0)
      
      result[person.id] = expenseAmount + staticAmount
    })
    
    return result
  }, [expenses, staticAmounts, people])

  const handleUpdateLastPaid = (expenseId) => {
    const updatedExpenses = expenses.map(expense => 
      expense.id === expenseId 
        ? { ...expense, lastPaid: tempLastPaid[expenseId] || expense.lastPaid }
        : expense
    )
    setExpenses(updatedExpenses)
    setEditingExpenseId(null)
    setTempLastPaid({})
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
              Track how much should be in your bills account based on payment cycles
            </p>
          </div>
          <div className="relative group">
            <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
            <div className="absolute right-0 top-6 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              The amount shown is calculated based on days since each bill was last paid
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-blue-600 font-medium">Total Bills Account Balance</p>
            <p className="text-2xl font-bold text-blue-800">{formatCurrency(totalAccrued)}</p>
          </div>
          
          {people.map(person => (
            <div key={person.id} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: person.color }} />
                <p className="text-sm text-gray-600 font-medium">{person.name}'s Share</p>
              </div>
              <p className="text-xl font-bold text-gray-800">
                {formatCurrency(totalByPerson[person.id] || 0)}
              </p>
            </div>
          ))}
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-md font-semibold">Last Transfer to Bills Account</h4>
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
                <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Accrued</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {expenses.map(expense => {
                const person = people.find(p => p.id === expense.personId)
                const category = categories.find(c => c.id === expense.categoryId)
                const isEditing = editingExpenseId === expense.id
                const accrued = calculateAccruedAmount(expense)
                
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
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {expense.frequency}
                    </td>
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={tempLastPaid[expense.id] || expense.lastPaid || ''}
                            onChange={(e) => setTempLastPaid({ ...tempLastPaid, [expense.id]: e.target.value })}
                            className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => handleUpdateLastPaid(expense.id)}
                            className="text-green-600 hover:text-green-800"
                          >
                            <Save className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingExpenseId(null)
                              setTempLastPaid({})
                            }}
                            className="text-gray-600 hover:text-gray-800"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-900">
                            {expense.lastPaid ? new Date(expense.lastPaid).toLocaleDateString() : 'Never'}
                          </span>
                          {expense.lastPaid && (
                            <span className="text-xs text-gray-500">
                              ({calculateDaysSince(expense.lastPaid)}d ago)
                            </span>
                          )}
                          <button
                            onClick={() => {
                              setEditingExpenseId(expense.id)
                              setTempLastPaid({ [expense.id]: expense.lastPaid || '' })
                            }}
                            className="text-blue-600 hover:text-blue-800 ml-2"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-semibold ${accrued > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {formatCurrency(accrued)}
                      </span>
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