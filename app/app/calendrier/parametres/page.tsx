'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarCheck2, CheckCircle2, Loader2, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { typeStyle } from '@/components/calendrier/eventTypeStyles'
import { GoogleLogo } from '@/components/auth/GoogleButton'
import { RadioGroup, Switch, Select, Button, Badge, ConfirmDialog } from '@/components/ui'
import {
  EVENT_TYPES, REMINDER_OPTIONS, DEFAULT_TYPE_REMINDER_ENABLED, DEFAULT_TZ,
  type EventTypeKey, type ReminderKey,
} from '@/lib/calendrier'
import { resetGoogleSyncHint } from '@/lib/integrations/google/client'
import type { CalendarTarget, GoogleCalendarState, MaskMode, SyncResponse, UiEventType } from '@/lib/integrations/google/types'
import { cn } from '@/lib/cn'

const TZ_OPTIONS = [
  { value: 'America/Cayenne', label: 'Guyane, Cayenne (par défaut)' },
  { value: 'America/Martinique', label: 'Martinique' },
  { value: 'America/Guadeloupe', label: 'Guadeloupe' },
  { value: 'Europe/Paris',    label: 'Europe/Paris' },
  { value: 'Europe/Brussels', label: 'Europe/Bruxelles' },
  { value: 'Europe/Zurich',   label: 'Europe/Zurich' },
  { value: 'Europe/London',   label: 'Europe/Londres' },
  { value: 'America/Montreal',label: 'Amérique/Montréal' },
  { value: 'Africa/Dakar',    label: 'Afrique/Dakar' },
]

export default function ParametresCalendrierPage() {
  const [defaultReminder, setDefaultReminder] = useState<ReminderKey>('1h')
  const [enabled, setEnabled] = useState<Record<EventTypeKey, boolean>>(DEFAULT_TYPE_REMINDER_ENABLED)
  const [tz, setTz] = useState<string>(DEFAULT_TZ)
  const [saved, setSaved] = useState(false)

  const onSave = () => {
    // Supabase plug-in point : upsert dans `user_preferences` (reminder_default, type_toggles, timezone)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <>
      <TopBar title="Paramètres des rappels" showBack backHref="/app/calendrier/rappels" showBell={false} />
      <div className="mx-auto w-full max-w-2xl px-4 pb-6 pt-2">
      <section className="mt-5">
        <h2 className="font-display text-sm font-semibold text-night-900">Délai du rappel par défaut</h2>
        <p className="mt-0.5 text-xs text-night-500">Appliqué aux nouveaux événements.</p>
        <div className="mt-2">
          <RadioGroup
            value={defaultReminder}
            onChange={(v) => setDefaultReminder(v as ReminderKey)}
            options={REMINDER_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
            columns={1}
          />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-display text-sm font-semibold text-night-900">Activation par type</h2>
        <p className="mt-0.5 text-xs text-night-500">Recevez les rappels seulement pour les types activés.</p>
        <div className="mt-2 rounded-xl2 border border-night-100 bg-white shadow-soft divide-y divide-night-100 px-4">
          {EVENT_TYPES.map((t) => (
            <Switch
              key={t.key}
              label={<span className="inline-flex items-center gap-2"><span className={cn('h-2 w-2 rounded-full', typeStyle(t.key).dot)} aria-hidden="true" />{t.label}</span>}
              checked={enabled[t.key]}
              onChange={(e) => setEnabled(prev => ({ ...prev, [t.key]: e.target.checked }))}
            />
          ))}
        </div>
      </section>

      <section className="mt-6">
        <Select
          label="Fuseau horaire"
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          options={TZ_OPTIONS}
          hint="Les heures affichées dans l'application seront converties selon ce fuseau."
        />
      </section>

      <div className="mt-6">
        <Button variant="primary" full size="lg" onClick={onSave}>
          Enregistrer les paramètres
        </Button>
        {saved && (
          <p role="status" aria-live="polite" className="mt-2 text-center text-sm font-medium text-leaf-700">
            Préférences enregistrées.
          </p>
        )}
      </div>

      <GoogleCalendarSection />
      </div>
    </>
  )
}

// --- Synchronisation Google Agenda (chantier G) --------------------------------

const API = '/api/integrations/google/calendar'

const RETURN_MESSAGES: Record<string, { tone: 'ok' | 'error'; text: string }> = {
  connecte: { tone: 'ok', text: 'Google Agenda est connecté. Vos événements à venir sont en cours d’envoi.' },
  refuse: { tone: 'error', text: 'Vous avez refusé l’accès à Google Agenda : rien n’a été connecté.' },
  etat_invalide: { tone: 'error', text: 'La demande de connexion a expiré ou n’est pas valide. Recommencez depuis cet écran.' },
  autorisation_incomplete: { tone: 'error', text: 'Google n’a pas accordé l’accès à l’agenda. Recommencez en laissant l’autorisation demandée cochée.' },
  indisponible: { tone: 'error', text: 'Google ne répond pas pour le moment. Réessayez dans quelques minutes.' },
  non_configure: { tone: 'error', text: 'La connexion à Google Agenda n’est pas encore configurée sur ce service.' },
  erreur: { tone: 'error', text: 'La connexion à Google Agenda a échoué. Réessayez.' },
}

const MASK_OPTIONS: { value: MaskMode; label: string; description: string }[] = [
  { value: 'sensitive', label: 'Masquer les rendez-vous santé (recommandé)', description: 'Titre « Rendez-vous santé », sans lieu ni description.' },
  { value: 'all', label: 'Masquer tous les détails', description: 'Chaque événement apparaît avec un titre générique (Visite, École…).' },
  { value: 'none', label: 'Tout afficher', description: 'Titre, lieu et description sont copiés dans Google Agenda.' },
]

const TARGET_OPTIONS: { value: CalendarTarget; label: string; description: string }[] = [
  { value: 'dedicated', label: 'Un agenda « Lien Parental » (recommandé)', description: 'Créé automatiquement. Lien Parental n’a accès à aucun autre agenda.' },
  { value: 'primary', label: 'Mon agenda principal', description: 'Les événements s’ajoutent à votre agenda Google habituel.' },
]

type Connection = Extract<GoogleCalendarState, { configured: true }>['connection']

async function api<T>(method: string, path = '', body?: unknown): Promise<{ ok: boolean; status: number; data: T | null; message: string | null }> {
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => null)) as (T & { error?: { message?: string; code?: string } }) | null
    return { ok: res.ok, status: res.status, data: res.ok ? json : null, message: json?.error?.message ?? null }
  } catch {
    return { ok: false, status: 0, data: null, message: 'Connexion impossible. Vérifiez votre réseau.' }
  }
}

