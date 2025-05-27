import { useState } from 'react'
import { Copy, Check, X } from 'lucide-react'

export default function ShareBudgetModal({ budgetCode, onClose }) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = () => {
    navigator.clipboard.writeText(budgetCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Share Budget</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="text-center mb-6">
          <p className="text-sm text-gray-600 mb-4">
            Share this code with others to give them access to this budget
          </p>
          
          <div className="relative inline-block">
            <div className="text-4xl font-mono font-bold text-blue-600 bg-blue-50 px-6 py-4 rounded-lg">
              {budgetCode}
            </div>
            <button
              onClick={copyToClipboard}
              className="absolute top-2 right-2 p-2 text-gray-500 hover:text-gray-700 transition-colors"
            >
              {copied ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : (
                <Copy className="h-5 w-5" />
              )}
            </button>
          </div>
          
          {copied && (
            <p className="text-sm text-green-600 mt-2">Copied to clipboard!</p>
          )}
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h4 className="font-medium text-gray-900 mb-2">How it works:</h4>
          <ol className="text-sm text-gray-600 space-y-1">
            <li>1. Share this code with family or friends</li>
            <li>2. They enter the code on the budget selection screen</li>
            <li>3. They'll instantly have access to this shared budget</li>
            <li>4. All changes sync in real-time</li>
          </ol>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}