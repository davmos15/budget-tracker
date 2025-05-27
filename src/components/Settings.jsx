import { useState } from 'react'
import { Save, Info, Globe, Calendar, RefreshCw, User } from 'lucide-react'

export default function SettingsPage({ settings, setSettings, people }) {
  const [localSettings, setLocalSettings] = useState({
    ...settings,
    peopleTransferSettings: settings.peopleTransferSettings || {}
  })
  const [showSaved, setShowSaved] = useState(false)

  const dateFormats = [
    { value: 'MM/dd/yyyy', label: 'MM/DD/YYYY (US)', example: '05/27/2025' },
    { value: 'dd/MM/yyyy', label: 'DD/MM/YYYY (EU)', example: '27/05/2025' },
    { value: 'yyyy-MM-dd', label: 'YYYY-MM-DD (ISO)', example: '2025-05-27' },
    { value: 'dd-MM-yyyy', label: 'DD-MM-YYYY', example: '27-05-2025' },
    { value: 'MMM dd, yyyy', label: 'MMM DD, YYYY', example: 'May 27, 2025' },
    { value: 'dd MMM yyyy', label: 'DD MMM YYYY', example: '27 May 2025' }
  ]

  const transferFrequencies = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'fortnightly', label: 'Fortnightly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' }
  ]

  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const weekNumbers = ['1st', '2nd', '3rd', '4th', 'Last']

  const currencies = [
    { value: '$', label: '$' },
    { value: '€', label: '€' },
    { value: '£', label: '£' },
    { value: '¥', label: '¥' },
    { value: '₹', label: '₹' },
    { value: '₽', label: '₽' },
    { value: 'R', label: 'R' },
    { value: '₩', label: '₩' }
  ]

  const initializePersonSettings = (personId) => {
    if (!localSettings.peopleTransferSettings[personId]) {
      setLocalSettings({
        ...localSettings,
        peopleTransferSettings: {
          ...localSettings.peopleTransferSettings,
          [personId]: {
            frequency: 'fortnightly',
            type: 'dayOfWeek',
            dayOfWeek: 'Friday',
            dayOfMonth: 1,
            weekNumber: '1st',
            weekDayOfMonth: 'Monday'
          }
        }
      })
    }
  }

  const updatePersonTransferSettings = (personId, field, value) => {
    setLocalSettings({
      ...localSettings,
      peopleTransferSettings: {
        ...localSettings.peopleTransferSettings,
        [personId]: {
          ...localSettings.peopleTransferSettings[personId],
          [field]: value
        }
      }
    })
  }

  const handleSave = () => {
    setSettings(localSettings)
    setShowSaved(true)
    setTimeout(() => setShowSaved(false), 3000)
  }

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(localSettings)

  const getDateFormatExample = (format) => {
    const dateFormat = dateFormats.find(f => f.value === format)
    return dateFormat ? dateFormat.example : new Date().toLocaleDateString()
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-lg shadow p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
          {showSaved && (
            <div className="text-sm text-green-600 flex items-center gap-2">
              <Save className="h-4 w-4" />
              Settings saved successfully
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-5 w-5 text-gray-400" />
              <label className="text-sm font-medium text-gray-700">Currency Symbol</label>
              <div className="relative group">
                <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
                <div className="absolute left-0 top-6 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Select the currency symbol to display throughout the app
                </div>
              </div>
            </div>
            <select
              value={localSettings.currency}
              onChange={(e) => setLocalSettings({ ...localSettings, currency: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {currencies.map(currency => (
                <option key={currency.value} value={currency.value}>
                  {currency.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-5 w-5 text-gray-400" />
              <label className="text-sm font-medium text-gray-700">Date Format</label>
              <div className="relative group">
                <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
                <div className="absolute left-0 top-6 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Choose how dates are displayed in the application
                </div>
              </div>
            </div>
            <select
              value={localSettings.dateFormat}
              onChange={(e) => setLocalSettings({ ...localSettings, dateFormat: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {dateFormats.map(format => (
                <option key={format.value} value={format.value}>
                  {format.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Example: {getDateFormatExample(localSettings.dateFormat)}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="h-5 w-5 text-gray-400" />
              <label className="text-sm font-medium text-gray-700">Default Transfer Frequency</label>
              <div className="relative group">
                <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
                <div className="absolute left-0 top-6 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Default frequency for new people. Individual settings below override this.
                </div>
              </div>
            </div>
            <select
              value={localSettings.transferFrequency}
              onChange={(e) => setLocalSettings({ ...localSettings, transferFrequency: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {transferFrequencies.map(freq => (
                <option key={freq.value} value={freq.value}>
                  {freq.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t">
          <div className="flex items-center gap-2 mb-4">
            <User className="h-5 w-5 text-gray-400" />
            <h3 className="text-lg font-semibold">Transfer Settings by Person</h3>
          </div>
          
          <div className="space-y-6">
            {people.map(person => {
              if (!localSettings.peopleTransferSettings[person.id]) {
                initializePersonSettings(person.id)
              }
              const personSettings = localSettings.peopleTransferSettings[person.id]
              
              return (
                <div key={person.id} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: person.color }} />
                    <h4 className="font-medium">{person.name}</h4>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                      <select
                        value={personSettings?.frequency || 'fortnightly'}
                        onChange={(e) => updatePersonTransferSettings(person.id, 'frequency', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {transferFrequencies.map(freq => (
                          <option key={freq.value} value={freq.value}>
                            {freq.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Transfer On</label>
                      <select
                        value={personSettings?.type || 'dayOfWeek'}
                        onChange={(e) => updatePersonTransferSettings(person.id, 'type', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="dayOfWeek">Specific Day of Week</option>
                        <option value="dayOfMonth">Specific Day of Month</option>
                        <option value="weekDayOfMonth">Specific Week & Day of Month</option>
                      </select>
                    </div>

                    {personSettings?.type === 'dayOfWeek' && (
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
                        <select
                          value={personSettings?.dayOfWeek || 'Friday'}
                          onChange={(e) => updatePersonTransferSettings(person.id, 'dayOfWeek', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {weekDays.map(day => (
                            <option key={day} value={day}>{day}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {personSettings?.type === 'dayOfMonth' && (
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Day of Month (1-28)</label>
                        <input
                          type="number"
                          min="1"
                          max="28"
                          value={personSettings?.dayOfMonth || 1}
                          onChange={(e) => updatePersonTransferSettings(person.id, 'dayOfMonth', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}

                    {personSettings?.type === 'weekDayOfMonth' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Week</label>
                          <select
                            value={personSettings?.weekNumber || '1st'}
                            onChange={(e) => updatePersonTransferSettings(person.id, 'weekNumber', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {weekNumbers.map(week => (
                              <option key={week} value={week}>{week}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
                          <select
                            value={personSettings?.weekDayOfMonth || 'Monday'}
                            onChange={(e) => updatePersonTransferSettings(person.id, 'weekDayOfMonth', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {weekDays.map(day => (
                              <option key={day} value={day}>{day}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 mt-2">
                    Example: {personSettings?.frequency} on{' '}
                    {personSettings?.type === 'dayOfWeek' && `every ${personSettings?.dayOfWeek}`}
                    {personSettings?.type === 'dayOfMonth' && `the ${personSettings?.dayOfMonth}${personSettings?.dayOfMonth === 1 ? 'st' : personSettings?.dayOfMonth === 2 ? 'nd' : personSettings?.dayOfMonth === 3 ? 'rd' : 'th'} of each month`}
                    {personSettings?.type === 'weekDayOfMonth' && `the ${personSettings?.weekNumber} ${personSettings?.weekDayOfMonth} of each month`}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t">
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className={`w-full py-2 rounded-lg transition-colors flex items-center justify-center gap-2 ${
              hasChanges
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Save className="h-4 w-4" />
            Save Settings
          </button>
        </div>
      </div>

      <div className="bg-blue-50 rounded-lg p-4 md:p-6">
        <h3 className="font-semibold text-blue-900 mb-2">About Budget Tracker</h3>
        <p className="text-sm text-blue-800 mb-4">
          This budget tracking application helps you manage expenses, track income from multiple sources, 
          and calculate fair bill allocations between multiple people.
        </p>
        
        <div className="space-y-2 text-sm text-blue-700">
          <p className="flex items-center gap-2">
            <span className="font-medium">Version:</span> 1.0.0
          </p>
          <p className="flex items-center gap-2">
            <span className="font-medium">Features:</span> Expense tracking, Income management, Bill allocation, Multi-person support
          </p>
        </div>
      </div>
    </div>
  )
}