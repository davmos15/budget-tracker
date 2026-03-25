import { useState } from 'react'
import { HelpCircle, X } from 'lucide-react'

export default function InfoTooltip({ text, className = '' }) {
  const [show, setShow] = useState(false)

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="p-0.5 text-slate-300 hover:text-brand-500 transition-colors"
        aria-label="More info"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      {show && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShow(false)} />
          <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-lg animate-fade-in">
            <button
              onClick={() => setShow(false)}
              className="absolute top-1.5 right-1.5 text-white/50 hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
            <p className="leading-relaxed pr-4">{text}</p>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
              <div className="w-2 h-2 bg-slate-800 rotate-45" />
            </div>
          </div>
        </>
      )}
    </span>
  )
}
