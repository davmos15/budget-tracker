import { useState } from 'react'
import { Plus, Edit2, Trash2, X, UserPlus, Info } from 'lucide-react'

export default function Salaries({ salaries, setSalaries, people, setPeople, settings }) {
  const [showSalaryModal, setShowSalaryModal] = useState(false)
  const [showPersonModal, setShowPersonModal] = useState(false)
  const [editingSalary, setEditingSalary] = useState(null)
  const [editingPerson, setEditingPerson] = useState(null)

  const frequencies = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly']

  const calculateYearlyAmount = (amount, frequency) => {
    const multipliers = {
      weekly: 52,
      fortnightly: 26,
      monthly: 12,
      quarterly: 4,
      yearly: 1
    }
    return amount * (multipliers[frequency] || 0)
  }

  const getTotalByPerson = (personId) => {
    return salaries
      .filter(s => s.personId === personId)
      .reduce((sum, salary) => sum + calculateYearlyAmount(salary.amount, salary.frequency), 0)
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Income Sources</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPersonModal(true)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
          >
            <UserPlus className="h-4 w-4" />
            Add Person
          </button>
          <button
            onClick={() => {
              setEditingSalary(null)
              setShowSalaryModal(true)
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Salary
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {people.map(person => (
          <div key={person.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                  style={{ backgroundColor: person.color }}>
                  {person.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{person.name}</h3>
                  <p className="text-sm text-gray-600">
                    Total: {settings.currency}{getTotalByPerson(person.id).toLocaleString('en-US', { 
                      minimumFractionDigits: 2, 
                      maximumFractionDigits: 2 
                    })} per year
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingPerson(person)
                    setShowPersonModal(true)
                  }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDeletePerson(person.id)}
                  className="text-red-600 hover:text-red-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {salaries
                .filter(s => s.personId === person.id)
                .map(salary => (
                  <div key={salary.id} className="border rounded-lg p-3 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{salary.source}</p>
                        <p className="text-sm text-gray-600">
                          {settings.currency}{salary.amount.toFixed(2)} {salary.frequency}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingSalary(salary)
                            setShowSalaryModal(true)
                          }}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteSalary(salary.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              
              {salaries.filter(s => s.personId === person.id).length === 0 && (
                <p className="text-sm text-gray-500 italic">No income sources added yet</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Income Summary</h3>
          <div className="relative group">
            <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
            <div className="absolute right-0 top-6 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              All amounts are converted to yearly values for comparison
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-600">Total Annual Income</p>
            <p className="text-2xl font-bold text-green-600">
              {settings.currency}{salaries.reduce((sum, salary) => 
                sum + calculateYearlyAmount(salary.amount, salary.frequency), 0
              ).toLocaleString('en-US', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })}
            </p>
          </div>
          
          <div>
            <p className="text-sm text-gray-600">Monthly Average</p>
            <p className="text-2xl font-bold text-blue-600">
              {settings.currency}{(salaries.reduce((sum, salary) => 
                sum + calculateYearlyAmount(salary.amount, salary.frequency), 0
              ) / 12).toLocaleString('en-US', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })}
            </p>
          </div>
          
          <div>
            <p className="text-sm text-gray-600">Number of Sources</p>
            <p className="text-2xl font-bold text-purple-600">
              {salaries.length}
            </p>
          </div>
        </div>
      </div>

      {showSalaryModal && (
        <SalaryModal
          salary={editingSalary}
          people={people}
          frequencies={frequencies}
          onSave={handleAddSalary}
          onClose={() => {
            setShowSalaryModal(false)
            setEditingSalary(null)
          }}
        />
      )}

      {showPersonModal && (
        <PersonModal
          person={editingPerson}
          onSave={editingPerson ? handleUpdatePerson : handleAddPerson}
          onClose={() => {
            setShowPersonModal(false)
            setEditingPerson(null)
          }}
        />
      )}
    </div>
  )
}

function SalaryModal({ salary, people, frequencies, onSave, onClose }) {
  const [formData, setFormData] = useState({
    personId: salary?.personId || people[0]?.id || '',
    amount: salary?.amount || '',
    frequency: salary?.frequency || 'monthly',
    source: salary?.source || ''
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
          <h3 className="text-lg font-semibold">{salary ? 'Edit' : 'Add'} Salary</h3>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <input
              type="text"
              value={formData.source}
              onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              placeholder="e.g., Main Job, Side Gig, Investment"
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
              {salary ? 'Update' : 'Add'} Salary
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

function PersonModal({ person, onSave, onClose }) {
  const [name, setName] = useState(person?.name || '')
  const [color, setColor] = useState(person?.color || '#' + Math.floor(Math.random()*16777215).toString(16))

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({ name, color })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">{person ? 'Edit' : 'Add'} Person</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              {person ? 'Update' : 'Add'} Person
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