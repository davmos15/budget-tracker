import { useState } from 'react'
import { DollarSign, Receipt, CreditCard, Calculator, Settings, Info } from 'lucide-react'
import Dashboard from './components/Dashboard'
import Expenses from './components/Expenses'
import Salaries from './components/Salaries'
import BillAllocation from './components/BillAllocation'
import SettingsPage from './components/Settings'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [people, setPeople] = useState([
    { id: 1, name: 'Jane', color: '#8b5cf6' },
    { id: 2, name: 'Justin', color: '#3b82f6' }
  ])
  
  const [categories, setCategories] = useState([
    { id: 1, name: 'Transportation', color: '#ef4444' },
    { id: 2, name: 'Entertainment', color: '#f59e0b' },
    { id: 3, name: 'Health', color: '#10b981' },
    { id: 4, name: 'Utilities', color: '#6366f1' },
    { id: 5, name: 'Food', color: '#ec4899' },
    { id: 6, name: 'Other', color: '#8b5cf6' }
  ])
  
  const [expenses, setExpenses] = useState([
    { id: 1, name: 'Car Payment', amount: 450, frequency: 'monthly', categoryId: 1, personId: 1, company: 'Toyota Finance', lastPaid: null },
    { id: 2, name: 'Netflix', amount: 15.99, frequency: 'monthly', categoryId: 2, personId: 2, company: 'Netflix Inc.', lastPaid: null },
    { id: 3, name: 'Gym Membership', amount: 40, frequency: 'monthly', categoryId: 3, personId: 1, company: 'FitLife Gym', lastPaid: null },
    { id: 4, name: 'Electricity', amount: 120, frequency: 'monthly', categoryId: 4, personId: 2, company: 'City Power', lastPaid: null },
    { id: 5, name: 'Groceries', amount: 150, frequency: 'weekly', categoryId: 5, personId: 1, company: 'Various', lastPaid: null },
    { id: 6, name: 'Internet', amount: 80, frequency: 'monthly', categoryId: 4, personId: 2, company: 'ISP Provider', lastPaid: null },
    { id: 7, name: 'Phone Bill', amount: 60, frequency: 'monthly', categoryId: 4, personId: 1, company: 'Mobile Network', lastPaid: null },
    { id: 8, name: 'Insurance', amount: 200, frequency: 'monthly', categoryId: 6, personId: 2, company: 'Insurance Co.', lastPaid: null }
  ])
  
  const [salaries, setSalaries] = useState([
    { id: 1, personId: 1, amount: 4500, frequency: 'monthly', source: 'Main Job' },
    { id: 2, personId: 2, amount: 5200, frequency: 'monthly', source: 'Main Job' },
    { id: 3, personId: 1, amount: 500, frequency: 'fortnightly', source: 'Side Gig' }
  ])
  
  const [settings, setSettings] = useState({
    dateFormat: 'MM/dd/yyyy',
    transferFrequency: 'fortnightly',
    currency: '$',
    peopleTransferSettings: {}
  })
  
  const [lastTransfers, setLastTransfers] = useState({})
  const [staticAmounts, setStaticAmounts] = useState([])

  const tabs = [
    { id: 'dashboard', name: 'Dashboard', icon: DollarSign },
    { id: 'expenses', name: 'Expenses', icon: Receipt },
    { id: 'salaries', name: 'Salaries', icon: CreditCard },
    { id: 'allocation', name: 'Bill Allocation', icon: Calculator },
    { id: 'settings', name: 'Settings', icon: Settings }
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-2xl font-bold text-gray-900">Budget Tracker</h1>
            <div className="flex items-center gap-2">
              <div className="relative group">
                <Info className="h-5 w-5 text-gray-400 hover:text-gray-600 cursor-help" />
                <div className="absolute right-0 top-8 w-64 p-3 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Track expenses, manage salaries, and allocate bills between multiple people.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm
                  ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <tab.icon className="h-5 w-5" />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="py-6">
          {activeTab === 'dashboard' && (
            <Dashboard
              expenses={expenses}
              salaries={salaries}
              people={people}
              categories={categories}
              settings={settings}
            />
          )}
          {activeTab === 'expenses' && (
            <Expenses
              expenses={expenses}
              setExpenses={setExpenses}
              categories={categories}
              setCategories={setCategories}
              people={people}
              settings={settings}
            />
          )}
          {activeTab === 'salaries' && (
            <Salaries
              salaries={salaries}
              setSalaries={setSalaries}
              people={people}
              setPeople={setPeople}
              settings={settings}
            />
          )}
          {activeTab === 'allocation' && (
            <BillAllocation
              expenses={expenses}
              setExpenses={setExpenses}
              salaries={salaries}
              people={people}
              categories={categories}
              settings={settings}
              lastTransfers={lastTransfers}
              setLastTransfers={setLastTransfers}
              staticAmounts={staticAmounts}
              setStaticAmounts={setStaticAmounts}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsPage
              settings={settings}
              setSettings={setSettings}
              people={people}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default App