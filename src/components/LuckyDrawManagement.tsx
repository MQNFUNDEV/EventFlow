import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Check, Play, RefreshCw, RotateCw, Trophy, Users, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DEFAULT_PARTICIPANT_CATEGORIES, readParticipantCategories, categoryName, type ParticipantCategory } from '../lib/participantCategories'
import './LuckyDrawManagement.css'
import LuckyDrawMachine, { type BoxPhase } from './LuckyDrawMachine'
import { DEFAULT_IC_REGION_RULE, isIcRegionEligible, type IcRegionRule } from '../lib/icRegionEligibility'

async function fetchAllPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await fetchPage(offset, offset + 999)
    if (error) return { data: rows, error }
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return { data: rows, error: null }
  }
}

type PoolType = string
type Participant = { id: string; full_name: string; participant_code: string; category: string; ic_number: string | null }
type QueueEntry = { id: string; participant_id: string; queue_position: number; queue_status: 'available' | 'pending' | 'collected' | 'skipped'; participant: Omit<Participant, 'ic_number'> }
type Winner = { id: string; participant_id: string; status: 'pending' | 'collected' | 'skipped'; drawn_at: string; notes: string | null; participant: { full_name: string; category: string }; round: { name: string; pool_type: PoolType } }
type ThemePayload = { theme_colors?: unknown }

const DEFAULT_COLORS = ['#06152d', '#e31b45', '#1177ff', '#19d4ff', '#ff3e9d']

function pickIndex(length: number) {
  const limit = 0x100000000 - (0x100000000 % length)
  const sample = new Uint32Array(1)
  do { crypto.getRandomValues(sample) } while (sample[0] >= limit)
  return sample[0] % length
}

