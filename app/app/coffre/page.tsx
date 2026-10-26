'use client'

import Link from 'next/link'
import { Bell, ChevronRight, FolderOpen, Menu, Plus, Users } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { useCategories, useRequests } from '@/components/coffre/store'

// Coffre-fort — accueil (maquette « 1. Coffre-fort – Accueil »)
export default function CoffrePage() {
  // Supabase : compteurs issus de categories/documents/testimonies (RLS) ; démo : lib/mock-vault.
  const { categories } = useCategories()
  const { requests } = useRequests()
  const totalDocs = categories.reduce((s, c) => s + c.count, 0)
  const enAttente = requests.filter((r) => r.status === 'attente').length
  const recus = requests.reduce((s, r) => s + r.witnesses.filter((w) => w.status === 'recu').length, 0)

  return (
    <div className="w-full px-5 pb-6">
      <header
        className="flex items-center justify-between"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      >
        <Link href="/app" aria-label="Lien Parental, accueil" className="rounded-lg lg:invisible">
          <Logo size="sm" />
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/app/coffre/menu"
            aria-label="Menu du coffre-fort"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-night-900 transition-colors duration-200 hover:bg-night-50"
          >
            <Menu className="h-[22px] w-[22px]" aria-hidden="true" />
          </Link>
          <Link
            href="/app/notifications"
            aria-label="Notifications"
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-night-900 hover:bg-night-50"
          >
            <Bell className="h-[22px] w-[22px]" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <h1 className="mt-6 text-[26px] font-extrabold tracking-[-0.02em] text-night-900">Coffre-fort</h1>
      <p className="mt-1.5 max-w-[300px] text-[14px] leading-relaxed text-night-600">
        Gérez, sécurisez et partagez vos informations en toute sérénité.
      </p>

      <div className="mt-6 space-y-3.5">
        <Link
          href="/app/coffre/temoignages"
          className="group flex items-start gap-3.5 rounded-[20px] border border-iris-100 bg-iris-50 p-4 transition-[box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-card active:scale-[0.99]"
        >
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-iris-500 text-white shadow-[0_8px_18px_-8px_rgba(91,69,227,0.8)]">
            <Users className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-extrabold text-iris-700">Témoignages</span>
            <span className="mt-1 block text-[13px] leading-snug text-night-600">
              Créez vos demandes, suivez les témoignages reçus et conservez-les en sécurité.
            </span>
            <span className="mt-3 block text-[12.5px] font-semibold text-night-700">
              {enAttente} en attente <span aria-hidden="true">•</span> {recus} reçus
            </span>
          </span>
          <ChevronRight className="mt-4 h-5 w-5 shrink-0 text-iris-500 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>

        <Link
          href="/app/coffre/documents"
          className="group flex items-start gap-3.5 rounded-[20px] border border-leaf-100 bg-leaf-50 p-4 transition-[box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-card active:scale-[0.99]"
        >
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-leaf-500 text-white shadow-[0_8px_18px_-8px_rgba(46,125,50,0.8)]">
            <FolderOpen className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-extrabold text-leaf-700">Documents</span>
            <span className="mt-1 block text-[13px] leading-snug text-night-600">
              Stockez, organisez et accédez à tous vos documents importants.
            </span>
            <span className="mt-3 block text-[12.5px] font-semibold text-night-700">
              {totalDocs} documents <span aria-hidden="true">•</span> {categories.length} catégories
            </span>
          </span>
          <ChevronRight className="mt-4 h-5 w-5 shrink-0 text-leaf-600 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>

      <section aria-labelledby="acces-rapides" className="mt-7">
        <h2 id="acces-rapides" className="text-[15px] font-extrabold text-night-900">Accès rapides</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Link
            href="/app/coffre/temoignages/nouveau"
            className="flex min-h-[112px] flex-col items-start justify-between rounded-2xl border border-iris-100 bg-iris-50/70 p-3.5 transition-[box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-card active:scale-[0.99]"
          >
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-iris-500 text-iris-500">
              <Plus className="h-5 w-5" strokeWidth={2.6} />
            </span>
            <span className="text-[13px] font-bold leading-tight text-night-900">Nouvelle demande de témoignage</span>
          </Link>
          <Link
            href="/app/coffre/ajouter"
            className="flex min-h-[112px] flex-col items-start justify-between rounded-2xl border border-leaf-100 bg-leaf-50/70 p-3.5 transition-[box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-card active:scale-[0.99]"
          >
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full text-leaf-500">
              <Plus className="h-7 w-7" strokeWidth={2.4} />
            </span>
            <span className="text-[13px] font-bold leading-tight text-night-900">Ajouter un document</span>
          </Link>
        </div>
      </section>
    </div>
  )
}
