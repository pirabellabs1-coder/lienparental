'use client'

import { notFound, useRouter } from 'next/navigation'
import { use, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { TopBar } from '@/components/mobile/TopBar'
import {
  EmptyState, ErrorState, LoadingState, MaintenanceState, OfflineState, ProgressOperation,
  SuccessState, UpToDateState, type OperationKind,
} from '@/components/mobile/StateScreens'

// Rendu plein écran de chaque état système (revue client). Les opérations longues
// progressent en démo jusqu'à la valeur de la maquette.
// Titres traduits au rendu : account.states.items.{slug}.title.
const SLUGS = new Set([
  'chargement', 'succes', 'erreur', 'hors-connexion', 'vide', 'maintenance',
  'synchronisation', 'sauvegarde', 'suppression', 'importation', 'mise-a-jour', 'a-jour',
])

const TARGET: Record<OperationKind, number> = {
  synchronisation: 68,
  sauvegarde: 45,
  suppression: 50,
  importation: 70,
  'mise-a-jour': 58,
}

function useDemoProgress(target: number, active: boolean) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!active) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setValue(target); return }
    const id = window.setInterval(() => {
      setValue((v) => {
        const next = Math.min(target, v + 4)
        if (next >= target) window.clearInterval(id)
        return next
      })
    }, 120)
    return () => window.clearInterval(id)
  }, [target, active])
  return value
}

export default function EtatPage({ params }: { params: Promise<{ etat: string }> }) {
  const { etat } = use(params)
  const t = useTranslations('account.states')
  const router = useRouter()
  if (!SLUGS.has(etat)) notFound()
  const title = t(`items.${etat}.title`)

  const isOp = etat in TARGET
  const value = useDemoProgress(isOp ? TARGET[etat as OperationKind] : 0, isOp)
  const toList = () => router.push('/app/etats')
  const toHome = () => router.push('/app')

  let screen: React.ReactNode
  switch (etat) {
    case 'chargement':
      screen = <LoadingState />
      break
    case 'succes':
      screen = <SuccessState primary={{ label: t('demo.continue'), href: '/app' }} secondary={{ label: t('demo.details'), href: '/app/journal' }} />
      break
    case 'erreur':
      screen = <ErrorState code={500} primary={{ label: t('demo.retry'), href: '/app/etats/chargement' }} />
      break
    case 'hors-connexion':
      screen = <OfflineState secondary={{ label: t('demo.offline'), href: '/app' }} />
      break
    case 'vide':
      screen = (
        <EmptyState
          primary={{ label: t('demo.add'), href: '/app/journal/nouveau' }}
          secondary={{ label: t('demo.learnMore'), href: '/app/aide' }}
        />
      )
      break
    case 'maintenance':
      screen = <MaintenanceState primary={{ label: t('demo.retryLater'), href: '/app/etats' }} />
      break
    case 'a-jour':
      screen = <UpToDateState />
      break
    case 'synchronisation':
    case 'sauvegarde':
      screen = <ProgressOperation kind={etat} value={value} onStay={() => {}} onBackground={toHome} />
      break
    case 'suppression':
      screen = <ProgressOperation kind="suppression" value={value} current={value >= 50 ? 1 : 0} total={2} onCancel={toList} />
      break
    case 'importation':
      screen = (
        <ProgressOperation kind="importation" value={value} fileName="Contrat_parental.pdf" fileSize={t('demo.fileSize')} remainingLabel={t('demo.remaining', { count: 3 })} onCancel={toList} />
      )
      break
    case 'mise-a-jour':
      screen = <ProgressOperation kind="mise-a-jour" value={value} version="1.8.0" onCancel={toList} />
      break
  }

  return (
    <>
      <TopBar title={title} showBack backHref="/app/etats" showBell={false} />
      {screen}
    </>
  )
}
