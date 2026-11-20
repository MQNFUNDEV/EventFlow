import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Check, RefreshCw, RotateCw, Trophy, Users, X } from 'lucide-react'
import { Wheel, type WheelItem, type WheelRestEvent } from 'spin-wheel'
import { supabase } from '../lib/supabase'
import './LuckyDrawManagement.css'

type PoolType = 'everyone' | 'student' | 'staff'
type Participant = { id: string; full_name: string; participant_code: string; category: 'student' | 'staff' }
type Winner = { id: string; participant_id: string; status: 'pending' | 'collected' | 'skipped'; drawn_at: string; notes: string | null; participant: { full_name: string; category: string }; round: { name: string; pool_type: PoolType } }
type ThemePayload = { theme_colors?: unknown }

const DEFAULT_COLORS = ['#06152d', '#e31b45', '#1177ff', '#19d4ff', '#ff3e9d']
const spinLength = 10000

function pickIndex(length: number) {
  const limit = 0x100000000 - (0x100000000 % length)
  const sample = new Uint32Array(1)
  do { crypto.getRandomValues(sample) } while (sample[0] >= limit)
  return sample[0] % length
}

function participantWheelItem(participant: Participant): WheelItem {
  return { label: participant.full_name, value: participant.id }
}

function formatDrawnAt(value: string) {
  return new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function getRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default function LuckyDrawManagement() {
  const [poolType, setPoolType] = useState<PoolType>('everyone')
  const [checkedInCounts, setCheckedInCounts] = useState<{ student: number; staff: number } | null>(null)
  const [roundName, setRoundName] = useState('Lucky Draw Session')
  const [roundId, setRoundId] = useState<string | null>(null)
  const [prizeCategoryId, setPrizeCategoryId] = useState<string | null>(null)
  const [pool, setPool] = useState<Participant[]>([])
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<Winner[]>([])
  const [pendingWinner, setPendingWinner] = useState<Participant | null>(null)
  const [pendingWinnerRowId, setPendingWinnerRowId] = useState<string | null>(null)
  const [themeColors, setThemeColors] = useState(DEFAULT_COLORS)
  const [loading, setLoading] = useState(true)
  const [savingWinner, setSavingWinner] = useState(false)
  const [updatingOutput, setUpdatingOutput] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [wheelReady, setWheelReady] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const wheelContainer = useRef<HTMLDivElement>(null)
  const wheelInstance = useRef<Wheel | null>(null)
  const eligibleRef = useRef<Participant[]>([])
  const restHandlerRef = useRef<(event: WheelRestEvent) => void>(() => undefined)
  const roundRef = useRef<string | null>(null)
  const categoryRef = useRef<string | null>(null)

  const eligiblePool = useMemo(() => pool.filter((participant) => !excludedIds.has(participant.id)), [pool, excludedIds])

  const restoreActiveRound = useCallback(async () => {
    setLoading(true)
    const { data: activeRounds, error: roundError } = await supabase
      .from('draw_rounds')
      .select('id, name, pool_type, prize_category_id')
      .eq('status', 'drawing')
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

    const [entriesResult, winnersResult] = await Promise.all([
      supabase.from('draw_entries')
        .select('participant_id, participants!inner(id, full_name, participant_code, category, is_active)')
        .eq('draw_round_id', activeRound.id)
        .order('participant_id', { ascending: true }),
      supabase.from('draw_winners')
        .select('id, participant_id, status, notes')
        .eq('draw_round_id', activeRound.id)
        .order('drawn_at', { ascending: false }),
    ])
    const restoreError = entriesResult.error ?? winnersResult.error
    if (restoreError) {
      setError(restoreError.message)
      setLoading(false)
      return
    }

    const participants = (entriesResult.data ?? []).map((row) => {
      const participant = getRelated(row.participants)
      return participant ? {
        id: row.participant_id,
        full_name: participant.full_name,
        participant_code: participant.participant_code,
        category: participant.category as 'student' | 'staff',
      } : null
    }).filter((participant): participant is Participant => Boolean(participant))
    const previousDraws = winnersResult.data ?? []
    const removedParticipants = new Set(previousDraws
      .filter((winner) => winner.status === 'skipped' || winner.notes === 'Confirmed by operator')
      .map((winner) => winner.participant_id))
    const pendingRow = previousDraws.find((winner) => winner.status === 'pending' && winner.notes !== 'Confirmed by operator')
    const pendingParticipant = pendingRow ? participants.find((participant) => participant.id === pendingRow.participant_id) ?? null : null

    setRoundName(activeRound.name)
    setPoolType(activeRound.pool_type as PoolType)
    setRoundId(activeRound.id)
    setPrizeCategoryId(activeRound.prize_category_id)
    setPool(participants)
    setExcludedIds(removedParticipants)
    setPendingWinner(pendingParticipant)
    setPendingWinnerRowId(pendingParticipant ? pendingRow?.id ?? null : null)
    setMessage(pendingParticipant
      ? 'Active draw restored. The last name is ready to confirm or skip.'
      : `Active draw restored with ${participants.length - removedParticipants.size} eligible guests.`)
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void restoreActiveRound() }, 0)
    return () => window.clearTimeout(timer)
  }, [restoreActiveRound])

  useEffect(() => {
    let cancelled = false
    async function loadCategoryPreview() {
      const { data, error: attendanceError } = await supabase.from('attendance')
        .select('participant_id, participants!inner(category, is_active)')
        .eq('participants.is_active', true)
      if (cancelled || attendanceError) return
      const counts = (data ?? []).reduce((total, row) => {
        const participant = getRelated(row.participants)
        if (participant?.category === 'student') total.student += 1
        if (participant?.category === 'staff') total.staff += 1
        return total
      }, { student: 0, staff: 0 })
      setCheckedInCounts(counts)
    }
    void loadCategoryPreview()
    return () => { cancelled = true }
  }, [poolType])

  useEffect(() => {
    eligibleRef.current = eligiblePool
    roundRef.current = roundId
    categoryRef.current = prizeCategoryId
    if (wheelInstance.current && !spinning) wheelInstance.current.items = eligiblePool.map(participantWheelItem)
  }, [eligiblePool, roundId, prizeCategoryId, spinning])

  const refreshWinnerHistory = useCallback(async (targetRoundId: string | null = roundId) => {
    if (!targetRoundId) {
      setHistory([])
      return
    }
    const { data, error: historyError } = await supabase
      .from('draw_winners')
      .select('id, participant_id, status, drawn_at, notes, participants!inner(full_name, category), draw_rounds!inner(name, pool_type)')
      .eq('draw_round_id', targetRoundId)
      .order('drawn_at', { ascending: false })
      .limit(30)
    if (historyError) {
      setError(historyError.message)
      return
    }
    setHistory((data ?? []).map((row) => ({
      id: row.id,
      participant_id: row.participant_id,
      status: row.status,
      drawn_at: row.drawn_at,
      notes: row.notes,
      participant: getRelated(row.participants) ?? { full_name: 'Guest', category: '' },
      round: getRelated(row.draw_rounds) ?? { name: 'Lucky Draw', pool_type: 'everyone' },
    })) as Winner[])
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
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!wheelContainer.current) return
    const wheel = new Wheel(wheelContainer.current, {
      items: eligibleRef.current.map(participantWheelItem),
      isInteractive: false,
      pointerAngle: 0,
      radius: 0.98,
      itemLabelAlign: 'right',
      itemLabelRadius: 0.95,
      itemLabelRadiusMax: 0.08,
      itemLabelFont: 'Manrope, sans-serif',
      itemLabelFontSizeMax: 64,
      itemLabelColors: ['#ffffff'],
      itemLabelStrokeColor: '#07111f',
      itemLabelStrokeWidth: 2,
      itemBackgroundColors: themeColors,
      lineColor: '#ffffff',
      lineWidth: 2,
      borderColor: themeColors[3],
      borderWidth: 4,
      onRest: (event: WheelRestEvent) => restHandlerRef.current(event),
    })
    wheelInstance.current = wheel
    setWheelReady(true)
    return () => {
      wheel.remove()
      wheelInstance.current = null
      setWheelReady(false)
    }
  }, [roundId, themeColors])

  function updateWheelItems(participants: Participant[]) {
    eligibleRef.current = participants
    if (wheelInstance.current) wheelInstance.current.items = participants.map(participantWheelItem)
  }

  const loadPool = useCallback(async () => {
    setLoading(true)
    setError('')
    setMessage('')
    const { data: existingRound, error: existingRoundError } = await supabase.from('draw_rounds')
      .select('id')
      .eq('status', 'drawing')
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

    const { data: attendance, error: attendanceError } = await supabase
      .from('attendance')
      .select('participant_id, participants!inner(id, full_name, participant_code, category, is_active)')
      .eq('participants.is_active', true)
    if (attendanceError) {
      setError(attendanceError.message)
      setLoading(false)
      return
    }
    const checkedInParticipants = (attendance ?? []).map((row) => {
      const participant = getRelated(row.participants)
      return participant ? { id: row.participant_id, full_name: participant.full_name, participant_code: participant.participant_code, category: participant.category as 'student' | 'staff' } : null
    }).filter((participant): participant is Participant => Boolean(participant))
    const categoryPool = checkedInParticipants.filter((participant) => poolType === 'everyone' || participant.category === poolType).sort((a, b) => a.id.localeCompare(b.id))
    if (!categoryPool.length) {
      setPool([])
      setExcludedIds(new Set())
      setError(`No checked-in ${poolType === 'everyone' ? 'guests' : `${poolType}s`} are available for this draw.`)
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
    await refreshWinnerHistory()
    setLoading(false)
  }, [poolType, roundName, refreshWinnerHistory, restoreActiveRound])

  const spinCandidates = useCallback(async (candidates: Participant[]) => {
    const activeRoundId = roundRef.current
    const activeCategoryId = categoryRef.current
    if (!activeRoundId || !activeCategoryId || !wheelInstance.current || spinning || candidates.length === 0) return
    const index = pickIndex(candidates.length)
    const chosen = candidates[index]
    const { data, error: insertError } = await supabase.from('draw_winners').insert({
      draw_round_id: activeRoundId,
      prize_category_id: activeCategoryId,
      participant_id: chosen.id,
      status: 'pending',
      notes: 'Awaiting operator confirmation',
    }).select('id').single()
    if (insertError || !data) {
      setError(insertError?.message ?? 'This guest could not be selected. Refresh the draw pool and try again.')
      return
    }
    setError('')
    setMessage('The wheel is spinning…')
    setPendingWinner(null)
    setPendingWinnerRowId(data.id)
    setSpinning(true)
    updateWheelItems(candidates)
    restHandlerRef.current = (event) => {
      setSpinning(false)
      const winner = eligibleRef.current[event.currentIndex]
      if (!winner) return
      setPendingWinner(winner)
      setMessage('Winner selected. Confirm them or skip and spin again.')
      void refreshWinnerHistory()
    }
    wheelInstance.current.spinToItem(index, spinLength, true, 6, 1)
    void refreshWinnerHistory()
  }, [refreshWinnerHistory, spinning])

  async function startSpin() {
    if (!wheelReady || spinning || !eligiblePool.length) return
    await spinCandidates(eligiblePool)
  }

  async function acceptWinner() {
    if (!pendingWinner || !pendingWinnerRowId) return
    setSavingWinner(true)
    const winnerName = pendingWinner.full_name
    const remaining = eligiblePool.filter((participant) => participant.id !== pendingWinner.id)
    const { error: updateError } = await supabase.from('draw_winners').update({ notes: 'Confirmed by operator' }).eq('id', pendingWinnerRowId)
    if (updateError) setError(updateError.message)
    else {
      setExcludedIds((current) => new Set([...current, pendingWinner.id]))
      setPendingWinner(null)
      setPendingWinnerRowId(null)
      setMessage(`${winnerName} confirmed and removed from the draw pool.`)
      if (!remaining.length) await supabase.from('draw_rounds').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', roundId)
      await refreshWinnerHistory()
    }
    setSavingWinner(false)
  }

  async function skipWinner() {
    if (!pendingWinner || !pendingWinnerRowId) return
    setSavingWinner(true)
    const { data: authData } = await supabase.auth.getUser()
    const { error: updateError } = await supabase.from('draw_winners').update({ status: 'skipped', skipped_at: new Date().toISOString(), skipped_by: authData.user?.id ?? null, notes: 'Skipped by operator' }).eq('id', pendingWinnerRowId)
    if (updateError) {
      setError(updateError.message)
      setSavingWinner(false)
      return
    }
    const skippedId = pendingWinner.id
    const remaining = eligiblePool.filter((participant) => participant.id !== skippedId)
    setExcludedIds((current) => new Set([...current, skippedId]))
    setPendingWinner(null)
    setPendingWinnerRowId(null)
    setSavingWinner(false)
    await refreshWinnerHistory()
    if (!remaining.length) {
      setMessage('That guest was skipped. There are no more guests in this pool.')
      await supabase.from('draw_rounds').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', roundId)
      return
    }
    setMessage('Guest skipped and removed from this pool. Spin again when ready.')
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
    setMessage('Previous draw session closed. Choose a name and category for the next session.')
    setLoading(false)
  }

  async function publishWheelUpdate() {
    if (updatingOutput || pendingWinner || spinning) return
    setUpdatingOutput(true)
    setError('')
    setMessage('')
    const [{ data: attendance, error: attendanceError }, { data: authData, error: authError }] = await Promise.all([
      supabase.from('attendance')
        .select('participant_id, participants!inner(id, full_name, participant_code, category, is_active)')
        .eq('participants.is_active', true),
      supabase.auth.getUser(),
    ])
    if (attendanceError || authError || !authData.user) {
      setError(attendanceError?.message ?? authError?.message ?? 'Sign in again to update the draw pool.')
      setUpdatingOutput(false)
      return
    }
    const checkedIn = (attendance ?? []).map((row) => {
      const participant = getRelated(row.participants)
      return participant ? { id: row.participant_id, full_name: participant.full_name, participant_code: participant.participant_code, category: participant.category as 'student' | 'staff' } : null
    }).filter((participant): participant is Participant => Boolean(participant))
    const refreshedPool = checkedIn
      .filter((participant) => poolType === 'everyone' || participant.category === poolType)
      .sort((a, b) => a.id.localeCompare(b.id))
    if (!refreshedPool.length) {
      setError(`No checked-in ${poolType === 'everyone' ? 'guests' : `${poolType}s`} are available for this draw.`)
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
    setMessage(`Fresh pool ready with ${refreshedPool.length} checked-in ${refreshedPool.length === 1 ? 'guest' : 'guests'}. The current winners list has been reset; previous session records remain saved.`)
    await refreshWinnerHistory(nextRound.id)
    setUpdatingOutput(false)
  }

  const selectedCategoryCheckIns = checkedInCounts
    ? poolType === 'everyone' ? checkedInCounts.student + checkedInCounts.staff : checkedInCounts[poolType]
    : null
  const checkedInNotInPool = roundId && selectedCategoryCheckIns !== null
    ? Math.max(0, selectedCategoryCheckIns - pool.length)
    : 0
  const themeStyle = { '--draw-theme-3': themeColors[2], '--draw-theme-4': themeColors[3], '--draw-theme-5': themeColors[4] } as CSSProperties

  return <main className="lucky-draw-page" style={themeStyle}>
    <header className="lucky-draw-heading"><div><span className="lucky-draw-eyebrow"><Trophy size={14} /> GUEST RAFFLE</span><p>Draw only from guests who have checked in. Every selected guest is removed from future spins.</p></div><button className="button-secondary" onClick={() => void reloadHistory()} disabled={loading}><RefreshCw size={16} /> Refresh log</button></header>
    {error && <div className="lucky-draw-message error" role="alert">{error}</div>}
    {message && <div className="lucky-draw-message success" role="status">{message}</div>}
    <section className="panel lucky-draw-setup">
      <label>Session name<input value={roundName} onChange={(event) => setRoundName(event.target.value)} disabled={Boolean(roundId)} /><small className="lucky-draw-field-hint">Shown as the heading on the live LED screen. Set it before loading the guest pool.</small></label>
      <label>Guest category<select value={poolType} onChange={(event) => setPoolType(event.target.value as PoolType)} disabled={Boolean(roundId)}><option value="everyone">Everyone checked in</option><option value="student">Students checked in</option><option value="staff">Staff checked in</option></select><small className="lucky-draw-category-preview">{selectedCategoryCheckIns !== null ? <><strong>{selectedCategoryCheckIns}</strong> currently checked in for this category</> : 'Loading checked-in count…'}</small></label>
      <button className="button-primary" onClick={() => void loadPool()} disabled={loading || Boolean(roundId)}><Users size={16} /> {loading ? 'Loading pool…' : roundId ? 'Session ready' : 'Load checked-in pool'}</button>
      {roundId && <button className="button-secondary" onClick={() => void startNewSession()} disabled={loading || spinning || savingWinner || Boolean(pendingWinner)}><RotateCw size={16} /> New draw session</button>}
      <div className="lucky-draw-pool-count"><span>Available in current wheel</span><strong>{roundId ? eligiblePool.length : '—'}</strong>{checkedInNotInPool > 0 && <small>{checkedInNotInPool} checked-in {poolType === 'everyone' ? 'guests' : `${poolType}s`} are not in this saved pool. Reset the pool to include them.</small>}</div>
    </section>

    {roundId && <section className="panel lucky-draw-wheel-panel">
      <div className="lucky-draw-round-title"><span>{roundName}</span><small>{pool.length} checked-in guests loaded</small></div>
      <div className="lucky-draw-wheel-layout">
        <div className={`lucky-draw-wheel-wrap ${spinning ? 'is-spinning' : ''}`}><span className="lucky-draw-pointer" aria-hidden="true" /><div className="lucky-draw-wheel" ref={wheelContainer} aria-label="Lucky draw participant wheel" />{!eligiblePool.length && <div className="lucky-draw-wheel-empty">No guests left in this pool</div>}</div>
        <div className="lucky-draw-controls">
          {pendingWinner ? <div className="lucky-draw-selected"><small>SELECTED GUEST</small><strong>{pendingWinner.full_name}</strong><span>{pendingWinner.category} · {pendingWinner.participant_code}</span></div> : <div className="lucky-draw-prompt"><strong>{eligiblePool.length} eligible</strong><span>Press spin to pick a checked-in guest.</span></div>}
          <button className="lucky-draw-spin-button" onClick={() => void startSpin()} disabled={!wheelReady || spinning || savingWinner || Boolean(pendingWinner) || !eligiblePool.length}>{spinning ? 'Spinning…' : wheelReady ? 'Spin the wheel' : 'Preparing wheel…'}</button>
          {roundId && <button className="button-secondary lucky-draw-output-update" onClick={() => void publishWheelUpdate()} disabled={loading || spinning || updatingOutput || Boolean(pendingWinner)} title="Start a fresh session using everyone currently checked in. Previous session results remain saved."><RefreshCw size={16} className={updatingOutput ? 'is-spinning' : ''} /> {updatingOutput ? 'Refreshing pool…' : 'Refresh checked-in pool'}</button>}
          {pendingWinner && <div className="lucky-draw-winner-actions"><button className="button-primary" onClick={() => void acceptWinner()} disabled={savingWinner}><Check size={16} /> Confirm winner &amp; remove from pool</button><button className="button-secondary" onClick={() => void skipWinner()} disabled={savingWinner}><X size={16} /> Skip winner</button></div>}
        </div>
      </div>
    </section>}

    <section className="panel lucky-draw-log-panel">
      <div className="lucky-draw-log-heading"><div><h3>Current session winners</h3><p>This list resets with the draw pool. Results from previous sessions remain saved.</p></div><div className="lucky-draw-log-actions"><strong>{history.filter((winner) => winner.status !== 'skipped').length} selected</strong></div></div>
      {history.length ? <div className="lucky-draw-log-list">{history.map((winner, index) => <article className={`lucky-draw-log-row ${winner.status === 'skipped' ? 'is-skipped' : ''} ${index > 0 && history[index - 1].round.pool_type !== winner.round.pool_type ? 'is-category-break' : ''}`} key={winner.id}>
        <div className="lucky-draw-log-number"><Trophy size={17} /></div>
        <div className="lucky-draw-log-person"><strong>{winner.participant.full_name}</strong><span>{winner.round.pool_type === 'everyone' ? 'Everyone' : `${winner.round.pool_type[0].toUpperCase()}${winner.round.pool_type.slice(1)}s`} draw · {winner.round.name}</span></div>
        <div className="lucky-draw-log-meta"><span className={`lucky-draw-status ${winner.status === 'skipped' ? 'skipped' : winner.notes === 'Confirmed by operator' ? 'confirmed' : 'pending'}`}>{winner.status === 'skipped' ? 'Skipped' : winner.notes === 'Confirmed by operator' ? 'Confirmed winner' : 'Pending confirmation'}</span><time>{formatDrawnAt(winner.drawn_at)}</time></div>
      </article>)}</div> : <p className="lucky-draw-log-empty">No winners have been drawn yet.</p>}
    </section>
  </main>
}
