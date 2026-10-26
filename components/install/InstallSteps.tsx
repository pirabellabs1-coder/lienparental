'use client'
import { useState, type ReactNode } from 'react'
import { ChevronDown, MoreVertical, Share } from 'lucide-react'
import {
  AndroidConfirm, AndroidMenu, AndroidMenuBar, HomeScreenAdded,
  IosAddToHome, IosConfirm, IosShareBar, IosShareSheet,
} from './StepVisuals'

export type InstallOS = 'ios' | 'android'

type StepDef = { title: string; text: ReactNode; more: ReactNode; visual: ReactNode }

const SHARE = <Share className="inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
const DOTS = <><MoreVertical className="inline h-3.5 w-3.5 align-[-2px]" aria-hidden /><span className="sr-only">Menu (trois points)</span></>

const STEPS: Record<InstallOS, StepDef[]> = {
  ios: [
    {
      title: 'Ouvrez le menu de partage',
      text: <>Touchez le bouton Partager {SHARE} en bas de Safari.</>,
      more: <>Il s’agit du carré avec une flèche vers le haut, au centre de la barre du bas. Si la barre est masquée, touchez le bas de l’écran pour la faire réapparaître. Sur iPad, le bouton se trouve en haut à droite. Si vous utilisez un autre navigateur, ouvrez cette page dans Safari.</>,
      visual: <IosShareBar />,
    },
    {
      title: 'Faites défiler les options',
      text: <>Glissez vers le haut pour afficher toute la liste des actions.</>,
      more: <>Le menu s’ouvre depuis le bas de l’écran. Les actions se trouvent sous la rangée d’icônes d’applications : continuez à faire défiler jusqu’à voir « Sur l’écran d’accueil ».</>,
      visual: <IosShareSheet />,
    },
    {
      title: 'Ajoutez à l’écran d’accueil',
      text: <>Touchez « Sur l’écran d’accueil ».</>,
      more: <>L’option est accompagnée d’un carré avec un « + ». Si elle n’apparaît pas, touchez « Modifier les actions » tout en bas de la liste pour l’ajouter.</>,
      visual: <IosAddToHome />,
    },
    {
      title: 'Confirmez l’ajout',
      text: <>Touchez « Ajouter » en haut à droite.</>,
      more: <>Vous pouvez modifier le nom affiché avant de valider. L’icône Lien Parental apparaît ensuite sur votre écran d’accueil : touchez-la pour ouvrir l’application en plein écran.</>,
      visual: <IosConfirm />,
    },
  ],
  android: [
    {
      title: 'Ouvrez le menu',
      text: <>Touchez le bouton {DOTS} en haut à droite de Chrome.</>,
      more: <>Ce sont les trois points verticaux, à droite de la barre d’adresse. Avec un autre navigateur (Samsung Internet, Firefox), ouvrez son menu principal : l’option porte un nom proche.</>,
      visual: <AndroidMenuBar />,
    },
    {
      title: 'Sélectionnez « Ajouter à l’écran d’accueil »',
      text: <>Touchez cette option dans le menu.</>,
      more: <>Selon votre version de Chrome, elle peut s’appeler « Installer l’application ». Faites défiler le menu si vous ne la voyez pas tout de suite.</>,
      visual: <AndroidMenu />,
    },
    {
      title: 'Confirmez l’ajout',
      text: <>Vérifiez le nom puis touchez « Ajouter ».</>,
      more: <>Une fenêtre de confirmation s’ouvre. Le bouton peut aussi s’appeler « Installer ». Android peut ensuite vous proposer de placer l’icône vous-même sur l’écran d’accueil.</>,
      visual: <AndroidConfirm />,
    },
    {
      title: 'L’application est ajoutée',
      text: <>Retrouvez Lien Parental sur votre écran d’accueil.</>,
      more: <>L’icône apparaît sur l’écran d’accueil ou dans la liste de vos applications. Touchez-la pour ouvrir Lien Parental en plein écran, comme une application classique.</>,
      visual: <HomeScreenAdded />,
    },
  ],
}

/** Repliable « Menu défilant » : bouton sous le texte, contenu sur toute la largeur de l'étape. */
function StepMore({ id, n, children }: { id: string; n: number; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const panelId = `install-more-${id}`
  return (
    <>
      <div className="col-start-2 mt-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(o => !o)}
          className="-ml-1 inline-flex min-h-[44px] items-center rounded-lg px-1 text-[12.5px] font-semibold text-leaf-600 hover:text-leaf-700"
        >
          <span className="inline-flex items-center gap-1 rounded-md bg-leaf-50 px-2.5 py-1.5">
            Menu défilant<span className="sr-only"> : plus de détails sur l’étape {n}</span>
            <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>
      </div>
      <p id={panelId} hidden={!open} className="col-span-2 col-start-2 mb-1 mt-1 rounded-lg bg-night-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-night-800">
        {children}
      </p>
    </>
  )
}

export function InstallSteps({ os }: { os: InstallOS }) {
  const steps = STEPS[os]
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => {
        const last = i === steps.length - 1
        return (
          <li key={s.title} className="relative grid grid-cols-[32px_minmax(0,1fr)_104px] gap-x-3 pb-6 last:pb-0 sm:grid-cols-[32px_minmax(0,1fr)_128px]">
            {/* ligne verticale qui relie les étapes */}
            {!last && <span aria-hidden className="absolute bottom-0 left-[15.5px] top-9 w-px bg-leaf-200" />}
            <span aria-hidden className="relative z-10 grid h-8 w-8 place-items-center rounded-full bg-leaf-500 text-[14px] font-bold text-white">
              {i + 1}
            </span>
            <div className="min-w-0 pt-1">
              <h3 className="text-[15px] font-bold leading-snug text-night-900">
                <span className="sr-only">Étape {i + 1} : </span>{s.title}
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-night-700">{s.text}</p>
            </div>
            <div aria-hidden className="row-span-2 pt-1">{s.visual}</div>
            <StepMore id={`${os}-step-${i + 1}`} n={i + 1}>{s.more}</StepMore>
          </li>
        )
      })}
    </ol>
  )
}
