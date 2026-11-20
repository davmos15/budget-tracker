import { useState, useMemo } from 'react'
import { Plus, Edit2, Trash2, X, Search, ChevronUp, ChevronDown, Receipt, PiggyBank, TrendingDown, Wallet, Copy, PauseCircle } from 'lucide-react'
import InfoTooltip from './InfoTooltip'
import { amountPer, annualAmount, billOwnersMatter, billStatus, effectiveAmount, formatMoney, isActive, isAutoPay, isBill, itemType, PAYMENT_TYPES, PERIOD_NOUN, perPeriod } from '../lib/finance'
import { FREQUENCIES, FREQUENCY_LABELS } from '../lib/schedule'
import { formatShort, toISODate } from '../lib/dates'

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
  const [duplicateFrom, setDuplicateFrom] = useState(null)
  // With a pooled split it doesn't matter who a bill belongs to, so we don't ask
  const ownersMatter = billOwnersMatter(settings, people)
  const showOwner = (e) => ownersMatter || e.itemType === 'saving'

  const viewModes = ['weekly', 'fortnightly', 'monthly', 'yearly']
  const periodLabels = PERIOD_NOUN
  const paymentTypes = PAYMENT_TYPES

  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      if (filterCategory && expense.categoryId !== parseInt(filterCategory)) return false
      if (filterPerson && !showOwner(expense)) return false
      if (filterPerson === 'shared' && people.some(p => p.id === expense.personId)) return false
      if (filterPerson && filterPerson !== 'shared' && expense.personId !== parseInt(filterPerson)) return false
      if (filterPaymentType && expense.paymentType !== filterPaymentType) return false
      if (filterItemType === 'bills' && !isBill(expense)) return false
      if (filterItemType && filterItemType !== 'bills' && itemType(expense) !== filterItemType) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (!expense.name.toLowerCase().includes(q) && !(expense.company || '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [expenses, filterCategory, filterPerson, filterPaymentType, filterItemType, searchQuery, people])

  // Per-period amount (0 when paused or ended; uses any price change already in force)
  const displayFor = (expense) => amountPer(expense, viewMode)

  // Calculate totals based on active filters
  const hasActiveFilters = filterCategory || filterPerson || filterPaymentType || filterItemType || searchQuery
  const { totalExpenses, totalSavings, disposableIncome } = useMemo(() => {
    const itemsToTotal = hasActiveFilters ? filteredExpenses : expenses
    const totalExpenses = itemsToTotal
      .filter(e => itemType(e) === 'expense')
      .reduce((sum, e) => sum + displayFor(e), 0)
    const totalSavings = itemsToTotal
      .filter(e => e.itemType === 'saving')
      .reduce((sum, e) => sum + displayFor(e), 0)
    const filteredSalaries = filterPerson && filterPerson !== 'shared'
      ? (salaries || []).filter(s => s.personId === parseInt(filterPerson))
      : filterPerson === 'shared' ? [] : (salaries || [])
    const totalIncome = perPeriod(filteredSalaries.reduce((sum, s) => sum + annualAmount(s), 0), viewMode)
    return {
      totalExpenses,
      totalSavings,
      totalIncome,
      disposableIncome: totalIncome - totalExpenses - totalSavings
    }
  }, [expenses, filteredExpenses, salaries, viewMode, hasActiveFilters, filterPerson])

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
        case 'displayAmount': aVal = displayFor(a); bVal = displayFor(b); break
        case 'category': aVal = (categories.find(c => c.id === a.categoryId)?.name || '').toLowerCase(); bVal = (categories.find(c => c.id === b.categoryId)?.name || '').toLowerCase(); break
        case 'person': aVal = (people.find(p => p.id === a.personId)?.name || '').toLowerCase(); bVal = (people.find(p => p.id === b.personId)?.name || '').toLowerCase(); break
        case 'type': aVal = a.paymentType || ''; bVal = b.paymentType || ''; break
        case 'nextDue': aVal = billStatus(a).nextDue?.getTime() ?? Infinity; bVal = billStatus(b).nextDue?.getTime() ?? Infinity; break
        default: return 0
      }
      if (aVal < bVal) return -1
      if (aVal > bVal) return 1
      return 0
    })
    return sortDir === 'desc' ? sorted.reverse() : sorted
  }, [filteredExpenses, sortKey, sortDir, categories, people, viewMode])

  const handleAddExpense = (newExpense) => {
    if (editingExpense) {
      setExpenses(expenses.map(e => e.id === editingExpense.id ? { ...newExpense, id: e.id } : e))
    } else {
      setExpenses([...expenses, { ...newExpense, id: Date.now() }])
    }
    setShowAddModal(false)
    setEditingExpense(null)
  }

  const handleDuplicate = (expense) => {
    setEditingExpense(null)
    setDuplicateFrom({ ...expense, name: `${expense.name} (copy)` })
    setShowAddModal(true)
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

  const formatCurrency = (amount) => formatMoney(Math.abs(amount), settings.currency || '$')

  const getPaymentTypeBadge = (type) => {
    const pt = paymentTypes.find(p => p.value === type)
    if (!pt) return null
    return <span className={`badge ${pt.auto ? 'badge-success' : 'badge-warning'}`}>{pt.short}</span>
  }

  const getDueStatus = (expense) => {
    if (!isActive(expense)) return { text: expense.paused ? 'Paused' : 'Ended', className: 'text-slate-400' }
    const st = billStatus(expense)
    if (!st.scheduled) return null
    if (st.overdue) return { text: `${st.daysOverdue}d overdue`, className: 'text-rose-600 font-semibold' }
    if (st.debitedToday) return { text: 'Paid today', className: 'text-emerald-500' }
    const label = formatShort(st.nextDue)
    if (st.daysUntilDue === 0) return { text: 'Due today', className: 'text-amber-600 font-semibold' }
    if (st.daysUntilDue <= 7) return { text: label, className: isAutoPay(expense) ? 'text-slate-600' : 'text-amber-600 font-medium' }
    return { text: label, className: 'text-slate-400' }
  }

  const ItemBadges = ({ expense }) => (
    <>
      {expense.itemType === 'saving' && <span className="badge badge-brand text-[10px] px-1.5 py-0 flex-shrink-0">Saving</span>}
      {expense.paused && <span className="badge text-[10px] px-1.5 py-0 bg-slate-100 text-slate-500 flex-shrink-0"><PauseCircle className="h-3 w-3" />Paused</span>}
      {itemType(expense) === 'expense' && !isBill(expense) && <span className="badge text-[10px] px-1.5 py-0 bg-slate-100 text-slate-500 flex-shrink-0" title="Paid from day-to-day spending, not the bills account">Spending</span>}
      {effectiveAmount(expense) !== Number(expense.amount) && <span className="badge badge-warning text-[10px] px-1.5 py-0 flex-shrink-0">New price</span>}
    </>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-2xl font-bold text-slate-900">Budget</h2>
            <InfoTooltip text="Track all your recurring expenses and savings. Each item can have a category, payment type, frequency, and due dates. Use filters to find specific items. Items marked as 'Saving' are tracked separately from expenses." />
          </div>
          <p className="text-sm text-slate-500 mt-1">Manage your expenses and savings</p>
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

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={() => setShowCategoryModal(true)} className="btn-secondary text-sm">
          Categories
        </button>
        <button
          onClick={() => { setEditingExpense(null); setDuplicateFrom(null); setShowAddModal(true) }}
          className="btn-primary text-sm"
        >
          <Plus className="h-4 w-4" />
          Add Item
        </button>
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
              <option key={mode} value={mode}>Per {PERIOD_NOUN[mode]}</option>
            ))}
          </select>

          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="input py-2 w-auto">
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {(ownersMatter || expenses.some(e => e.itemType === 'saving')) && people.length > 1 && (
          <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)} className="input py-2 w-auto" title={ownersMatter ? 'Person' : 'Person (savings only)'}>
            <option value="">All People</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="shared">Shared</option>
          </select>
          )}

          <select value={filterItemType} onChange={(e) => setFilterItemType(e.target.value)} className="input py-2 w-auto">
            <option value="">Expenses & Savings</option>
            <option value="expense">Expenses only</option>
            <option value="bills">Bills account only</option>
            <option value="saving">Savings only</option>
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
                    <SortHeader label={`Per ${PERIOD_NOUN[viewMode]}`} sortField="displayAmount" className="text-right" />
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
                    const displayAmount = displayFor(expense)
                    const dueStatus = getDueStatus(expense)

                    return (
                      <tr key={expense.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="table-cell">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-slate-900 dark:text-white">{expense.name}</p>
                              <ItemBadges expense={expense} />
                            </div>
                            {expense.company && <p className="text-xs text-slate-400">{expense.company}</p>}
                          </div>
                        </td>
                        <td className="table-cell text-right">
                          <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(effectiveAmount(expense))}</span>
                          <p className="text-xs text-slate-400">{FREQUENCY_LABELS[expense.frequency]}</p>
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
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold" style={{ backgroundColor: person?.color || '#94a3b8' }}>
                              {person?.name?.charAt(0) || 'S'}
                            </div>
                            <span className="text-slate-600 dark:text-slate-300">{showOwner(expense) ? (person?.name || 'Shared') : 'Household'}</span>
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
                              onClick={() => handleDuplicate(expense)}
                              className="p-1.5 hover:bg-brand-50 rounded-lg text-slate-400 hover:text-brand-600 transition-colors"
                              title="Duplicate"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
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
                const displayAmount = displayFor(expense)
                const dueStatus = getDueStatus(expense)

                return (
                  <div key={expense.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: category?.color }} />
                          <p className="font-medium text-slate-900 dark:text-white truncate">{expense.name}</p>
                          <ItemBadges expense={expense} />
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
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(effectiveAmount(expense))}</p>
                          <p className="text-[10px] text-slate-400">{FREQUENCY_LABELS[expense.frequency]}</p>
                        </div>
                        <div className="text-slate-200">|</div>
                        <div>
                          <p className="text-sm font-bold text-brand-600">{formatCurrency(displayAmount)}</p>
                          <p className="text-[10px] text-slate-400">per {PERIOD_NOUN[viewMode]}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getPaymentTypeBadge(expense.paymentType)}
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-semibold" style={{ backgroundColor: person?.color || '#94a3b8' }}>
                          {person?.name?.charAt(0) || 'S'}
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
          template={duplicateFrom}
          categories={categories}
          people={people}
          ownersMatter={ownersMatter}
          currency={settings.currency || '$'}
          onSave={handleAddExpense}
          onClose={() => { setShowAddModal(false); setEditingExpense(null); setDuplicateFrom(null) }}
          onAddCategory={handleAddCategory}
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

