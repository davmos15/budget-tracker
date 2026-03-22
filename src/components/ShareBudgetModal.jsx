import { useState } from 'react'
import { Copy, Check, X, Share2 } from 'lucide-react'

export default function ShareBudgetModal({ budgetCode, onClose }) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(budgetCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = budgetCode
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-brand-600" />
            <h3 className="text-lg font-semibold text-slate-900">Share Budget</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="text-center mb-6">
            <p className="text-sm text-slate-500 mb-5">
              Share this code with others to give them access
            </p>

            <div className="relative inline-block">
              <div className="text-4xl font-mono font-bold text-brand-600 bg-brand-50 px-8 py-5 rounded-2xl tracking-widest border-2 border-brand-100">
                {budgetCode}
              </div>
              <button
                onClick={copyToClipboard}
                className={`absolute top-3 right-3 p-2 rounded-lg transition-all ${
                  copied ? 'bg-emerald-100 text-emerald-600' : 'bg-white/80 text-slate-400 hover:text-slate-600 hover:bg-white'
                }`}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            {copied && (
              <p className="text-sm text-emerald-600 mt-3 font-medium animate-fade-in">Copied to clipboard!</p>
            )}
          </div>

          <div className="bg-slate-50 rounded-xl p-4 mb-6">
            <h4 className="font-medium text-slate-900 mb-3 text-sm">How it works</h4>
            <div className="space-y-2.5">
              {[
                'Share this code with family or friends',
                'They enter it on the budget selection screen',
                'Instant access to the shared budget',
                'All changes sync in real-time'
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {i + 1}
                  </div>
                  <span className="text-sm text-slate-600">{step}</span>
                </div>
              ))}
            </div>
          </div>

          <button onClick={onClose} className="btn-secondary w-full">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
