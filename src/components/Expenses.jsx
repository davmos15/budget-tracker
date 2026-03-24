import { useState, useMemo } from 'react'
import { Plus, Edit2, Trash2, X, Search, Filter, CreditCard, CalendarClock, AlertTriangle, Zap, ChevronUp, ChevronDown, Receipt, PiggyBank, TrendingDown, Wallet } from 'lucide-react'

export default function Expenses({ expenses, setExpenses, categories, setCategories, people, salaries, settings }) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [editingCategory, setEditingCategory] = useState(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterPerson, setFilterPerson] = useState('')
  const [filterPaymentType, setFilterPaymentType] = useState('')
  const [filterItemType, setFilterItemType] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('monthly')
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const frequencies = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly']
  const viewModes = ['weekly', 'fortnightly', 'monthly', 'yearly']
  const periodLabels = { weekly: 'week', fortnightly: 'fortnight', monthly: 'month', yearly: 'year' }
  const paymentTypes = [
    { value: 'direct_debit', label: 'Direct Debit', color: 'emerald' },
    { value: 'standing_order', label: 'Standing Order', color: 'blue' },
    { value: 'manual', label: 'Manual Transfer', color: 'amber' },
    { value: 'card', label: 'Card Payment', color: 'violet' }
  ]

  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      if (filterCategory && expense.categoryId !== parseInt(filterCategory)) return false
      if (filterPerson && expense.personId !== parseInt(filterPerson)) return false
      if (filterPaymentType && expense.paymentType !== filterPaymentType) return false
      if (filterItemType && (expense.itemType || 'expense') !== filterItemType) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (!expense.name.toLowerCase().includes(q) && !(expense.company || '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [expenses, filterCategory, filterPerson, filterPaymentType, filterItemType, searchQuery])

  const calculateDisplayAmount = (amount, frequency) => {
    const yearlyMultipliers = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1 }
    const yearlyAmount = amount * yearlyMultipliers[frequency]
    const divisors = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1 }
    return yearlyAmount / divisors[viewMode]
  }

  // Calculate totals for all items (not just filtered)
  const { totalExpenses, totalSavings, totalIncome, disposableIncome } = useMemo(() => {
    const totalExpenses = expenses
      .filter(e => (e.itemType || 'expense') === 'expense')
      .reduce((sum, e) => sum + calculateDisplayAmount(e.amount, e.frequency), 0)
    const totalSavings = expenses
      .filter(e => e.itemType === 'saving')
      .reduce((sum, e) => sum + calculateDisplayAmount(e.amount, e.frequency), 0)
    const yearlyMultipliers = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1 }
    const divisors = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1 }
    const totalIncome = (salaries || []).reduce((sum, s) =>
      sum + (s.amount * (yearlyMultipliers[s.frequency] || 0)) / divisors[viewMode], 0
    )
    return {
      totalExpenses,
      totalSavings,
      totalIncome,
      disposableIncome: totalIncome - totalExpenses - totalSavings
    }
  }, [expenses, salaries, viewMode])

  const filteredTotal = filteredExpenses.reduce((sum, e) =>
    sum + calculateDisplayAmount(e.amount, e.frequency), 0
  )

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const SortHeader = ({ label, sortField, className = '' }) => (
    <th className={`table-header cursor-pointer select-none hover:bg-slate-100 ${className}`} onClick={() => handleSort(sortField)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === sortField ? (
          sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronUp className="h-3 w-3 opacity-0" />
        )}
      </span>
    </th>
  )

  const sortedExpenses = useMemo(() => {
    if (!sortKey) return filteredExpenses
    const sorted = [...filteredExpenses].sort((a, b) => {
      let aVal, bVal
      switch (sortKey) {
        case 'name': aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break
        case 'amount': aVal = a.amount; bVal = b.amount; break
        case 'displayAmount': aVal = calculateDisplayAmount(a.amount, a.frequency); bVal = calculateDisplayAmount(b.amount, b.frequency); break
        case 'category': aVal = (categories.find(c => c.id === a.categoryId)?.name || '').toLowerCase(); bVal = (categories.find(c => c.id === b.categoryId)?.name || '').toLowerCase(); break
        case 'person': aVal = (people.find(p => p.id === a.personId)?.name || '').toLowerCase(); bVal = (people.find(p => p.id === b.personId)?.name || '').toLowerCase(); break
        case 'type': aVal = a.paymentType || ''; bVal = b.paymentType || ''; break
        case 'nextDue': aVal = a.nextDueDate || '9999'; bVal = b.nextDueDate || '9999'; break
        default: return 0
      }
      if (aVal < bVal) return -1
      if (aVal > bVal) return 1
      return 0
    })
    return sortDir === 'desc' ? sorted.reverse() : sorted
  }, [filteredExpenses, sortKey, sortDir, categories, people, viewMode])

  // Auto-calculate next due date based on frequency and last paid
  const calculateNextDueDate = (expense) => {
    if (!expense.lastPaid) return null
    const lastPaid = new Date(expense.lastPaid)
    const next = new Date(lastPaid)

    switch (expense.frequency) {
      case 'weekly': next.setDate(next.getDate() + 7); break
      case 'fortnightly': next.setDate(next.getDate() + 14); break
      case 'monthly': next.setMonth(next.getMonth() + 1); break
      case 'quarterly': next.setMonth(next.getMonth() + 3); break
      case 'yearly': next.setFullYear(next.getFullYear() + 1); break
    }
    return next.toISOString().split('T')[0]
  }

  const handleAddExpense = (newExpense) => {
    // Auto-set next due date for direct debits
    if ((newExpense.paymentType === 'direct_debit' || newExpense.paymentType === 'standing_order') && newExpense.lastPaid && !newExpense.nextDueDate) {
      newExpense.nextDueDate = calculateNextDueDate(newExpense)
    }

    if (editingExpense) {
      setExpenses(expenses.map(e => e.id === editingExpense.id ? { ...newExpense, id: e.id } : e))
    } else {
      setExpenses([...expenses, { ...newExpense, id: Date.now() }])
    }
    setShowAddModal(false)
    setEditingExpense(null)
  }

  const handleDeleteExpense = (id) => {
    if (window.confirm('Are you sure you want to delete this expense?')) {
      setExpenses(expenses.filter(e => e.id !== id))
    }
  }

  const handleAddCategory = (newCategory) => {
    const category = { ...newCategory, id: Date.now() }
    setCategories([...categories, category])
    setShowCategoryModal(false)
    return category
  }

  const handleUpdateCategory = (updatedCategory) => {
    setCategories(categories.map(c =>
      c.id === editingCategory.id ? { ...updatedCategory, id: c.id } : c
    ))
    setEditingCategory(null)
  }

  const handleDeleteCategory = (id) => {
    if (expenses.some(e => e.categoryId === id)) {
      alert('Cannot delete category with existing expenses. Please reassign or delete the expenses first.')
      return
    }
    if (window.confirm('Are you sure you want to delete this category?')) {
      setCategories(categories.filter(c => c.id !== id))
    }
  }

  const formatCurrency = (amount) => {
    return `${settings.currency || '$'}${Math.abs(amount).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`
  }

  const getPaymentTypeBadge = (type) => {
    const pt = paymentTypes.find(p => p.value === type)
    if (!pt) return null
    const colorMap = {
      emerald: 'badge-success',
      blue: 'badge-info',
      amber: 'badge-warning',
      violet: 'badge-brand'
    }
    return <span className={`badge ${colorMap[pt.color]}`}>{pt.label}</span>
  }

  const getDueStatus = (expense) => {
    if (!expense.nextDueDate) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(expense.nextDueDate)
    due.setHours(0, 0, 0, 0)
    const days = Math.ceil((due - today) / (1000 * 60 * 60 * 24))

    if (days < 0) return { text: `${Math.abs(days)}d overdue`, className: 'text-rose-600 font-semibold' }
    if (days === 0) return { text: 'Due today', className: 'text-amber-600 font-semibold' }
    if (days <= 7) return { text: `${days}d`, className: 'text-amber-500' }
    return { text: `${days}d`, className: 'text-slate-400' }
  }

  const hasActiveFilters = filterCategory || filterPerson || filterPaymentType || filterItemType || searchQuery

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Budget</h2>
          <p className="text-sm text-slate-500 mt-1">Manage your expenses and savings</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCategoryModal(true)} className="btn-secondary text-sm">
            Categories
          </button>
          <button
            onClick={() => { setEditingExpense(null); setShowAddModal(true) }}
            className="btn-primary text-sm"
          >
            <Plus className="h-4 w-4" />
            Add Item
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card bg-gradient-danger">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/80 font-medium">Total Expenses</p>
            <div className="p-2 bg-white/20 rounded-xl">
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totalExpenses)}</p>
          <p className="text-xs text-white/60 mt-1">per {periodLabels[viewMode]}</p>
        </div>

        <div className="stat-card bg-gradient-to-br from-violet-500 to-purple-600">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/80 font-medium">Total Savings</p>
            <div className="p-2 bg-white/20 rounded-xl">
              <PiggyBank className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totalSavings)}</p>
          <p className="text-xs text-white/60 mt-1">per {periodLabels[viewMode]}</p>
        </div>

        <div className={`stat-card ${disposableIncome >= 0 ? 'bg-gradient-success' : 'bg-gradient-warning'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/80 font-medium">Disposable Income</p>
            <div className="p-2 bg-white/20 rounded-xl">
              <Wallet className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold">
            {disposableIncome < 0 ? '-' : ''}{formatCurrency(disposableIncome)}
          </p>
          <p className="text-xs text-white/60 mt-1">per {periodLabels[viewMode]} after expenses & savings</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-9 py-2"
              placeholder="Search expenses..."
            />
          </div>

          <select value={viewMode} onChange={(e) => setViewMode(e.target.value)} className="input py-2 w-auto">
            {viewModes.map(mode => (
              <option key={mode} value={mode}>{mode.charAt(0).toUpperCase() + mode.slice(1)} View</option>
            ))}
          </select>

          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="input py-2 w-auto">
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)} className="input py-2 w-auto">
            <option value="">All People</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <select value={filterItemType} onChange={(e) => setFilterItemType(e.target.value)} className="input py-2 w-auto">
            <option value="">Expenses & Savings</option>
            <option value="expense">Expenses Only</option>
            <option value="saving">Savings Only</option>
          </select>

          <select value={filterPaymentType} onChange={(e) => setFilterPaymentType(e.target.value)} className="input py-2 w-auto">
            <option value="">All Types</option>
            {paymentTypes.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
          </select>

          {hasActiveFilters && (
            <button
              onClick={() => { setFilterCategory(''); setFilterPerson(''); setFilterPaymentType(''); setFilterItemType(''); setSearchQuery('') }}
              className="btn-ghost text-sm text-rose-600 hover:text-rose-700"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Expenses list */}
      <div className="card overflow-hidden">
        {filteredExpenses.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="text-slate-400">
              <Receipt className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No expenses found</p>
              <p className="text-sm mt-1">
                {hasActiveFilters ? 'Try adjusting your filters' : 'Add your first expense to get started'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <SortHeader label="Name" sortField="name" />
                    <SortHeader label="Amount" sortField="amount" className="text-right" />
                    <SortHeader label={viewMode.charAt(0).toUpperCase() + viewMode.slice(1)} sortField="displayAmount" className="text-right" />
                    <SortHeader label="Category" sortField="category" />
                    <SortHeader label="Person" sortField="person" />
                    <SortHeader label="Type" sortField="type" />
                    <SortHeader label="Next Due" sortField="nextDue" className="text-center" />
                    <th className="table-header text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedExpenses.map(expense => {
                    const category = categories.find(c => c.id === expense.categoryId)
                    const person = people.find(p => p.id === expense.personId)
                    const displayAmount = calculateDisplayAmount(expense.amount, expense.frequency)
                    const dueStatus = getDueStatus(expense)

                    return (
                      <tr key={expense.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="table-cell">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-slate-900">{expense.name}</p>
                              {expense.itemType === 'saving' && <span className="badge badge-brand text-[10px] px-1.5 py-0">Saving</span>}
                            </div>
                            {expense.company && <p className="text-xs text-slate-400">{expense.company}</p>}
                          </div>
                        </td>
                        <td className="table-cell text-right">
                          <span className="font-medium text-slate-900">{formatCurrency(expense.amount)}</span>
                          <p className="text-xs text-slate-400 capitalize">{expense.frequency}</p>
                        </td>
                        <td className="table-cell text-right">
                          <span className="font-semibold text-slate-900">{formatCurrency(displayAmount)}</span>
                        </td>
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: category?.color }} />
                            <span className="text-slate-600">{category?.name}</span>
                          </div>
                        </td>
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold" style={{ backgroundColor: person?.color }}>
                              {person?.name?.charAt(0)}
                            </div>
                            <span className="text-slate-600">{person?.name}</span>
                          </div>
                        </td>
                        <td className="table-cell">
                          {getPaymentTypeBadge(expense.paymentType)}
                        </td>
                        <td className="table-cell text-center">
                          {dueStatus ? (
                            <span className={`text-xs ${dueStatus.className}`}>{dueStatus.text}</span>
                          ) : (
                            <span className="text-xs text-slate-300">-</span>
                          )}
                        </td>
                        <td className="table-cell text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => { setEditingExpense(expense); setShowAddModal(true) }}
                              className="p-1.5 hover:bg-brand-50 rounded-lg text-slate-400 hover:text-brand-600 transition-colors"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteExpense(expense.id)}
                              className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {sortedExpenses.map(expense => {
                const category = categories.find(c => c.id === expense.categoryId)
                const person = people.find(p => p.id === expense.personId)
                const displayAmount = calculateDisplayAmount(expense.amount, expense.frequency)
                const dueStatus = getDueStatus(expense)

                return (
                  <div key={expense.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: category?.color }} />
                          <p className="font-medium text-slate-900 truncate">{expense.name}</p>
                          {expense.itemType === 'saving' && <span className="badge badge-brand text-[10px] px-1.5 py-0 flex-shrink-0">Saving</span>}
                        </div>
                        {expense.company && <p className="text-xs text-slate-400 ml-[18px]">{expense.company}</p>}
                      </div>
                      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                        <button
                          onClick={() => { setEditingExpense(expense); setShowAddModal(true) }}
                          className="p-1.5 hover:bg-brand-50 rounded-lg text-slate-400 hover:text-brand-600"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(expense.id)}
                          className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
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
                          <p className="text-sm font-bold text-brand-600">{formatCurrency(displayAmount)}</p>
                          <p className="text-[10px] text-slate-400 capitalize">{viewMode}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getPaymentTypeBadge(expense.paymentType)}
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-semibold" style={{ backgroundColor: person?.color }}>
                          {person?.name?.charAt(0)}
                        </div>
                        {dueStatus && (
                          <span className={`text-[10px] ${dueStatus.className}`}>{dueStatus.text}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {showAddModal && (
        <ExpenseModal
          expense={editingExpense}
          categories={categories}
          people={people}
          frequencies={frequencies}
          paymentTypes={paymentTypes}
          onSave={handleAddExpense}
          onClose={() => { setShowAddModal(false); setEditingExpense(null) }}
          onAddCategory={handleAddCategory}
          calculateNextDueDate={calculateNextDueDate}
        />
      )}

      {showCategoryModal && (
        <CategoryModal
          categories={categories}
          editingCategory={editingCategory}
          onSave={handleAddCategory}
          onUpdate={handleUpdateCategory}
          onDelete={handleDeleteCategory}
          onClose={() => { setShowCategoryModal(false); setEditingCategory(null) }}
          onEdit={setEditingCategory}
        />
      )}
    </div>
  )
}

function ExpenseModal({ expense, categories, people, frequencies, paymentTypes, onSave, onClose, onAddCategory, calculateNextDueDate }) {
  const [formData, setFormData] = useState({
    name: expense?.name || '',
    amount: expense?.amount || '',
    frequency: expense?.frequency || 'monthly',
    categoryId: expense?.categoryId || categories[0]?.id || '',
    personId: expense?.personId || people[0]?.id || '',
    company: expense?.company || '',
    itemType: expense?.itemType || 'expense',
    paymentType: expense?.paymentType || 'direct_debit',
    lastPaid: expense?.lastPaid || '',
    nextDueDate: expense?.nextDueDate || '',
    subscriptionEndDate: expense?.subscriptionEndDate || '',
    priceChangeDate: expense?.priceChangeDate || '',
    priceChangeAmount: expense?.priceChangeAmount || '',
    notes: expense?.notes || ''
  })
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#6366f1')
  const [showAdvanced, setShowAdvanced] = useState(
    !!(expense?.subscriptionEndDate || expense?.priceChangeDate || expense?.notes)
  )

  // Auto-calculate next due date when lastPaid or frequency changes
  const handleLastPaidChange = (date) => {
    const updated = { ...formData, lastPaid: date }
    if (date && (updated.paymentType === 'direct_debit' || updated.paymentType === 'standing_order')) {
      updated.nextDueDate = calculateNextDueDate({ ...updated })
    }
    setFormData(updated)
  }

  const handleFrequencyChange = (freq) => {
    const updated = { ...formData, frequency: freq }
    if (updated.lastPaid && (updated.paymentType === 'direct_debit' || updated.paymentType === 'standing_order')) {
      updated.nextDueDate = calculateNextDueDate({ ...updated })
    }
    setFormData(updated)
  }

  const handlePaymentTypeChange = (type) => {
    const updated = { ...formData, paymentType: type }
    if (updated.lastPaid && (type === 'direct_debit' || type === 'standing_order')) {
      updated.nextDueDate = calculateNextDueDate({ ...updated })
    }
    setFormData(updated)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (formData.categoryId === 'new') {
      alert('Please create a new category first')
      return
    }
    onSave({
      ...formData,
      amount: parseFloat(formData.amount),
      categoryId: formData.itemType === 'saving' ? null : parseInt(formData.categoryId),
      personId: parseInt(formData.personId),
      priceChangeAmount: formData.priceChangeAmount ? parseFloat(formData.priceChangeAmount) : null
    })
  }

  const handleCategoryChange = (value) => {
    if (value === 'new') {
      setShowNewCategory(true)
      setFormData({ ...formData, categoryId: '' })
    } else {
      setFormData({ ...formData, categoryId: value })
    }
  }

  const handleAddNewCategory = () => {
    if (newCategoryName.trim()) {
      const newCategory = onAddCategory({ name: newCategoryName.trim(), color: newCategoryColor })
      setFormData({ ...formData, categoryId: newCategory.id })
      setShowNewCategory(false)
      setNewCategoryName('')
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-semibold text-slate-900">{expense ? 'Edit' : 'Add'} {formData.itemType === 'saving' ? 'Saving' : 'Expense'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Item type toggle */}
          <div className="flex bg-slate-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, itemType: 'expense' })}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                formData.itemType !== 'saving'
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, itemType: 'saving' })}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                formData.itemType === 'saving'
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Saving
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="input-label">{formData.itemType === 'saving' ? 'Saving' : 'Expense'} Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input"
                placeholder="e.g., Netflix"
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

            <div>
              <label className="input-label">Frequency</label>
              <select
                value={formData.frequency}
                onChange={(e) => handleFrequencyChange(e.target.value)}
                className="input"
                required
              >
                {frequencies.map(freq => (
                  <option key={freq} value={freq}>{freq.charAt(0).toUpperCase() + freq.slice(1)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="input-label">Payment Type</label>
              <select
                value={formData.paymentType}
                onChange={(e) => handlePaymentTypeChange(e.target.value)}
                className="input"
              >
                {paymentTypes.map(pt => (
                  <option key={pt.value} value={pt.value}>{pt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="input-label">Company</label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                className="input"
                placeholder="e.g., Netflix Inc."
              />
            </div>

            {formData.itemType !== 'saving' && (
              <div>
                <label className="input-label">Category</label>
                <select
                  value={formData.categoryId}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="input"
                  required
                >
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="new">+ Add New Category</option>
                </select>
              </div>
            )}

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
          </div>

          {showNewCategory && formData.itemType !== 'saving' && (
            <div className="p-4 bg-slate-50 rounded-xl space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="input"
                    placeholder="Category name"
                  />
                </div>
                <input
                  type="color"
                  value={newCategoryColor}
                  onChange={(e) => setNewCategoryColor(e.target.value)}
                  className="input h-[42px] p-1 cursor-pointer"
                />
              </div>
              <button type="button" onClick={handleAddNewCategory} className="btn-success w-full text-sm">
                Create Category
              </button>
            </div>
          )}

          {/* Date fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Last Paid Date</label>
              <input
                type="date"
                value={formData.lastPaid}
                onChange={(e) => handleLastPaidChange(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="input-label">
                Next Due Date
                {(formData.paymentType === 'direct_debit' || formData.paymentType === 'standing_order') && (
                  <span className="text-xs text-brand-500 ml-1">(auto)</span>
                )}
              </label>
              <input
                type="date"
                value={formData.nextDueDate}
                onChange={(e) => setFormData({ ...formData, nextDueDate: e.target.value })}
                className="input"
              />
            </div>
          </div>

          {/* Advanced options toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
          >
            {showAdvanced ? 'Hide' : 'Show'} advanced options
            {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showAdvanced && (
            <div className="space-y-4 animate-slide-down">
              <div>
                <label className="input-label">Subscription End Date</label>
                <input
                  type="date"
                  value={formData.subscriptionEndDate}
                  onChange={(e) => setFormData({ ...formData, subscriptionEndDate: e.target.value })}
                  className="input"
                />
                <p className="text-xs text-slate-400 mt-1">Get reminded when this subscription is expiring</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">Price Change Date</label>
                  <input
                    type="date"
                    value={formData.priceChangeDate}
                    onChange={(e) => setFormData({ ...formData, priceChangeDate: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="input-label">New Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.priceChangeAmount}
                    onChange={(e) => setFormData({ ...formData, priceChangeAmount: e.target.value })}
                    className="input"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="input-label">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="input"
                  rows="2"
                  placeholder="Any additional notes..."
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1">
              {expense ? 'Update' : 'Add'} Expense
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

function CategoryModal({ categories, editingCategory, onSave, onUpdate, onDelete, onClose, onEdit }) {
  const [name, setName] = useState(editingCategory?.name || '')
  const [color, setColor] = useState(editingCategory?.color || '#6366f1')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (editingCategory) {
      onUpdate({ name, color })
    } else {
      onSave({ name, color })
      setName('')
      setColor('#6366f1')
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content max-h-[80vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-semibold text-slate-900">Manage Categories</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Existing Categories</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {categories.map(category => (
                <div key={category.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-lg" style={{ backgroundColor: category.color }} />
                    <span className="text-sm font-medium text-slate-700">{category.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { onEdit(category); setName(category.name); setColor(category.color) }}
                      className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-brand-600 transition-colors"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(category.id)}
                      className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
              {editingCategory ? 'Edit Category' : 'Add New Category'}
            </h4>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  placeholder="Category name"
                  required
                />
              </div>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="input h-[42px] p-1 cursor-pointer"
              />
            </div>

            <div className="flex gap-3">
              <button type="submit" className="btn-primary flex-1">
                {editingCategory ? 'Update' : 'Add'} Category
              </button>
              {editingCategory && (
                <button
                  type="button"
                  onClick={() => { onEdit(null); setName(''); setColor('#6366f1') }}
                  className="btn-secondary flex-1"
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
