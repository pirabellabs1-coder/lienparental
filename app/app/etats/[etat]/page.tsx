'use client'

import { notFound, useRouter } from 'next/navigation'
import { use, useEffect, useState } from 'react'
import { TopBar } from '@/components/mobile/TopBar'
import {
  EmptyState, ErrorState, LoadingState, MaintenanceState, OfflineState, ProgressOperation,
  SuccessState, UpToDateState, type OperationKind,
} from '@/components/mobile/StateScreens'

// Rendu plein écran de chaque état système (revue client). Les opérations longues
// progressent en démo jusqu'à la valeur de la maquette.
const TITLES: Record<string, string> = {
  chargement: 'Chargement',
  succes: 'Succès',
  erreur: 'Erreur',
  'hors-connexion': 'Hors connexion',
  vide: 'Aucune donnée',
  maintenance: 'Maintenance',
  synchronisation: 'Synchronisation',
  sauvegarde: 'Sauvegarde',
  suppression: 'Suppression',
  importation: 'Importation',
  'mise-a-jour': 'Mise à jour',
  'a-jour': 'Tout est à jour',
}

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
  const router = useRouter()
  const title = TITLES[etat]
  if (!title) notFound()

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
      screen = <SuccessState primary={{ label: 'Continuer', href: '/app' }} secondary={{ label: 'Voir le détail', href: '/app/journal' }} />
      break
    case 'erreur':
      screen = <ErrorState code={500} primary={{ label: 'Réessayer', href: '/app/etats/chargement' }} />
      break
    case 'hors-connexion':
      screen = <OfflineState secondary={{ label: 'Travailler hors ligne', href: '/app' }} />
      break
    case 'vide':
      screen = (
        <EmptyState
          primary={{ label: 'Ajouter un élément', href: '/app/journal/nouveau' }}
          secondary={{ label: 'En savoir plus', href: '/app/aide' }}
        />
      )
      break
    case 'maintenance':
      screen = <MaintenanceState primary={{ label: 'Réessayer plus tard', href: '/app/etats' }} />
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
        <ProgressOperation kind="importation" value={value} fileName="Contrat_parental.pdf" fileSize="2,4 Mo" remainingLabel="3 fichiers restants" onCancel={toList} />
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
