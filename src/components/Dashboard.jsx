import { useState, useMemo } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Info, ChevronDown, ChevronUp, PieChart, BarChart3, Table } from 'lucide-react'
import { PieChart as RechartssPieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function Dashboard({ expenses, salaries, people, categories, settings }) {
  const [viewMode, setViewMode] = useState('Monthly')
  const [incomeChartType, setIncomeChartType] = useState('table')
  const [expenseChartType, setExpenseChartType] = useState('table')
  const [expandedCategories, setExpandedCategories] = useState(new Set())
  
  const viewModes = ['Weekly', 'Fortnightly', 'Monthly', 'Yearly']
  const chartTypes = [
    { id: 'table', icon: Table, label: 'Table' },
    { id: 'pie', icon: PieChart, label: 'Pie Chart' },
    { id: 'bar', icon: BarChart3, label: 'Bar Chart' }
  ]

  const { totalIncome, totalExpenses, netSavings, incomeByPerson, expensesByCategory, expensesByCategoryDetailed } = useMemo(() => {
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

    const totalIncome = salaries.reduce((sum, salary) => 
      sum + calculateYearlyAmount(salary.amount, salary.frequency), 0
    )

    const totalExpenses = expenses.reduce((sum, expense) => 
      sum + calculateYearlyAmount(expense.amount, expense.frequency), 0
    )

    const incomeByPerson = people.reduce((acc, person) => {
      const personSalaries = salaries.filter(s => s.personId === person.id)
      acc[person.id] = personSalaries.reduce((sum, salary) => 
        sum + calculateYearlyAmount(salary.amount, salary.frequency), 0
      )
      return acc
    }, {})

    const expensesByCategory = categories.reduce((acc, category) => {
      const categoryExpenses = expenses.filter(e => e.categoryId === category.id)
      acc[category.id] = {
        amount: categoryExpenses.reduce((sum, expense) => 
          sum + calculateYearlyAmount(expense.amount, expense.frequency), 0
        ),
        count: categoryExpenses.length
      }
      return acc
    }, {})

    const expensesByCategoryDetailed = categories.reduce((acc, category) => {
      const categoryExpenses = expenses.filter(e => e.categoryId === category.id)
      acc[category.id] = categoryExpenses.map(expense => ({
        ...expense,
        yearlyAmount: calculateYearlyAmount(expense.amount, expense.frequency)
      }))
      return acc
    }, {})

    return {
      totalIncome,
      totalExpenses,
      netSavings: totalIncome - totalExpenses,
      incomeByPerson,
      expensesByCategory,
      expensesByCategoryDetailed
    }
  }, [expenses, salaries, people, categories])

  const getAmountForPeriod = (yearlyAmount) => {
    const divisors = {
      'Weekly': 52,
      'Fortnightly': 26,
      'Monthly': 12,
      'Yearly': 1
    }
    return yearlyAmount / divisors[viewMode]
  }

  const formatCurrency = (amount) => {
    return `${settings.currency}${amount.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`
  }

  const getPeriodLabel = () => {
    return `per ${viewMode.toLowerCase()}`
  }

  const toggleCategoryExpansion = (categoryId) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId)
    } else {
      newExpanded.add(categoryId)
    }
    setExpandedCategories(newExpanded)
  }

  const incomeChartData = people.map(person => ({
    name: person.name,
    value: getAmountForPeriod(incomeByPerson[person.id] || 0),
    color: person.color
  }))

  const expenseChartData = categories
    .filter(category => expensesByCategory[category.id]?.amount > 0)
    .map(category => ({
      name: category.name,
      value: getAmountForPeriod(expensesByCategory[category.id]?.amount || 0),
      color: category.color
    }))

  const renderIncomeChart = () => {
    switch (incomeChartType) {
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <RechartssPieChart>
              <Pie
                data={incomeChartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {incomeChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(value)} />
            </RechartssPieChart>
          </ResponsiveContainer>
        )
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={incomeChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="value">
                {incomeChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )
      default:
        return (
          <div className="space-y-3">
            {people.map(person => (
              <div key={person.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: person.color }} />
                  <span className="text-sm font-medium">{person.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatCurrency(getAmountForPeriod(incomeByPerson[person.id] || 0))}</p>
                  <p className="text-xs text-gray-500">{getPeriodLabel()}</p>
                </div>
              </div>
            ))}
          </div>
        )
    }
  }

  const renderExpenseChart = () => {
    switch (expenseChartType) {
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <RechartssPieChart>
              <Pie
                data={expenseChartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {expenseChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(value)} />
            </RechartssPieChart>
          </ResponsiveContainer>
        )
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={expenseChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="value">
                {expenseChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )
      default:
        return (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {categories
              .filter(category => expensesByCategory[category.id]?.amount > 0)
              .sort((a, b) => (expensesByCategory[b.id]?.amount || 0) - (expensesByCategory[a.id]?.amount || 0))
              .map(category => (
                <div key={category.id}>
                  <div 
                    className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-1 rounded"
                    onClick={() => toggleCategoryExpansion(category.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: category.color }} />
                      <span className="text-sm font-medium truncate">{category.name}</span>
                      <span className="text-xs text-gray-500 flex-shrink-0">({expensesByCategory[category.id]?.count || 0})</span>
                      {expandedCategories.has(category.id) ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                    <div className="text-right ml-2">
                      <p className="text-sm font-semibold">{formatCurrency(getAmountForPeriod(expensesByCategory[category.id]?.amount || 0))}</p>
                      <p className="text-xs text-gray-500">{getPeriodLabel()}</p>
                    </div>
                  </div>
                  
                  {expandedCategories.has(category.id) && (
                    <div className="ml-6 mt-2 space-y-1 border-l-2 border-gray-200 pl-4">
                      {expensesByCategoryDetailed[category.id]?.map(expense => {
                        const person = people.find(p => p.id === expense.personId)
                        return (
                          <div key={expense.id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: person?.color }} />
                              <span className="text-gray-600">{expense.name}</span>
                              <span className="text-gray-400">({expense.frequency})</span>
                            </div>
                            <span className="text-gray-700 font-medium">
                              {formatCurrency(getAmountForPeriod(expense.yearlyAmount))}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
          </div>
        )
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <select
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {viewModes.map(mode => (
            <option key={mode} value={mode}>{mode}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm text-gray-600">Total Income</p>
              <p className="text-xl md:text-2xl font-bold text-green-600 break-all">
                {formatCurrency(getAmountForPeriod(totalIncome))}
              </p>
              <p className="text-xs text-gray-500">{getPeriodLabel()}</p>
            </div>
            <div className="bg-green-100 p-2 md:p-3 rounded-full ml-2">
              <TrendingUp className="h-5 w-5 md:h-6 md:w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm text-gray-600">Total Expenses</p>
              <p className="text-xl md:text-2xl font-bold text-red-600 break-all">
                {formatCurrency(getAmountForPeriod(totalExpenses))}
              </p>
              <p className="text-xs text-gray-500">{getPeriodLabel()}</p>
            </div>
            <div className="bg-red-100 p-2 md:p-3 rounded-full ml-2">
              <TrendingDown className="h-5 w-5 md:h-6 md:w-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm text-gray-600">Net Savings</p>
              <p className={`text-xl md:text-2xl font-bold break-all ${netSavings >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCurrency(getAmountForPeriod(netSavings))}
              </p>
              <p className="text-xs text-gray-500">{getPeriodLabel()}</p>
            </div>
            <div className={`${netSavings >= 0 ? 'bg-blue-100' : 'bg-red-100'} p-2 md:p-3 rounded-full ml-2`}>
              <DollarSign className={`h-5 w-5 md:h-6 md:w-6 ${netSavings >= 0 ? 'text-blue-600' : 'text-red-600'}`} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Income by Person</h3>
            <div className="flex items-center gap-2">
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                {chartTypes.map(type => (
                  <button
                    key={type.id}
                    onClick={() => setIncomeChartType(type.id)}
                    className={`p-1.5 rounded transition-colors ${
                      incomeChartType === type.id
                        ? 'bg-white shadow-sm text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                    title={type.label}
                  >
                    <type.icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
              <div className="relative group">
                <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
                <div className="absolute right-0 top-6 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Shows income distribution per person for the selected period
                </div>
              </div>
            </div>
          </div>
          {renderIncomeChart()}
        </div>

        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Expenses by Category</h3>
            <div className="flex items-center gap-2">
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                {chartTypes.map(type => (
                  <button
                    key={type.id}
                    onClick={() => setExpenseChartType(type.id)}
                    className={`p-1.5 rounded transition-colors ${
                      expenseChartType === type.id
                        ? 'bg-white shadow-sm text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                    title={type.label}
                  >
                    <type.icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
              <div className="relative group">
                <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
                <div className="absolute right-0 top-6 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Shows expense breakdown by category. Click categories to expand details.
                </div>
              </div>
            </div>
          </div>
          {renderExpenseChart()}
        </div>
      </div>
    </div>
  )
}