'use client'
import { useId } from 'react'
import { Search } from 'lucide-react'

/** Champ de recherche gris des écrans d'aide. */
export function SoftSearch({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  const id = useId()
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-night-500" aria-hidden />
      <input
        id={id}
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="min-h-[46px] w-full rounded-xl2 bg-night-50 pl-10 pr-3 text-[13.5px] text-night-900 placeholder:text-night-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
      />
    </div>
  )
}