function formatDateTime(iso: string | null) {
  if (!iso) return null
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: DEFAULT_TZ }).format(new Date(iso))
  } catch {
    return null
  }
}

function GoogleCalendarSection() {
  const [state, setState] = useState<GoogleCalendarState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState<null | 'connect' | 'save' | 'sync' | 'disconnect'>(null)
  const [target, setTarget] = useState<CalendarTarget>('dedicated')
  const [types, setTypes] = useState<UiEventType[]>([])
  const [mask, setMask] = useState<MaskMode>('sensitive')
  const [progress, setProgress] = useState<number | null>(null)
  const [confirmOff, setConfirmOff] = useState(false)
  const draining = useRef(false)

  const applyConnection = (c: Connection) => {
    if (!c) return
    setTarget(c.target)
    setTypes(c.syncTypes)
    setMask(c.maskMode)
  }

  const load = useCallback(async () => {
    const r = await api<GoogleCalendarState>('GET')
    if (!r.ok || !r.data) {
      setLoadError(r.message ?? 'Impossible de lire l’état de la synchronisation.')
      return null
    }
    setLoadError(null)
    setState(r.data)
    if (r.data.configured) applyConnection(r.data.connection)
    return r.data
  }, [])

  /** Écoule la file par lots (10 événements par appel) en affichant la progression. */
  const drain = useCallback(async (first: 'process' | 'resync' = 'process') => {
    if (draining.current) return
    draining.current = true
    let action: 'process' | 'resync' = first
    try {
      for (let i = 0; i < 30; i++) {
        const r = await api<SyncResponse>('POST', '/sync', { action })
        action = 'process'
        if (!r.ok || !r.data || r.data.status !== 'processed') {
          if (r.message) setNotice({ tone: 'error', text: r.message })
          break
        }
        setProgress(r.data.remaining)
        if (r.data.reauthRequired || r.data.remaining === 0 || r.data.processed === 0) break
      }
    } finally {
      draining.current = false
      setProgress(null)
      await load()
    }
  }, [load])

  useEffect(() => {
    // Retour de Google : message puis nettoyage de l'URL (le code n'y figure plus, seul ?google=…).
    const code = new URLSearchParams(window.location.search).get('google')
    if (code) {
      setNotice(RETURN_MESSAGES[code] ?? RETURN_MESSAGES.erreur)
      window.history.replaceState(null, '', window.location.pathname)
      if (code === 'connecte') resetGoogleSyncHint()
    }
    void load().then((s) => {
      if (s?.configured && s.connection?.status === 'active' && s.connection.pending > 0) void drain()
    })
  }, [load, drain])

  const connect = async (t: CalendarTarget = target) => {
    setBusy('connect')
    setNotice(null)
    const r = await api<{ url: string }>('POST', '/connect', { target: t })
    if (r.ok && r.data?.url) {
      window.location.assign(r.data.url)
      return
    }
    setBusy(null)
    setNotice({ tone: 'error', text: r.message ?? 'La connexion à Google n’a pas pu démarrer.' })
  }

  const save = async () => {
    if (!state?.configured || !state.connection) return
    setBusy('save')
    setNotice(null)
    const r = await api<{ queued: number }>('PATCH', '', { syncTypes: types, maskMode: mask, target })
    setBusy(null)
    if (r.status === 409 && target !== state.connection.target) {
      // Nouvelle cible non autorisée : on repasse par Google avec la portée adaptée.
      await connect(target)
      return
    }
    if (!r.ok) {
      setNotice({ tone: 'error', text: r.message ?? 'Les préférences n’ont pas pu être enregistrées.' })
      return
    }
    setNotice({ tone: 'ok', text: 'Préférences de synchronisation enregistrées.' })
    await drain()
  }

  const disconnect = async () => {
    setBusy('disconnect')
    const r = await api<{ revoked: boolean }>('DELETE')
    setBusy(null)
    setConfirmOff(false)
    if (!r.ok) {
      setNotice({ tone: 'error', text: r.message ?? 'La déconnexion a échoué.' })
      return
    }
    setNotice({
      tone: 'ok',
      text: r.data?.revoked
        ? 'Google Agenda est déconnecté et l’accès de Lien Parental a été révoqué.'
        : 'Google Agenda est déconnecté. Pensez à retirer aussi l’accès depuis votre compte Google.',
    })
    await load()
  }

  const toggleType = (k: UiEventType) => setTypes((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))

  const conn = state?.configured ? state.connection : null
  const active = conn?.status === 'active'
  const needsReauth = conn?.status === 'reauth_required'

  return (
    <section className="mt-10 border-t border-night-100 pt-6" aria-labelledby="gcal-title" aria-busy={state === null}>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl2 border border-night-100 bg-white shadow-soft">
          <GoogleLogo className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 id="gcal-title" className="font-display text-base font-bold text-night-900">Synchronisation Google Agenda</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-night-500">
            Les événements créés, modifiés ou supprimés dans Lien Parental sont reportés automatiquement dans Google Agenda.
          </p>
        </div>
      </div>

      <div aria-live="polite">
        {notice && (
          <p
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'mt-4 flex items-start gap-2 rounded-xl2 px-3.5 py-3 text-sm font-medium',
              notice.tone === 'ok' ? 'bg-leaf-50 text-leaf-800' : 'bg-alert-50 text-alert-700',
            )}
          >
            {notice.tone === 'ok'
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
            <span>{notice.text}</span>
          </p>
        )}
      </div>

      <div className="mt-4 rounded-xl2 border border-night-100 bg-white p-4 shadow-soft">
        {state === null && !loadError && (
          <p className="flex items-center gap-2 text-sm text-night-600">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> Chargement…
          </p>
        )}

        {loadError && (
          <div className="space-y-3">
            <p role="alert" className="text-sm font-medium text-alert-700">{loadError}</p>
            <Button variant="secondary" onClick={() => void load()}>Réessayer</Button>
          </div>
        )}

        {state && !state.configured && (
          <div className="space-y-2">
            <Badge variant="neutral">Non configurée</Badge>
            <p className="text-sm text-night-800">
              La connexion à Google Agenda n’est pas encore configurée sur ce service.
            </p>
            <p className="text-xs leading-relaxed text-night-500">
              {state.mode === 'demo'
                ? 'En mode démonstration, aucun agenda externe ne peut être relié. Vous pouvez toujours ajouter un événement à Google Agenda depuis sa fiche.'
                : 'Elle sera proposée ici dès son activation. En attendant, chaque événement peut être ajouté à Google Agenda depuis sa fiche.'}
            </p>
          </div>
        )}

        {state?.configured && !conn && (
          <div className="space-y-4">
            <RadioGroup
              label="Où envoyer vos événements ?"
              value={target}
              onChange={(v) => setTarget(v as CalendarTarget)}
              options={TARGET_OPTIONS}
            />
            <p className="flex items-start gap-2 text-xs leading-relaxed text-night-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden />
              Envoi uniquement, de Lien Parental vers Google : vos autres événements Google ne sont jamais lus.
              Les rendez-vous santé sont masqués par défaut. Vous pouvez déconnecter à tout moment.
            </p>
            <Button full size="lg" onClick={() => void connect()} disabled={busy !== null} aria-busy={busy === 'connect'}>
              <CalendarCheck2 className="h-5 w-5" aria-hidden />
              {busy === 'connect' ? 'Redirection vers Google…' : 'Connecter Google Agenda'}
            </Button>
          </div>
        )}

        {conn && needsReauth && (
          <div className="space-y-3">
            <Badge variant="warning">Reconnexion nécessaire</Badge>
            <p className="text-sm text-night-800">
              Google a refusé l’accès (autorisation retirée ou expirée). Les modifications sont en attente et seront envoyées après reconnexion.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button size="lg" onClick={() => void connect(conn.target)} disabled={busy !== null} className="sm:flex-1">
                {busy === 'connect' ? 'Redirection vers Google…' : 'Reconnecter Google Agenda'}
              </Button>
              <Button variant="secondary" size="lg" onClick={() => setConfirmOff(true)} disabled={busy !== null} className="sm:flex-1">
                Déconnecter
              </Button>
            </div>
          </div>
        )}

        {conn && active && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <Badge variant="success" dot>Connecté</Badge>
                <p className="mt-1.5 truncate text-sm font-semibold text-night-900">{conn.googleEmail ?? 'Compte Google'}</p>
                <p className="text-xs text-night-500">
                  {conn.target === 'dedicated' ? 'Agenda « Lien Parental »' : 'Agenda principal'}
                  {conn.lastSyncAt && <> · Dernier envoi le {formatDateTime(conn.lastSyncAt)}</>}
                </p>
              </div>
            </div>

            {(progress !== null || conn.pending > 0 || conn.failed > 0) && (
              <p role="status" className="flex items-center gap-2 rounded-xl bg-night-50 px-3 py-2 text-xs text-night-700">
                {progress !== null ? (
                  <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> Envoi en cours, {progress} événement{progress > 1 ? 's' : ''} restant{progress > 1 ? 's' : ''}.</>
                ) : conn.pending > 0 ? (
                  <>{conn.pending} événement{conn.pending > 1 ? 's' : ''} en attente d’envoi (nouvel essai automatique).</>
                ) : (
                  <>{conn.failed} événement{conn.failed > 1 ? 's n’ont' : ' n’a'} pas pu être envoyé{conn.failed > 1 ? 's' : ''}. Utilisez « Tout renvoyer ».</>
                )}
              </p>
            )}

            <fieldset>
              <legend className="text-sm font-semibold text-night-900">Types d’événements envoyés</legend>
              <p className="mt-0.5 text-xs text-night-500">Touchez un type pour l’ajouter ou le retirer.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {EVENT_TYPES.map((t) => {
                  const on = types.includes(t.key)
                  return (
                    <button
                      key={t.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleType(t.key)}
                      className={cn(
                        'inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors motion-reduce:transition-none',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2',
                        on ? 'border-leaf-500 bg-leaf-50 text-night-900' : 'border-[#E5E7EB] bg-white text-night-600 hover:border-night-300',
                      )}
                    >
                      <span className={cn('h-2 w-2 rounded-full', on ? typeStyle(t.key).dot : 'bg-night-200')} aria-hidden="true" />
                      {t.label}
                    </button>
                  )
                })}
              </div>
              {types.length === 0 && <p className="mt-2 text-xs font-medium text-alert-600">Aucun type sélectionné : rien ne sera envoyé.</p>}
            </fieldset>

            <RadioGroup label="Confidentialité dans Google Agenda" value={mask} onChange={(v) => setMask(v as MaskMode)} options={MASK_OPTIONS} />

            <RadioGroup
              label="Agenda de destination"
              value={target}
              onChange={(v) => setTarget(v as CalendarTarget)}
              options={TARGET_OPTIONS.map((o) => ({
                ...o,
                description: conn.canUse[o.value] || o.value === conn.target ? o.description : `${o.description} Une nouvelle autorisation Google sera demandée.`,
              }))}
              hint="Les événements déjà envoyés restent dans leur agenda d’origine."
            />

            <div className="flex flex-col gap-2">
              <Button full size="lg" onClick={() => void save()} disabled={busy !== null} aria-busy={busy === 'save'}>
                {busy === 'save' ? 'Enregistrement…' : 'Enregistrer la synchronisation'}
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="secondary"
                  size="lg"
                  className="sm:flex-1"
                  disabled={busy !== null || progress !== null}
                  onClick={async () => { setBusy('sync'); setNotice(null); await drain('resync'); setBusy(null) }}
                >
                  <RefreshCw className={cn('h-4 w-4', busy === 'sync' && 'animate-spin motion-reduce:animate-none')} aria-hidden />
                  Tout renvoyer
                </Button>
                <Button variant="secondary" size="lg" className="sm:flex-1 text-alert-600" disabled={busy !== null} onClick={() => setConfirmOff(true)}>
                  Déconnecter
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        onConfirm={disconnect}
        loading={busy === 'disconnect'}
        title="Déconnecter Google Agenda ?"
        description="Lien Parental n’enverra plus rien à Google et son accès sera révoqué. Les événements déjà envoyés restent dans votre agenda Google."
        confirmLabel="Déconnecter"
      />
    </section>
  )
}