function ExpenseModal({ expense, template, categories, people, ownersMatter = true, currency, onSave, onClose, onAddCategory }) {
  const src = expense || template
  const [formData, setFormData] = useState({
    name: src?.name || '',
    amount: src?.amount ?? '',
    frequency: src?.frequency || 'monthly',
    categoryId: src?.categoryId || categories[0]?.id || '',
    personId: src ? (src.personId ?? '') : (people[0]?.id ?? ''),
    company: src?.company || '',
    itemType: src?.itemType || 'expense',
    paymentType: src?.paymentType || 'direct_debit',
    fromBillsAccount: src?.fromBillsAccount !== false,
    paused: !!src?.paused,
    lastPaid: src?.lastPaid || '',
    nextDueDate: src?.nextDueDate || (src ? toISODate(billStatus(src).nextDue) : ''),
    subscriptionEndDate: src?.subscriptionEndDate || '',
    priceChangeDate: src?.priceChangeDate || '',
    priceChangeAmount: src?.priceChangeAmount ?? '',
    notes: src?.notes || ''
  })
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#6366f1')
  const [showAdvanced, setShowAdvanced] = useState(
    !!(src?.subscriptionEndDate || src?.priceChangeDate || src?.notes || src?.company || src?.lastPaid)
  )

  const set = (patch) => setFormData(f => ({ ...f, ...patch }))
  const isSaving = formData.itemType === 'saving'
  const amountNum = parseFloat(formData.amount)
  const preview = !isNaN(amountNum) && amountNum > 0
    ? annualAmount({ amount: amountNum, frequency: formData.frequency })
    : 0
  const money = (n) => formatMoney(n, currency)
  const tracksDueDate = !isSaving && formData.fromBillsAccount

  const handleSubmit = (e) => {
    e.preventDefault()
    if (formData.categoryId === 'new') {
      alert('Please create the new category first')
      return
    }
    const personId = formData.personId === '' ? null : parseInt(formData.personId)
    onSave({
      ...formData,
      name: formData.name.trim(),
      amount: parseFloat(formData.amount),
      categoryId: isSaving ? null : parseInt(formData.categoryId),
      personId,
      priceChangeAmount: formData.priceChangeAmount === '' ? null : parseFloat(formData.priceChangeAmount)
    })
  }

  const handleCategoryChange = (value) => {
    if (value === 'new') {
      setShowNewCategory(true)
      set({ categoryId: '' })
    } else {
      set({ categoryId: value })
    }
  }

  const handleAddNewCategory = () => {
    if (newCategoryName.trim()) {
      const newCategory = onAddCategory({ name: newCategoryName.trim(), color: newCategoryColor })
      set({ categoryId: newCategory.id })
      setShowNewCategory(false)
      setNewCategoryName('')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{expense ? 'Edit' : 'Add'} {isSaving ? 'saving' : 'expense'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="flex bg-slate-100 dark:bg-slate-700 rounded-xl p-1">
            {['expense', 'saving'].map(t => (
              <button
                key={t}
                type="button"
                onClick={() => set({ itemType: t })}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                  formData.itemType === t ? 'bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t === 'expense' ? 'Expense' : 'Saving'}
              </button>
            ))}
          </div>

          <div>
            <label className="input-label">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => set({ name: e.target.value })}
              className="input"
              placeholder={isSaving ? 'e.g. Holiday fund' : 'e.g. Electricity'}
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Amount</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => set({ amount: e.target.value })}
                className="input"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="input-label">{isSaving ? 'How often' : 'Billed'}</label>
              <select value={formData.frequency} onChange={(e) => set({ frequency: e.target.value })} className="input" required>
                {FREQUENCIES.map(f => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
              </select>
            </div>
            {preview > 0 && (
              <p className="col-span-2 -mt-2 text-xs text-slate-500">
                = {money(perPeriod(preview, 'fortnightly'))} a fortnight · {money(perPeriod(preview, 'monthly'))} a month · {money(preview)} a year
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {!isSaving && (
              <div>
                <label className="input-label">Category</label>
                <select value={formData.categoryId} onChange={(e) => handleCategoryChange(e.target.value)} className="input" required>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="new">+ New category</option>
                </select>
              </div>
            )}
            {(isSaving || ownersMatter) && people.length > 1 && (
            <div className={isSaving ? 'col-span-2' : ''}>
              <label className="input-label">For</label>
              <select value={formData.personId ?? ''} onChange={(e) => set({ personId: e.target.value })} className="input">
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                {people.length > 1 && <option value="">Shared</option>}
              </select>
            </div>
            )}
          </div>

          {showNewCategory && !isSaving && (
            <div className="p-4 bg-slate-50 dark:bg-slate-700/40 rounded-xl space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="input col-span-2" placeholder="Category name" />
                <input type="color" value={newCategoryColor} onChange={(e) => setNewCategoryColor(e.target.value)} className="input h-[42px] p-1 cursor-pointer" />
              </div>
              <button type="button" onClick={handleAddNewCategory} className="btn-success w-full text-sm">Create category</button>
            </div>
          )}

          {!isSaving && (
            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/40 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.fromBillsAccount}
                onChange={(e) => set({ fromBillsAccount: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Paid from the bills account</span>
                <span className="block text-xs text-slate-500">Untick for day-to-day spending like groceries or eating out — it still counts in your budget, just not in the bills account.</span>
              </span>
            </label>
          )}

          {tracksDueDate && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">How it's paid</label>
                <select value={formData.paymentType} onChange={(e) => set({ paymentType: e.target.value })} className="input">
                  {PAYMENT_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Next due</label>
                <input type="date" value={formData.nextDueDate} onChange={(e) => set({ nextDueDate: e.target.value })} className="input" />
              </div>
              <p className="col-span-2 -mt-2 text-xs text-slate-500">
                {formData.paymentType === 'manual'
                  ? 'Manual bills move to the next due date when you tap "Paid" on the Bills tab.'
                  : 'Automatic payments move to the next due date on their own.'}
                {!formData.nextDueDate && ' Add a due date so the right amount is set aside.'}
              </p>
            </div>
          )}

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.paused}
              onChange={(e) => set({ paused: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-200">Paused <span className="text-xs text-slate-500">— keep it on the list but don't count it</span></span>
          </label>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
          >
            {showAdvanced ? 'Hide' : 'More'} options
            {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showAdvanced && (
            <div className="space-y-4 animate-slide-down">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">Company</label>
                  <input type="text" value={formData.company} onChange={(e) => set({ company: e.target.value })} className="input" placeholder="e.g. AGL" />
                </div>
                <div>
                  <label className="input-label">Last paid</label>
                  <input type="date" value={formData.lastPaid} onChange={(e) => set({ lastPaid: e.target.value })} className="input" />
                </div>
              </div>

              <div>
                <label className="input-label">Ends on</label>
                <input type="date" value={formData.subscriptionEndDate} onChange={(e) => set({ subscriptionEndDate: e.target.value })} className="input" />
                <p className="text-xs text-slate-400 mt-1">Stops counting after this date, with a reminder beforehand</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">Price changes on</label>
                  <input type="date" value={formData.priceChangeDate} onChange={(e) => set({ priceChangeDate: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="input-label">New price</label>
                  <input type="number" inputMode="decimal" step="0.01" value={formData.priceChangeAmount} onChange={(e) => set({ priceChangeAmount: e.target.value })} className="input" placeholder="0.00" />
                </div>
                <p className="col-span-2 -mt-2 text-xs text-slate-400">The new price is used automatically from that date</p>
              </div>

              <div>
                <label className="input-label">Notes</label>
                <textarea value={formData.notes} onChange={(e) => set({ notes: e.target.value })} className="input" rows="2" placeholder="Any additional notes..." />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1">{expense ? 'Save' : 'Add'}</button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
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
