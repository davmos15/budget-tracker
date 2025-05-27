import { useState, useMemo } from 'react'
import { Plus, Edit2, Trash2, X, Info } from 'lucide-react'

export default function Expenses({ expenses, setExpenses, categories, setCategories, people, settings }) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [editingCategory, setEditingCategory] = useState(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterPerson, setFilterPerson] = useState('')
  const [filterFrequency, setFilterFrequency] = useState('')
  const [viewMode, setViewMode] = useState('monthly')

  const frequencies = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly']
  const viewModes = ['weekly', 'fortnightly', 'monthly', 'yearly']

  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      if (filterCategory && expense.categoryId !== parseInt(filterCategory)) return false
      if (filterPerson && expense.personId !== parseInt(filterPerson)) return false
      if (filterFrequency && expense.frequency !== filterFrequency) return false
      return true
    })
  }, [expenses, filterCategory, filterPerson, filterFrequency])

  const calculateDisplayAmount = (amount, frequency) => {
    const yearlyMultipliers = {
      weekly: 52,
      fortnightly: 26,
      monthly: 12,
      quarterly: 4,
      yearly: 1
    }
    
    const yearlyAmount = amount * yearlyMultipliers[frequency]
    
    const divisors = {
      weekly: 52,
      fortnightly: 26,
      monthly: 12,
      yearly: 1
    }
    
    return yearlyAmount / divisors[viewMode]
  }

  const totalAmount = filteredExpenses.reduce((sum, expense) => 
    sum + calculateDisplayAmount(expense.amount, expense.frequency), 0
  )

  const handleAddExpense = (newExpense) => {
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
    const hasExpenses = expenses.some(e => e.categoryId === id)
    if (hasExpenses) {
      alert('Cannot delete category with existing expenses. Please reassign or delete the expenses first.')
      return
    }
    if (window.confirm('Are you sure you want to delete this category?')) {
      setCategories(categories.filter(c => c.id !== id))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {viewModes.map(mode => (
              <option key={mode} value={mode}>
                {mode.charAt(0).toUpperCase() + mode.slice(1)} View
              </option>
            ))}
          </select>
          
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Categories</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          
          <select
            value={filterPerson}
            onChange={(e) => setFilterPerson(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All People</option>
            {people.map(person => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
          
          <select
            value={filterFrequency}
            onChange={(e) => setFilterFrequency(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Frequencies</option>
            {frequencies.map(freq => (
              <option key={freq} value={freq}>
                {freq.charAt(0).toUpperCase() + freq.slice(1)}
              </option>
            ))}
          </select>

          {(filterCategory || filterPerson || filterFrequency) && (
            <button
              onClick={() => {
                setFilterCategory('')
                setFilterPerson('')
                setFilterFrequency('')
              }}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowCategoryModal(true)}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Manage Categories
          </button>
          <button
            onClick={() => {
              setEditingExpense(null)
              setShowAddModal(true)
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Expenses</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">
              Total: {settings.currency}{totalAmount.toFixed(2)} per {viewMode === 'monthly' ? 'month' : viewMode}
            </span>
            <div className="relative group">
              <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
              <div className="absolute right-0 top-6 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                Amounts are converted to your selected view period
              </div>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Person</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Frequency</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Per {viewMode}</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredExpenses.map(expense => {
                const category = categories.find(c => c.id === expense.categoryId)
                const person = people.find(p => p.id === expense.personId)
                const displayAmount = calculateDisplayAmount(expense.amount, expense.frequency)
                
                return (
                  <tr key={expense.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {expense.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category?.color }} />
                        {category?.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: person?.color }} />
                        {person?.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {expense.company}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {expense.frequency}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {settings.currency}{expense.amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {settings.currency}{displayAmount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => {
                          setEditingExpense(expense)
                          setShowAddModal(true)
                        }}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteExpense(expense.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <ExpenseModal
          expense={editingExpense}
          categories={categories}
          people={people}
          frequencies={frequencies}
          onSave={handleAddExpense}
          onClose={() => {
            setShowAddModal(false)
            setEditingExpense(null)
          }}
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
          onClose={() => {
            setShowCategoryModal(false)
            setEditingCategory(null)
          }}
          onEdit={setEditingCategory}
        />
      )}
    </div>
  )
}

function ExpenseModal({ expense, categories, people, frequencies, onSave, onClose, onAddCategory }) {
  const [formData, setFormData] = useState({
    name: expense?.name || '',
    amount: expense?.amount || '',
    frequency: expense?.frequency || 'monthly',
    categoryId: expense?.categoryId || categories[0]?.id || '',
    personId: expense?.personId || people[0]?.id || '',
    company: expense?.company || ''
  })
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#' + Math.floor(Math.random()*16777215).toString(16))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (formData.categoryId === 'new') {
      alert('Please create a new category first')
      return
    }
    onSave({
      ...formData,
      amount: parseFloat(formData.amount),
      categoryId: parseInt(formData.categoryId),
      personId: parseInt(formData.personId)
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
      setNewCategoryColor('#' + Math.floor(Math.random()*16777215).toString(16))
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-lg max-w-md w-full my-8 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h3 className="text-lg font-semibold">{expense ? 'Edit' : 'Add'} Expense</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
            <input
              type="text"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={formData.categoryId}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              {categories.map(category => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
              <option value="new">+ Add New Category</option>
            </select>
          </div>

          {showNewCategory && (
            <div className="p-3 bg-gray-50 rounded-lg space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Category Name</label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter category name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category Color</label>
                <input
                  type="color"
                  value={newCategoryColor}
                  onChange={(e) => setNewCategoryColor(e.target.value)}
                  className="w-full h-10 border border-gray-300 rounded-lg cursor-pointer"
                />
              </div>
              <button
                type="button"
                onClick={handleAddNewCategory}
                className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors text-sm"
              >
                Create Category
              </button>
            </div>
          )}

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
            <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
            <select
              value={formData.frequency}
              onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              {frequencies.map(freq => (
                <option key={freq} value={freq}>
                  {freq.charAt(0).toUpperCase() + freq.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              {expense ? 'Update' : 'Add'} Expense
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

function CategoryModal({ categories, editingCategory, onSave, onUpdate, onDelete, onClose, onEdit }) {
  const [name, setName] = useState(editingCategory?.name || '')
  const [color, setColor] = useState(editingCategory?.color || '#3b82f6')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (editingCategory) {
      onUpdate({ name, color })
    } else {
      onSave({ name, color })
      setName('')
      setColor('#3b82f6')
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-lg max-w-md w-full my-8 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h3 className="text-lg font-semibold">Manage Categories</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Existing Categories</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {categories.map(category => (
                <div key={category.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: category.color }} />
                    <span className="text-sm">{category.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        onEdit(category)
                        setName(category.name)
                        setColor(category.color)
                      }}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDelete(category.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700">
              {editingCategory ? 'Edit Category' : 'Add New Category'}
            </h4>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full h-10 border border-gray-300 rounded-lg cursor-pointer"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingCategory ? 'Update' : 'Add'} Category
              </button>
              {editingCategory && (
                <button
                  type="button"
                  onClick={() => {
                    onEdit(null)
                    setName('')
                    setColor('#3b82f6')
                  }}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors"
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