function formatDrawnAt(value: string) {
  return new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function getRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default function LuckyDrawManagement() {
  const [poolType, setPoolType] = useState<PoolType>('everyone')
  const [categories, setCategories] = useState<ParticipantCategory[]>(DEFAULT_PARTICIPANT_CATEGORIES)
  const [icRegionRule, setIcRegionRule] = useState<IcRegionRule>(DEFAULT_IC_REGION_RULE)
  const [checkedInCounts, setCheckedInCounts] = useState<Record<string, number> | null>(null)
  const [roundName, setRoundName] = useState('Lucky Draw Session')
  const [roundId, setRoundId] = useState<string | null>(null)
  const [prizeCategoryId, setPrizeCategoryId] = useState<string | null>(null)
  const [pool, setPool] = useState<Participant[]>([])
  const [winnerQueue, setWinnerQueue] = useState<QueueEntry[]>([])
  const [pendingQueueEntryId, setPendingQueueEntryId] = useState<string | null>(null)
  const [generatingQueue, setGeneratingQueue] = useState(false)
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<Winner[]>([])
  const [historyRoundId, setHistoryRoundId] = useState<string | null>(null)
  const [confirmedWinnerCount, setConfirmedWinnerCount] = useState(0)
  const [skippedWinnerCount, setSkippedWinnerCount] = useState(0)
  const [pendingWinner, setPendingWinner] = useState<Participant | null>(null)
  const [pendingWinnerRowId, setPendingWinnerRowId] = useState<string | null>(null)
  const [themeColors, setThemeColors] = useState(DEFAULT_COLORS)
  const [loading, setLoading] = useState(true)
  const [savingWinner, setSavingWinner] = useState(false)
  const [updatingOutput, setUpdatingOutput] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [boxPhase, setBoxPhase] = useState<BoxPhase>('idle')
  const [boxStartedAt, setBoxStartedAt] = useState(0)
  const [boxAnimationId, setBoxAnimationId] = useState(0)
  const [boxLoadingComplete, setBoxLoadingComplete] = useState(false)
  const boxTimerRef = useRef<number | null>(null)
  const roundRef = useRef<string | null>(null)
  const categoryRef = useRef<string | null>(null)
  const spinLockRef = useRef(false)
  const winnerActionLockRef = useRef(false)
  const leverActionLockRef = useRef(false)
  const leverTimersRef = useRef<number[]>([])
  const controllerReadyRef = useRef(false)

  const ensureDisplayController = useCallback(async () => {
    const { data, error: leaseError } = await supabase.rpc('acquire_display_controller', { p_lease_seconds: 90 })
    if (leaseError) {
      controllerReadyRef.current = false
      setError(`Could not acquire LED/Lucky Draw control: ${leaseError.message}`)
      return false
    }
    const lease = Array.isArray(data) ? data[0] : data
    if (!lease?.acquired) {
      controllerReadyRef.current = false
      setError('The LED display is currently controlled by another administrator. Ask them to release control, then refresh.')
      return false
    }
    controllerReadyRef.current = true
    return true
  }, [])

  async function publishBoxState(patch: Record<string, unknown>) {
    if (!await ensureDisplayController()) return false
    const { data, error: readError } = await supabase.from('display_state').select('payload').eq('id', 1).maybeSingle()
    if (readError) { setError(readError.message); return false }
    const current = data?.payload && typeof data.payload === 'object' ? data.payload as Record<string, unknown> : {}
    const { error: updateError } = await supabase.from('display_state').update({
      payload: { ...current, ...patch, sound_enabled: true },
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
    if (updateError) { setError(updateError.message); return false }
    return true
  }

  const eligiblePool = useMemo(() => pool.filter((participant) => !excludedIds.has(participant.id)), [pool, excludedIds])

  const refreshWinnerQueue = useCallback(async (targetRoundId: string | null = roundId) => {
    if (!targetRoundId) { setWinnerQueue([]); return }
    const { data, error: queueError } = await supabase.from('draw_entries')
      .select('id, participant_id, queue_position, queue_status, participants!inner(id, full_name, participant_code, category, ic_number)')
      .eq('draw_round_id', targetRoundId)
      .not('queue_position', 'is', null)
      .order('queue_position', { ascending: false })
      .limit(30)
    if (queueError) { setError(queueError.message); return }
    setWinnerQueue((data ?? []).map((row) => {
      const participant = getRelated(row.participants)
      return participant && (!icRegionRule.enabled || isIcRegionEligible(participant.ic_number, icRegionRule.allowed_codes)) ? {
        id: row.id,
        participant_id: row.participant_id,
        queue_position: row.queue_position ?? 0,
        queue_status: row.queue_status as QueueEntry['queue_status'],
        participant: {
          id: row.participant_id,
          full_name: participant.full_name,
          participant_code: participant.participant_code,
          category: participant.category,
        },
      } : null
    }).filter((entry): entry is QueueEntry => Boolean(entry)).sort((a, b) => a.queue_position - b.queue_position))
  }, [roundId, icRegionRule])

  const replenishWinnerQueue = useCallback(async (targetRoundId: string) => {
    const { count, error: countError } = await supabase.from('draw_entries')
      .select('id', { count: 'exact', head: true })
      .eq('draw_round_id', targetRoundId)
      .eq('queue_status', 'pending')
    if (countError) { setError(countError.message); return }
    let pendingCount = count ?? 0
    const remaining: Array<{ id: string; participant_id: string }> = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error: availableError } = await supabase.from('draw_entries')
        .select('id, participant_id')
        .eq('draw_round_id', targetRoundId)
        .eq('queue_status', 'available')
        .order('id', { ascending: true })
        .range(offset, offset + 999)
      if (availableError) { setError(availableError.message); return }
      remaining.push(...(data ?? []))
      if ((data ?? []).length < 1000) break
    }
    const { data: lastPosition, error: positionError } = await supabase.from('draw_entries')
      .select('queue_position')
      .eq('draw_round_id', targetRoundId)
      .not('queue_position', 'is', null)
      .order('queue_position', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (positionError) { setError(positionError.message); return }
    let nextPosition = (lastPosition?.queue_position ?? 0) + 1
    while (pendingCount < 10 && remaining.length) {
      const index = pickIndex(remaining.length)
      const candidate = remaining.splice(index, 1)[0]
      const { data: updated, error: updateError } = await supabase.from('draw_entries')
        .update({ queue_status: 'pending', queue_position: nextPosition })
        .eq('id', candidate.id)
        .eq('queue_status', 'available')
        .select('id')
        .maybeSingle()
      if (updateError) { setError(updateError.message); return }
      if (updated) { pendingCount += 1; nextPosition += 1 }
    }
    await refreshWinnerQueue(targetRoundId)
  }, [refreshWinnerQueue])

  useEffect(() => () => {
    if (boxTimerRef.current !== null) window.clearTimeout(boxTimerRef.current)
    leverTimersRef.current.forEach((timer) => window.clearTimeout(timer))
  }, [])

  const restoreActiveRound = useCallback(async () => {
    setLoading(true)
    const { data: activeRounds, error: roundError } = await supabase
      .from('draw_rounds')
      .select('id, name, pool_type, prize_category_id, status')
      .in('status', ['ready', 'drawing'])
      .order('updated_at', { ascending: false })
      .limit(2)
    if (roundError) {
      setError(roundError.message)
      setLoading(false)
      return
    }
    if ((activeRounds ?? []).length > 1) {
      setError('EventFlow found more than one active Lucky Draw session. Drawing is paused to protect the results. Contact an administrator before continuing.')
      setLoading(false)
      return
    }
    const activeRound = activeRounds?.[0]
    if (!activeRound) {
      setLoading(false)
      return
    }
    if (activeRound.status === 'ready') {
      const { error: closeError } = await supabase.from('draw_rounds')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', activeRound.id)
        .eq('status', 'ready')
      if (closeError) setError(`An interrupted pool setup was found and could not be safely closed: ${closeError.message}`)
      else setMessage('An unfinished pool setup was safely closed after refresh. No winner was drawn. Set the category again to load a complete pool.')
      setLoading(false)
      return
    }

    const [displayStateResult, entriesResult, winnersResult, queueResult] = await Promise.all([
      supabase.from('display_state').select('payload').eq('id', 1).maybeSingle(),
      fetchAllPages<{ participant_id: string; participants: { id: string; full_name: string; participant_code: string; category: string; ic_number: string | null; is_active: boolean } | { id: string; full_name: string; participant_code: string; category: string; ic_number: string | null; is_active: boolean }[] | null }>((from, to) => supabase.from('draw_entries')
        .select('participant_id, participants!inner(id, full_name, participant_code, category, ic_number, is_active)')
        .eq('draw_round_id', activeRound.id)
        .order('participant_id', { ascending: true }).range(from, to)),
      fetchAllPages<{ id: string; participant_id: string; status: string; notes: string | null }>((from, to) => supabase.from('draw_winners')
        .select('id, participant_id, status, notes')
        .eq('draw_round_id', activeRound.id)
        .order('drawn_at', { ascending: false }).order('id').range(from, to)),
      supabase.from('draw_entries')
        .select('id, participant_id, queue_position, queue_status, participants!inner(id, full_name, participant_code, category, ic_number)')
        .eq('draw_round_id', activeRound.id)
        .not('queue_position', 'is', null)
        .order('queue_position', { ascending: false })
        .limit(30),
    ])
    const restoreError = entriesResult.error ?? winnersResult.error ?? queueResult.error
    if (restoreError) {
      setError(restoreError.message)
      setLoading(false)
      return
    }

    const restoredPayload = displayStateResult.data?.payload && typeof displayStateResult.data.payload === 'object' ? displayStateResult.data.payload as Record<string, unknown> : {}
    const savedIcRule = restoredPayload.ic_region_rule as { enabled?: unknown; allowed_codes?: unknown } | undefined
    const restoredCodes = Array.isArray(savedIcRule?.allowed_codes) ? savedIcRule.allowed_codes.filter((code): code is string => typeof code === 'string' && /^\d{2}$/.test(code)) : DEFAULT_IC_REGION_RULE.allowed_codes
    const restoredRule: IcRegionRule = { enabled: savedIcRule?.enabled === true, allowed_codes: restoredCodes.length ? restoredCodes : DEFAULT_IC_REGION_RULE.allowed_codes }
    setIcRegionRule(restoredRule)

    const participants = entriesResult.data.map((row) => {
      const participant = getRelated(row.participants)
      return participant ? {
        id: row.participant_id,
        full_name: participant.full_name,
        participant_code: participant.participant_code,
        category: participant.category,
        ic_number: participant.ic_number,
      } : null
    }).filter((participant): participant is Participant => participant !== null && (!restoredRule.enabled || isIcRegionEligible(participant.ic_number, restoredRule.allowed_codes)))
    const previousDraws = winnersResult.data
    const confirmedParticipantIds = new Set(previousDraws
      .filter((winner) => winner.notes === 'Confirmed by operator')
      .map((winner) => winner.participant_id))
    const skippedParticipantIds = new Set(previousDraws
      .filter((winner) => winner.status === 'skipped')
      .map((winner) => winner.participant_id))
    const queuedEntries = (queueResult.data ?? []).map((row) => {
      const participant = getRelated(row.participants)
      const recoveredStatus = confirmedParticipantIds.has(row.participant_id)
        ? 'collected'
        : skippedParticipantIds.has(row.participant_id)
          ? 'skipped'
          : row.queue_status as QueueEntry['queue_status']
      return participant && (!restoredRule.enabled || isIcRegionEligible(participant.ic_number, restoredRule.allowed_codes)) ? {
        id: row.id,
        participant_id: row.participant_id,
        queue_position: row.queue_position ?? 0,
        queue_status: recoveredStatus,
        participant: { id: row.participant_id, full_name: participant.full_name, participant_code: participant.participant_code, category: participant.category },
      } : null
    }).filter((entry): entry is QueueEntry => Boolean(entry)).sort((a, b) => a.queue_position - b.queue_position)
    const removedParticipants = new Set([...confirmedParticipantIds, ...skippedParticipantIds])
    const legacyCollectedIds = previousDraws.filter((winner) => winner.notes === 'Confirmed by operator').map((winner) => winner.participant_id)
    const legacySkippedIds = previousDraws.filter((winner) => winner.status === 'skipped').map((winner) => winner.participant_id)
    if (legacyCollectedIds.length) {
      const { error: syncError } = await supabase.from('draw_entries').update({ queue_status: 'collected' })
        .eq('draw_round_id', activeRound.id).in('queue_status', ['available', 'pending']).in('participant_id', legacyCollectedIds)
      if (syncError) { setError(syncError.message); setLoading(false); return }
    }
    if (legacySkippedIds.length) {
      const { error: syncError } = await supabase.from('draw_entries').update({ queue_status: 'skipped' })
        .eq('draw_round_id', activeRound.id).in('queue_status', ['available', 'pending']).in('participant_id', legacySkippedIds)
      if (syncError) { setError(syncError.message); setLoading(false); return }
    }
    const pendingRow = previousDraws.find((winner) => winner.status === 'pending' && winner.notes !== 'Confirmed by operator')
    const pendingParticipant = pendingRow ? participants.find((participant) => participant.id === pendingRow.participant_id) ?? null : null

    setRoundName(activeRound.name)
    setPoolType(activeRound.pool_type as PoolType)
    setRoundId(activeRound.id)
    setPrizeCategoryId(activeRound.prize_category_id)
    setPool(participants)
    setWinnerQueue(queuedEntries)
    setPendingQueueEntryId(pendingParticipant ? queuedEntries.find((entry) => entry.participant_id === pendingParticipant.id)?.id ?? null : null)
    setExcludedIds(removedParticipants)
    setPendingWinner(pendingParticipant)
    setPendingWinnerRowId(pendingParticipant ? pendingRow?.id ?? null : null)
    const savedPayload = restoredPayload
    const savedPhase = savedPayload.box_phase
    const savedStartedAt = typeof savedPayload.box_started_at === 'number' ? savedPayload.box_started_at : 0
    const feedElapsed = savedStartedAt ? Math.max(0, Date.now() - savedStartedAt) : 0
    const isFeedStillRunning = savedPhase === 'loading' && feedElapsed < 14500
    const hasLoadedBox = savedPhase === 'loaded' || savedPhase === 'cranking' || savedPhase === 'shaking' || savedPhase === 'reveal' || (savedPhase === 'loading' && !isFeedStillRunning)
    if (pendingParticipant) {
      setBoxPhase('reveal')
      setBoxStartedAt(savedStartedAt)
      setBoxLoadingComplete(true)
    } else if (isFeedStillRunning) {
      setBoxPhase('loading')
      setBoxStartedAt(savedStartedAt)
      setBoxLoadingComplete(false)
      if (boxTimerRef.current !== null) window.clearTimeout(boxTimerRef.current)
      boxTimerRef.current = window.setTimeout(() => {
        setBoxPhase('loaded')
        setBoxLoadingComplete(true)
        void publishBoxState({ box_phase: 'loaded' })
      }, Math.max(0, 14500 - feedElapsed))
    } else if (hasLoadedBox) {
      setBoxPhase('loaded')
      setBoxStartedAt(savedStartedAt)
      setBoxLoadingComplete(true)
      void publishBoxState({ box_phase: 'loaded' })
    } else {
      setBoxPhase('idle')
      setBoxStartedAt(0)
      setBoxLoadingComplete(false)
    }
    setBoxAnimationId(typeof savedPayload.box_animation_id === 'number' ? savedPayload.box_animation_id : 0)
    setMessage(pendingParticipant
      ? 'Active draw restored. The last name is ready to confirm or skip.'
      : `Active draw restored with ${participants.length - removedParticipants.size} eligible guests.`)
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    let heartbeat: number | null = null
    const start = async () => {
      const acquired = await ensureDisplayController()
      if (cancelled) return
      if (!acquired) {
        setLoading(false)
        return
      }
      await restoreActiveRound()
      if (cancelled) return
      heartbeat = window.setInterval(() => {
        void ensureDisplayController()
      }, 30000)
    }
    void start()
    return () => {
      cancelled = true
      if (heartbeat !== null) window.clearInterval(heartbeat)
    }
  }, [ensureDisplayController, restoreActiveRound])

  useEffect(() => {
    let cancelled = false
    void supabase.from('display_state').select('payload').eq('id', 1).maybeSingle().then(({ data }) => { if (!cancelled) { setCategories(readParticipantCategories(data?.payload)); const payload = data?.payload && typeof data.payload === 'object' ? data.payload as Record<string, unknown> : {}; const saved = payload.ic_region_rule as { enabled?: unknown; allowed_codes?: unknown } | undefined; const codes = Array.isArray(saved?.allowed_codes) ? saved.allowed_codes.filter((code): code is string => typeof code === 'string' && /^\d{2}$/.test(code)) : DEFAULT_IC_REGION_RULE.allowed_codes; setIcRegionRule({ enabled: saved?.enabled === true, allowed_codes: codes.length ? codes : DEFAULT_IC_REGION_RULE.allowed_codes }) } })
    async function loadCategoryPreview() {
      const result = await fetchAllPages<{ participant_id: string; participants: { category: string; is_active: boolean; ic_number: string | null } | { category: string; is_active: boolean; ic_number: string | null }[] | null }>((from, to) => supabase.from('attendance')
        .select('participant_id, participants!inner(category, is_active, ic_number)')
        .eq('participants.is_active', true).order('participant_id').range(from, to))
      if (cancelled || result.error) return
      const counts = result.data.reduce((total, row) => {
        const participant = getRelated(row.participants)
        if (participant?.category && (!icRegionRule.enabled || isIcRegionEligible(participant.ic_number, icRegionRule.allowed_codes))) total[participant.category] = (total[participant.category] ?? 0) + 1
        return total
      }, {} as Record<string, number>)
      setCheckedInCounts(counts)
    }
    void loadCategoryPreview()

    // Keep the category totals in sync while admins are checking guests in.
    // Both tables are in the Supabase Realtime publication.
    const channel = supabase
      .channel('lucky-draw-category-checkin-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        void loadCategoryPreview()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'participants' }, () => {
        void loadCategoryPreview()
      })
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [icRegionRule])

  useEffect(() => {
    roundRef.current = roundId
    categoryRef.current = prizeCategoryId
  }, [roundId, prizeCategoryId])

  const refreshWinnerHistory = useCallback(async (targetRoundId: string | null = roundId ?? historyRoundId) => {
    if (!targetRoundId) {
      setHistory([])
      setConfirmedWinnerCount(0)
      setSkippedWinnerCount(0)
      return
    }
    const [historyResult, confirmedResult, skippedResult] = await Promise.all([
      supabase.from('draw_winners')
        .select('id, participant_id, status, drawn_at, notes, participants!inner(full_name, category), draw_rounds!inner(name, pool_type)')
        .eq('draw_round_id', targetRoundId)
        .order('drawn_at', { ascending: false })
        .limit(30),
      supabase.from('draw_winners')
        .select('id', { count: 'exact', head: true })
        .eq('draw_round_id', targetRoundId)
        .eq('notes', 'Confirmed by operator'),
      supabase.from('draw_winners')
        .select('id', { count: 'exact', head: true })
        .eq('draw_round_id', targetRoundId)
        .eq('status', 'skipped'),
    ])
    const historyError = historyResult.error ?? confirmedResult.error ?? skippedResult.error
    if (historyError) {
      setError(historyError.message)
      return
    }
    setConfirmedWinnerCount(confirmedResult.count ?? 0)
    setSkippedWinnerCount(skippedResult.count ?? 0)
    setHistory((historyResult.data ?? []).map((row) => ({
      id: row.id,
      participant_id: row.participant_id,
      status: row.status,
      drawn_at: row.drawn_at,
      notes: row.notes,
      participant: getRelated(row.participants) ?? { full_name: 'Guest', category: '' },
      round: getRelated(row.draw_rounds) ?? { name: 'Lucky Draw', pool_type: 'everyone' },
    })) as Winner[])
  }, [roundId, historyRoundId])

  useEffect(() => {
    if (roundId) return
    let cancelled = false
    void supabase.from('draw_rounds').select('id').eq('status', 'completed')
      .order('updated_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (!cancelled) setHistoryRoundId(data?.id ?? null) })
    return () => { cancelled = true }
  }, [roundId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshWinnerHistory() }, 0)
    return () => window.clearTimeout(timer)
  }, [refreshWinnerHistory])

  useEffect(() => {
    let cancelled = false
    async function loadTheme() {
      const { data } = await supabase.from('display_state').select('payload').eq('id', 1).maybeSingle()
      if (cancelled) return
      const payload = data?.payload && typeof data.payload === 'object' ? data.payload as ThemePayload : {}
      if (Array.isArray(payload.theme_colors) && payload.theme_colors.length === 5 && payload.theme_colors.every((color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))) setThemeColors(payload.theme_colors as string[])
    }
    void loadTheme()
    const channel = supabase.channel('lucky-draw-theme-settings')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'display_state', filter: 'id=eq.1' }, (change) => {
        const payload = change.new?.payload && typeof change.new.payload === 'object' ? change.new.payload as ThemePayload : {}
        if (Array.isArray(payload.theme_colors) && payload.theme_colors.length === 5 && payload.theme_colors.every((color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))) setThemeColors(payload.theme_colors as string[])
      })
      .subscribe()
    return () => { cancelled = true; void supabase.removeChannel(channel) }
  }, [])

  const loadPool = useCallback(async () => {
    setLoading(true)
    setError('')
    setMessage('')
    if (!await ensureDisplayController()) {
      setLoading(false)
      return
    }
    const { data: existingRound, error: existingRoundError } = await supabase.from('draw_rounds')
      .select('id')
      .in('status', ['ready', 'drawing'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existingRoundError) {
      setError(existingRoundError.message)
      setLoading(false)
      return
    }
    if (existingRound) {
      await restoreActiveRound()
      return
    }
    setPendingWinner(null)
    setPendingWinnerRowId(null)
    setRoundId(null)
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData.user) {
      setError('Sign in again to start a draw.')
      setLoading(false)
      return
    }

    const attendanceResult = await fetchAllPages<{ participant_id: string; participants: { id: string; full_name: string; participant_code: string; category: string; ic_number: string | null; is_active: boolean } | { id: string; full_name: string; participant_code: string; category: string; ic_number: string | null; is_active: boolean }[] | null }>((from, to) => supabase
      .from('attendance')
      .select('participant_id, participants!inner(id, full_name, participant_code, category, ic_number, is_active)')
      .eq('participants.is_active', true).order('participant_id').range(from, to))
    if (attendanceResult.error) {
      setError(attendanceResult.error.message)
      setLoading(false)
      return
    }
    const checkedInParticipants = attendanceResult.data.map((row) => {
      const participant = getRelated(row.participants)
      return participant ? { id: row.participant_id, full_name: participant.full_name, participant_code: participant.participant_code, category: participant.category, ic_number: participant.ic_number } : null
    }).filter((participant): participant is Participant => Boolean(participant))
    const categoryPool = checkedInParticipants.filter((participant) => (!icRegionRule.enabled || isIcRegionEligible(participant.ic_number, icRegionRule.allowed_codes)) && (poolType === 'everyone' || participant.category === poolType)).sort((a, b) => a.id.localeCompare(b.id))
    if (!categoryPool.length) {
      setPool([])
      setExcludedIds(new Set())
      setError(`No eligible checked-in ${poolType === 'everyone' ? 'guests' : categoryName(categories, poolType)} are available for this draw. Allowed IC region codes: ${icRegionRule.allowed_codes.join(', ')}.`)
      setLoading(false)
      return
    }

    let { data: category, error: categoryError } = await supabase.from('prize_categories').select('id').eq('name', 'Lucky Draw').maybeSingle()
    if (!category && !categoryError) {
      const inserted = await supabase.from('prize_categories').insert({ name: 'Lucky Draw', display_order: 0, is_active: true, created_by: authData.user.id }).select('id').single()
      category = inserted.data
      categoryError = inserted.error
    }
    if (categoryError || !category) {
      setError(categoryError?.message ?? 'Could not prepare the draw session.')
      setLoading(false)
      return
    }

    // A new session starts with every currently checked-in active participant.
    // Prior winners remain in the historical round and must not be excluded here.
    const alreadyDrawn = new Set<string>()
    const available = categoryPool

    const round = await supabase.from('draw_rounds').insert({
      prize_category_id: category.id,
      name: roundName.trim() || 'Lucky Draw Session',
      pool_type: poolType,
      status: 'ready',
      created_by: authData.user.id,
    }).select('id').single()
    if (round.error || !round.data) {
      setError(round.error?.message ?? 'Could not create the draw session.')
      setLoading(false)
      return
    }
    for (let offset = 0; offset < available.length; offset += 400) {
      const batch = available.slice(offset, offset + 400).map((participant) => ({ draw_round_id: round.data.id, participant_id: participant.id }))
      const { error: entryError } = await supabase.from('draw_entries').insert(batch)
      if (entryError) {
        await supabase.from('draw_rounds').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', round.data.id)
        setError(`Could not load the complete draw pool. The incomplete round was closed safely: ${entryError.message}`)
        setLoading(false)
        return
      }
    }
    const { error: activateError } = await supabase.from('draw_rounds')
      .update({ status: 'drawing', updated_at: new Date().toISOString() })
      .eq('id', round.data.id)
      .eq('status', 'ready')
    if (activateError) {
      await supabase.from('draw_rounds').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', round.data.id)
      setError(`Could not activate the new draw session. The unused round was closed: ${activateError.message}`)
      setLoading(false)
      return
    }
    setPrizeCategoryId(category.id)
    setRoundId(round.data.id)
    setPool(available)
    setExcludedIds(alreadyDrawn)
    setMessage(`Draw pool ready with ${available.length} checked-in ${available.length === 1 ? 'guest' : 'guests'}.`)
    const categoryLabel = poolType === 'everyone' ? 'Everyone' : categoryName(categories, poolType)
    await publishBoxState({ box_category: categoryLabel, box_total: available.length, box_phase: 'idle', box_started_at: 0, box_animation_id: boxAnimationId + 1 })
    setBoxPhase('idle'); setBoxStartedAt(0); setBoxAnimationId((value) => value + 1); setBoxLoadingComplete(false)
    await refreshWinnerHistory()
    setLoading(false)
  }, [poolType, roundName, categories, boxAnimationId, refreshWinnerHistory, restoreActiveRound, icRegionRule, ensureDisplayController])

  const spinCandidates = useCallback(async (chosen: Participant, queueEntryId: string) => {
    const activeRoundId = roundRef.current
    const activeCategoryId = categoryRef.current
    if (!activeRoundId || !activeCategoryId || spinLockRef.current) {
      leverActionLockRef.current = false
      setError(!activeRoundId || !activeCategoryId
        ? 'The draw session is no longer ready. Refresh the Lucky Draw session before pulling again.'
        : 'A winner selection is already in progress. Please wait for it to finish.')
      return
    }
    spinLockRef.current = true
    setSpinning(true)
    const { data, error: insertError } = await supabase.from('draw_winners').insert({
      draw_round_id: activeRoundId,
      prize_category_id: activeCategoryId,
      participant_id: chosen.id,
      status: 'pending',
      notes: 'Awaiting operator confirmation',
    }).select('id').single()
    if (insertError || !data) {
      setSpinning(false)
      spinLockRef.current = false
      leverActionLockRef.current = false
      setBoxPhase('loaded')
      void publishBoxState({ box_phase: 'loaded' })
      setError(insertError?.code === '23505'
        ? 'This guest has already been selected in this draw session. The winner list is being refreshed; please pull again.'
        : `Could not save the selected guest: ${insertError?.message ?? 'Unknown database error'}. The box is ready to retry.`)
      void refreshWinnerQueue(activeRoundId)
      return
    }
    setError('')
    setSpinning(false)
    setPendingWinner(chosen)
    setPendingWinnerRowId(data.id)
    setPendingQueueEntryId(queueEntryId)
    setBoxPhase('reveal')
    leverActionLockRef.current = false
    void publishBoxState({ box_phase: 'reveal' })
    setMessage('Winner revealed. Confirm them or skip and draw again.')
    void refreshWinnerHistory()
  }, [refreshWinnerHistory, refreshWinnerQueue])

  async function generateWinnerList() {
    if (!roundId || generatingQueue || pendingWinner) return
    setGeneratingQueue(true); setError(''); setMessage('')
    try {
      const { count, error: pendingError } = await supabase.from('draw_entries')
        .select('id', { count: 'exact', head: true })
        .eq('draw_round_id', roundId)
        .eq('queue_status', 'pending')
      if (pendingError) throw pendingError
      if ((count ?? 0) > 0) {
        await replenishWinnerQueue(roundId)
        setMessage('The winner list is already active. The pending queue has been topped up to 10 where participants remain.')
        return
      }
      const available: Array<{ id: string }> = []
      for (let offset = 0; ; offset += 1000) {
        const { data, error: availableError } = await supabase.from('draw_entries')
          .select('id')
          .eq('draw_round_id', roundId)
          .eq('queue_status', 'available')
          .order('id', { ascending: true })
          .range(offset, offset + 999)
        if (availableError) throw availableError
        available.push(...(data ?? []))
        if ((data ?? []).length < 1000) break
      }
      const { data: lastPosition, error: positionError } = await supabase.from('draw_entries')
        .select('queue_position')
        .eq('draw_round_id', roundId)
        .not('queue_position', 'is', null)
        .order('queue_position', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (positionError) throw positionError
      let nextPosition = (lastPosition?.queue_position ?? 0) + 1
      const candidates = [...available]
      const amount = Math.min(10, candidates.length)
      for (let index = 0; index < amount; index += 1) {
        const selected = candidates.splice(pickIndex(candidates.length), 1)[0]
        const { error: updateError } = await supabase.from('draw_entries')
          .update({ queue_status: 'pending', queue_position: nextPosition })
          .eq('id', selected.id)
          .eq('queue_status', 'available')
        if (updateError) throw updateError
        nextPosition += 1
      }
      await refreshWinnerQueue(roundId)
      setMessage(amount ? `Generated ${amount} winners in a saved order. The next 10 are ready for the lever.` : 'No eligible participants remain to generate a winner list.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate the winner list.')
    } finally {
      setGeneratingQueue(false)
    }
  }

  async function startSpin() {
    if (spinning || !roundId) {
      leverActionLockRef.current = false
      setBoxPhase('loaded')
      void publishBoxState({ box_phase: 'loaded' })
      setError(spinning
        ? 'A winner is already being saved. Wait for the current selection to finish.'
        : 'The draw session is no longer active. Refresh the Lucky Draw session before pulling again.')
      return
    }
    const { data: nextEntry, error: queueError } = await supabase.from('draw_entries')
      .select('id, participant_id, participants!inner(id, full_name, participant_code, category, ic_number)')
      .eq('draw_round_id', roundId)
      .eq('queue_status', 'pending')
      .order('queue_position', { ascending: true })
      .limit(1)
      .maybeSingle()
    const participant = nextEntry ? getRelated(nextEntry.participants) : null
    if (queueError || !nextEntry || !participant) {
      leverActionLockRef.current = false
      setBoxPhase('loaded')
      void publishBoxState({ box_phase: 'loaded' })
      setError(queueError?.message ?? 'No pending winner is queued. Generate a winner list first.')
      return
    }
    if (icRegionRule.enabled && !isIcRegionEligible(participant.ic_number, icRegionRule.allowed_codes)) {
      const { error: excludeError } = await supabase.from('draw_entries').update({ queue_status: 'skipped', queue_position: null }).eq('id', nextEntry.id)
      if (excludeError) setError(excludeError.message)
      else setError('This guest no longer meets the IC region rule and has been excluded from the draw pool.')
      await refreshWinnerQueue(roundId)
      return
    }
    await spinCandidates({
      id: nextEntry.participant_id,
      full_name: participant.full_name,
      participant_code: participant.participant_code,
      category: participant.category,
      ic_number: participant.ic_number,
    }, nextEntry.id)
  }

  async function resetBox() {
    if (boxTimerRef.current !== null) window.clearTimeout(boxTimerRef.current)
    const nextId = boxAnimationId + 1
    const saved = await publishBoxState({
      box_category: poolType === 'everyone' ? 'Everyone' : categoryName(categories, poolType),
      box_total: 0,
      box_phase: 'idle',
      box_started_at: 0,
      box_animation_id: nextId,
    })
    if (!saved) {
      setError((current) => current || 'Reset was not applied. The live Lucky Draw output has not changed.')
      return
    }
    setBoxPhase('idle')
    setBoxStartedAt(0)
    setBoxAnimationId(nextId)
    setBoxLoadingComplete(false)
    setMessage('Lucky Draw box reset. The live output now shows 0 names.')
  }

  async function startPaperFeed() {
    if (!roundId || !pool.length || spinning || boxPhase === 'loading') return
    if (boxTimerRef.current !== null) window.clearTimeout(boxTimerRef.current)
    const startedAt = Date.now()
    setBoxStartedAt(startedAt); setBoxPhase('loading'); setBoxLoadingComplete(false)
    await publishBoxState({ box_category: poolType === 'everyone' ? 'Everyone' : categoryName(categories, poolType), box_total: pool.length, box_phase: 'loading', box_started_at: startedAt, box_animation_id: boxAnimationId })
    boxTimerRef.current = window.setTimeout(() => {
      setBoxPhase('loaded'); setBoxLoadingComplete(true)
      void publishBoxState({ box_phase: 'loaded' })
    }, 14500)
  }

  async function pullBoxLever() {
    if (!roundId || !boxLoadingComplete || !winnerQueue.some((entry) => entry.queue_status === 'pending') || pendingWinner || leverActionLockRef.current) return
    leverActionLockRef.current = true
    setBoxPhase('cranking')
    await publishBoxState({ box_phase: 'cranking' })
    const crankTimer = window.setTimeout(() => {
      setBoxPhase('shaking')
      void publishBoxState({ box_phase: 'shaking' })
      const shakeTimer = window.setTimeout(() => {
        void startSpin()
      }, 4200)
      leverTimersRef.current.push(shakeTimer)
    }, 2400)
    leverTimersRef.current.push(crankTimer)
  }

  async function acceptWinner() {
    if (!pendingWinner || !pendingWinnerRowId || winnerActionLockRef.current) return
    winnerActionLockRef.current = true
    setSavingWinner(true)
    try {
      const winnerName = pendingWinner.full_name
      const remaining = eligiblePool.filter((participant) => participant.id !== pendingWinner.id)
      const { data: authData } = await supabase.auth.getUser()
      const { error: updateError } = await supabase.from('draw_winners')
        .update({ notes: 'Confirmed by operator', collected_at: new Date().toISOString(), collected_by: authData.user?.id ?? null })
        .eq('id', pendingWinnerRowId)
      if (updateError) {
        setError(updateError.message)
        return
      }
      const queueUpdate = pendingQueueEntryId
        ? await supabase.from('draw_entries').update({ queue_status: 'collected' }).eq('id', pendingQueueEntryId)
        : await supabase.from('draw_entries').update({ queue_status: 'collected' }).eq('draw_round_id', roundId).eq('participant_id', pendingWinner.id).eq('queue_status', 'available')
      if (queueUpdate.error) { setError(queueUpdate.error.message); return }
      setExcludedIds((current) => new Set([...current, pendingWinner.id]))
      setPendingQueueEntryId(null)
      setPendingWinner(null)
      setPendingWinnerRowId(null)
      setBoxPhase('loaded')
      setBoxLoadingComplete(true)
      leverActionLockRef.current = false
      spinLockRef.current = false
      void publishBoxState({ box_phase: 'loaded' })
      setMessage(`${winnerName} confirmed and removed from the draw pool. Ready for the next pull.`)
      if (!remaining.length) {
        const { error: roundError } = await supabase.from('draw_rounds').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', roundId)
        if (roundError) setError(`Winner confirmed, but the draw round could not be closed: ${roundError.message}`)
      }
      await refreshWinnerHistory()
      if (roundId) await replenishWinnerQueue(roundId)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to confirm this winner.')
    } finally {
      winnerActionLockRef.current = false
      setSavingWinner(false)
    }
  }

  async function skipWinner() {
    if (!pendingWinner || !pendingWinnerRowId || winnerActionLockRef.current) return
    winnerActionLockRef.current = true
    setSavingWinner(true)
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData.user) {
        setError(authError?.message ?? 'Sign in again before skipping this winner.')
        return
      }
      const { error: updateError } = await supabase.from('draw_winners').update({ status: 'skipped', skipped_at: new Date().toISOString(), skipped_by: authData.user.id, notes: 'Skipped by operator' }).eq('id', pendingWinnerRowId)
      if (updateError) {
        setError(updateError.message)
        return
      }
      const skippedId = pendingWinner.id
      const remaining = eligiblePool.filter((participant) => participant.id !== skippedId)
      const queueUpdate = pendingQueueEntryId
        ? await supabase.from('draw_entries').update({ queue_status: 'skipped' }).eq('id', pendingQueueEntryId)
        : await supabase.from('draw_entries').update({ queue_status: 'skipped' }).eq('draw_round_id', roundId).eq('participant_id', pendingWinner.id).eq('queue_status', 'available')
      if (queueUpdate.error) { setError(queueUpdate.error.message); return }
      setExcludedIds((current) => new Set([...current, skippedId]))
      setPendingQueueEntryId(null)
      setPendingWinner(null)
      setPendingWinnerRowId(null)
      setBoxPhase('loaded')
      setBoxLoadingComplete(true)
      leverActionLockRef.current = false
      spinLockRef.current = false
      void publishBoxState({ box_phase: 'loaded' })
      await refreshWinnerHistory()
      if (!remaining.length) {
        if (roundId) await refreshWinnerQueue(roundId)
        setMessage('That guest was skipped. There are no more guests in this pool.')
        const { error: roundError } = await supabase.from('draw_rounds').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', roundId as string)
        if (roundError) setError(`Guest skipped, but the draw round could not be closed: ${roundError.message}`)
        return
      }
      if (roundId) await replenishWinnerQueue(roundId)
      setMessage('Guest skipped and removed from this pool. The next queued name is ready; the pending list has been replenished where possible.')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to skip this winner.')
    } finally {
      winnerActionLockRef.current = false
      setSavingWinner(false)
    }
  }

  async function reloadHistory() {
    setLoading(true)
    await refreshWinnerHistory()
    setLoading(false)
  }

  async function startNewSession() {
    if (!roundId) return
    setLoading(true)
    const { data: closedRound, error: closeError } = await supabase.from('draw_rounds')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', roundId)
      .eq('status', 'drawing')
      .select('id')
      .maybeSingle()
    if (closeError || !closedRound) {
      setError(closeError?.message ?? 'This draw session is no longer active. Refresh the page to load the current session safely.')
      setLoading(false)
      return
    }
    setRoundId(null)
    setPrizeCategoryId(null)
    setPool([])
    setExcludedIds(new Set())
    setPendingWinner(null)
    setPendingWinnerRowId(null)
    setPendingQueueEntryId(null)
    setWinnerQueue([])
    setMessage('Previous draw session closed. Choose a name and category for the next session.')
    setLoading(false)
  }

  async function publishWheelUpdate() {
    if (updatingOutput || pendingWinner || spinning) return
    setUpdatingOutput(true)
    setError('')
    setMessage('')
    const [attendanceResult, authResult] = await Promise.all([
      fetchAllPages<{ participant_id: string; participants: { id: string; full_name: string; participant_code: string; category: string; ic_number: string | null; is_active: boolean } | { id: string; full_name: string; participant_code: string; category: string; ic_number: string | null; is_active: boolean }[] | null }>((from, to) => supabase.from('attendance')
        .select('participant_id, participants!inner(id, full_name, participant_code, category, ic_number, is_active)')
        .eq('participants.is_active', true).order('participant_id').range(from, to)),
      supabase.auth.getUser(),
    ])
    const { data: authData, error: authError } = authResult
    if (attendanceResult.error || authError || !authData.user) {
      setError(attendanceResult.error?.message ?? authError?.message ?? 'Sign in again to update the draw pool.')
      setUpdatingOutput(false)
      return
    }
    const checkedIn = attendanceResult.data.map((row) => {
      const participant = getRelated(row.participants)
      return participant ? { id: row.participant_id, full_name: participant.full_name, participant_code: participant.participant_code, category: participant.category, ic_number: participant.ic_number } : null
    }).filter((participant): participant is Participant => Boolean(participant))
    const refreshedPool = checkedIn
      .filter((participant) => (!icRegionRule.enabled || isIcRegionEligible(participant.ic_number, icRegionRule.allowed_codes)) && (poolType === 'everyone' || participant.category === poolType))
      .sort((a, b) => a.id.localeCompare(b.id))
    if (!refreshedPool.length) {
      setError(`No eligible checked-in ${poolType === 'everyone' ? 'guests' : categoryName(categories, poolType)} are available for this draw. Allowed IC region codes: ${icRegionRule.allowed_codes.join(', ')}.`)
      setUpdatingOutput(false)
      return
    }

    let activeCategoryId = prizeCategoryId
    if (!activeCategoryId) {
      const { data: existingCategory, error: categoryLookupError } = await supabase.from('prize_categories')
        .select('id')
        .eq('name', 'Lucky Draw')
        .maybeSingle()
      if (categoryLookupError) {
        setError(categoryLookupError.message)
        setUpdatingOutput(false)
        return
      }
      if (existingCategory) {
        activeCategoryId = existingCategory.id
      } else {
        const { data: createdCategory, error: categoryCreateError } = await supabase.from('prize_categories')
          .insert({ name: 'Lucky Draw', display_order: 0, is_active: true, created_by: authData.user.id })
          .select('id')
          .single()
        if (categoryCreateError || !createdCategory) {
          setError(categoryCreateError?.message ?? 'Could not prepare the draw pool.')
          setUpdatingOutput(false)
          return
        }
        activeCategoryId = createdCategory.id
      }
    }
    const { data: nextRound, error: roundError } = await supabase.from('draw_rounds').insert({
      prize_category_id: activeCategoryId,
      name: roundName.trim() || 'Lucky Draw Session',
      pool_type: poolType,
      status: 'ready',
      created_by: authData.user.id,
    }).select('id').single()
    if (roundError || !nextRound) {
      setError(roundError?.message ?? 'Could not create the refreshed draw session.')
      setUpdatingOutput(false)
      return
    }
    for (let offset = 0; offset < refreshedPool.length; offset += 400) {
      const batch = refreshedPool.slice(offset, offset + 400).map((participant) => ({ draw_round_id: nextRound.id, participant_id: participant.id }))
      const { error: entriesError } = await supabase.from('draw_entries').insert(batch)
      if (entriesError) {
        await supabase.from('draw_rounds').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', nextRound.id)
        setError(`Could not load the complete draw pool. The new round was closed safely: ${entriesError.message}`)
        setUpdatingOutput(false)
        return
      }
    }
    // Close the previous active round before activating its replacement.
    // If either transition fails, attempt a compensating rollback so we do not
    // leave two rounds marked as drawing.
    if (roundId) {
      const { data: closedPrevious, error: closeError } = await supabase.from('draw_rounds')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', roundId)
        .eq('status', 'drawing')
        .select('id')
        .maybeSingle()
      if (closeError || !closedPrevious) {
        await supabase.from('draw_rounds')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', nextRound.id)
        setError(closeError?.message ?? 'The previous session was no longer active. The replacement pool was closed without switching sessions.')
        setUpdatingOutput(false)
        return
      }
    }

    const { data: activatedRound, error: activateError } = await supabase.from('draw_rounds')
      .update({ status: 'drawing', updated_at: new Date().toISOString() })
      .eq('id', nextRound.id)
      .eq('status', 'ready')
      .select('id')
      .maybeSingle()
    if (activateError || !activatedRound) {
      const { error: cleanupError } = await supabase.from('draw_rounds')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', nextRound.id)
      let rollbackMessage = ''
      if (roundId) {
        const { error: rollbackError } = await supabase.from('draw_rounds')
          .update({ status: 'drawing', updated_at: new Date().toISOString() })
          .eq('id', roundId)
          .eq('status', 'completed')
        if (rollbackError) rollbackMessage = ` Previous session recovery also failed: ${rollbackError.message}`
      }
      const cleanupMessage = cleanupError ? ` New round cleanup failed: ${cleanupError.message}` : ''
      setError(`Could not activate the refreshed pool. ${activateError?.message ?? 'The new round was not in the expected ready state.'}${cleanupMessage}${rollbackMessage}`)
      setUpdatingOutput(false)
      return
    }
    setPrizeCategoryId(activeCategoryId)
    setRoundId(nextRound.id)
    setPool(refreshedPool)
    setExcludedIds(new Set())
    setPendingWinner(null)
    setPendingWinnerRowId(null)
    setPendingQueueEntryId(null)
    setWinnerQueue([])
    setMessage(`Fresh pool ready with ${refreshedPool.length} checked-in ${refreshedPool.length === 1 ? 'guest' : 'guests'}. The current winners list has been reset; previous session records remain saved.`)
    await refreshWinnerHistory(nextRound.id)
    setUpdatingOutput(false)
  }

  const selectedCategoryCheckIns = checkedInCounts
    ? poolType === 'everyone' ? Object.values(checkedInCounts).reduce((sum, count) => sum + count, 0) : checkedInCounts[poolType] ?? 0
    : null
  const checkedInNotInPool = roundId && selectedCategoryCheckIns !== null
    ? Math.max(0, selectedCategoryCheckIns - pool.length)
    : 0
  const themeStyle = { '--draw-theme-3': themeColors[2], '--draw-theme-4': themeColors[3], '--draw-theme-5': themeColors[4] } as CSSProperties

  return <main className="lucky-draw-page" style={themeStyle}>
    <header className="lucky-draw-heading"><div><span className="lucky-draw-eyebrow"><Trophy size={14} /> GUEST RAFFLE</span><p>Draw only from checked-in guests with valid IC region codes 01 or 23. Invalid or missing ICs stay in Attendance Directory but are excluded from this pool.</p></div><button className="button-secondary" onClick={() => void reloadHistory()} disabled={loading}><RefreshCw size={16} /> Refresh log</button></header>
    {error && <div className="lucky-draw-message error" role="alert">{error}</div>}
    {message && <div className="lucky-draw-message success" role="status">{message}</div>}
    <LuckyDrawMachine totalNames={pool.length || selectedCategoryCheckIns || 0} categoryLabel={poolType === 'everyone' ? 'Everyone' : categoryName(categories, poolType)} phase={boxPhase} startedAt={boxStartedAt} animationId={boxAnimationId} onCameraChange={(view) => { void publishBoxState({ machine_camera: view }) }} />
    <section className="panel lucky-draw-setup">
      <label>Session name<input value={roundName} onChange={(event) => setRoundName(event.target.value)} disabled={Boolean(roundId)} /><small className="lucky-draw-field-hint">Shown as the heading on the live LED screen. Set it before loading the guest pool.</small></label>
      <label>Guest category<select value={poolType} onChange={(event) => setPoolType(event.target.value as PoolType)} disabled={Boolean(roundId)}><option value="everyone">Everyone checked in</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name} checked in</option>)}</select><small className="lucky-draw-category-preview">{selectedCategoryCheckIns !== null ? <><strong>{selectedCategoryCheckIns}</strong> currently checked in for this category</> : 'Loading checked-in count…'}</small></label>
      <button className="button-primary" onClick={() => void loadPool()} disabled={loading || Boolean(roundId)}><Users size={16} /> {loading ? 'Setting category…' : roundId ? 'Category set' : 'Set category'}</button>
      {roundId && <button className="button-secondary" onClick={() => void startNewSession()} disabled={loading || spinning || savingWinner || Boolean(pendingWinner)}><RotateCw size={16} /> New draw session</button>}
      <div className="lucky-draw-pool-count"><span>Available in current wheel</span><strong>{roundId ? eligiblePool.length : '—'}</strong>{checkedInNotInPool > 0 && <small>{checkedInNotInPool} checked-in {poolType === 'everyone' ? 'guests' : categoryName(categories, poolType)} are not in this saved pool. Reset the pool to include them.</small>}</div>
    </section>

    <section className="panel lucky-draw-box-controls">
      <div className="lucky-draw-box-heading">
        <div>
          <strong>Lucky Draw Box</strong>
          <span>{boxPhase === 'loading' ? 'Paper slips are entering the box…' : boxPhase === 'loaded' ? 'All name slips are inside. Ready to pull.' : boxPhase === 'cranking' ? 'Lever is cranking…' : boxPhase === 'shaking' ? 'Mixing the name slips…' : boxPhase === 'reveal' ? 'Winner revealed.' : 'Reset the box, set a category, then start the paper feed.'}</span>
        </div>
        <div className="lucky-draw-box-status"><span className={`is-${boxPhase}`}>{boxPhase === 'idle' ? 'Not loaded' : boxPhase === 'loading' ? 'Loading' : boxPhase === 'loaded' ? 'Ready' : boxPhase === 'reveal' ? 'Winner revealed' : 'In progress'}</span></div>
      </div>

      <div className="lucky-draw-box-actions">
        <button className="button-secondary" onClick={() => void resetBox()} disabled={spinning || savingWinner}><RotateCw size={16} /> Reset box</button>
        <button className="button-primary" onClick={() => void startPaperFeed()} disabled={!roundId || !pool.length || spinning || boxPhase === 'loading' || boxPhase === 'loaded' || boxPhase === 'cranking' || boxPhase === 'shaking' || boxPhase === 'reveal'}><Play size={16} /> {boxPhase === 'loading' ? 'Filling box…' : 'Start'}</button>
        <button className="lucky-draw-spin-button" onClick={() => void pullBoxLever()} disabled={!roundId || !boxLoadingComplete || spinning || savingWinner || Boolean(pendingWinner) || !winnerQueue.some((entry) => entry.queue_status === 'pending') || boxPhase === 'cranking' || boxPhase === 'shaking'}>Pull lever</button>
      </div>

      <div className="lucky-draw-box-footer">
        {pendingWinner ? <div className="lucky-draw-controls lucky-draw-winner-review">
          <div className="lucky-draw-selected"><small>OUR LUCKY WINNER!!</small><strong>{pendingWinner.full_name}</strong><span>{categoryName(categories, pendingWinner.category)} · {pendingWinner.participant_code}</span></div>
          <div className="lucky-draw-winner-actions">
            <button className="button-primary" onClick={() => void acceptWinner()} disabled={savingWinner}><Check size={16} /> Confirm winner &amp; remove from pool</button>
            <button className="button-secondary" onClick={() => void skipWinner()} disabled={savingWinner}><X size={16} /> Skip winner</button>
          </div>
        </div> : <div className="lucky-draw-prompt"><strong>{eligiblePool.length} eligible</strong><span>{boxLoadingComplete ? 'Pull the lever when ready.' : 'Load the papers before pulling the lever.'}</span></div>}
        {roundId && <button className="button-secondary lucky-draw-output-update" onClick={() => void publishWheelUpdate()} disabled={loading || spinning || updatingOutput || Boolean(pendingWinner)} title="Start a fresh session using everyone currently checked in. Previous session results remain saved."><RefreshCw size={16} className={updatingOutput ? 'is-spinning' : ''} /> {updatingOutput ? 'Refreshing pool…' : 'Refresh checked-in pool'}</button>}
      </div>
    </section>

    <section className="panel lucky-draw-winner-list-panel">
      <div className="lucky-draw-queue-heading">
        <div><strong>Winner List</strong><span>{winnerQueue.filter((entry) => entry.queue_status === 'pending').length} pending · {winnerQueue.length} names in the current list</span></div>
        <button className="button-primary" onClick={() => void generateWinnerList()} disabled={!roundId || generatingQueue || Boolean(pendingWinner) || winnerQueue.some((entry) => entry.queue_status === 'pending')}>
          <Users size={16} /> {generatingQueue ? 'Generating…' : winnerQueue.length ? 'Generate next list' : 'Generate Winner List'}
        </button>
      </div>
      {winnerQueue.length ? <ol className="lucky-draw-queue-list">{winnerQueue.map((entry) => <li key={entry.id} className={`is-${entry.queue_status}`}>
        <span className="lucky-draw-queue-number">{entry.queue_position}</span>
        <strong>{entry.participant.full_name}</strong>
        <label className="lucky-draw-queue-status">
          <input type="checkbox" checked={entry.queue_status === 'collected'} disabled />
          <span>{entry.queue_status === 'collected' ? 'Prize collected' : entry.queue_status === 'skipped' ? 'Skipped' : 'Pending'}</span>
        </label>
      </li>)}</ol> : <p className="lucky-draw-log-empty">{roundId ? 'Generate a list of 10 names here. The Lucky Draw Box above is controlled separately.' : 'No active winner queue. The latest saved winner results remain available below.'}</p>}
    </section>

    <section className="panel lucky-draw-log-panel">
      <div className="lucky-draw-log-heading"><div><h3>{roundId ? 'Current session winners' : 'Latest saved session winners'}</h3><p>{roundId ? 'Results are saved to this draw session.' : 'No active draw session. Showing the latest saved results in read-only mode.'}</p></div><div className="lucky-draw-log-actions"><strong className="lucky-draw-session-count confirmed">Confirmed winners: {confirmedWinnerCount}</strong><strong className="lucky-draw-session-count skipped">Skipped winners: {skippedWinnerCount}</strong></div></div>
      {history.length ? <div className="lucky-draw-log-list">{history.map((winner, index) => <article className={`lucky-draw-log-row ${winner.status === 'skipped' ? 'is-skipped' : ''} ${index > 0 && history[index - 1].round.pool_type !== winner.round.pool_type ? 'is-category-break' : ''}`} key={winner.id}>
        <div className="lucky-draw-log-number"><Trophy size={17} /></div>
        <div className="lucky-draw-log-person"><strong>{winner.participant.full_name}</strong><span>{winner.round.pool_type === 'everyone' ? 'Everyone' : categoryName(categories, winner.round.pool_type)} draw · {winner.round.name}</span></div>
        <div className="lucky-draw-log-meta"><span className={`lucky-draw-status ${winner.status === 'skipped' ? 'skipped' : winner.notes === 'Confirmed by operator' ? 'confirmed' : 'pending'}`}>{winner.status === 'skipped' ? 'Skipped' : winner.notes === 'Confirmed by operator' ? 'Confirmed winner' : 'Pending confirmation'}</span><time>{formatDrawnAt(winner.drawn_at)}</time></div>
      </article>)}</div> : <p className="lucky-draw-log-empty">No winners have been drawn yet.</p>}
    </section>
  </main>
}
