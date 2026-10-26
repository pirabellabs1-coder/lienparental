'use client'
import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner'
import { CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      offset={16}
      visibleToasts={3}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast: 'group pointer-events-auto flex items-start gap-3 w-full max-w-sm rounded-xl2 border border-night-100 dark:border-night-800 bg-white dark:bg-night-900 text-night-900 dark:text-night-50 shadow-card px-4 py-3',
          title: 'text-sm font-semibold',
          description: 'text-xs text-night-500 dark:text-night-300 mt-0.5',
          actionButton: 'rounded-xl bg-leaf-500 hover:bg-leaf-600 text-white text-xs font-semibold px-3 py-1.5',
          cancelButton: 'rounded-lg bg-night-100 dark:bg-night-800 text-night-900 dark:text-night-50 text-xs font-semibold px-3 py-1.5',
          success: '!border-leaf-200 !bg-leaf-50 !text-leaf-900',
          error: '!border-alert-200 !bg-alert-50 !text-alert-700',
          warning: '!border-gold-200 !bg-gold-50 !text-gold-800',
          info: '!border-night-200 !bg-night-50 !text-night-900',
        }
      }}
      icons={{
        success: <CheckCircle2 className="h-5 w-5 text-leaf-500" />,
        error:   <AlertCircle className="h-5 w-5 text-alert-500" />,
        warning: <AlertTriangle className="h-5 w-5 text-gold-500" />,
        info:    <Info className="h-5 w-5 text-night-700" />,
      }}
    />
  )
}

type ToastOpts = { description?: ReactNode; duration?: number; action?: { label: string; onClick: () => void } }

export const toast = {
  success: (title: string, opts?: ToastOpts) => sonnerToast.success(title, opts),
  error:   (title: string, opts?: ToastOpts) => sonnerToast.error(title, opts),
  warning: (title: string, opts?: ToastOpts) => sonnerToast.warning(title, opts),
  info:    (title: string, opts?: ToastOpts) => sonnerToast.info(title, opts),
  message: (title: string, opts?: ToastOpts) => sonnerToast(title, opts),
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
}
