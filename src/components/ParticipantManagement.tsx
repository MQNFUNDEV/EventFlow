import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Plus, Search, RefreshCw, Pencil, Upload, Users, X, Trash2, History,
} from 'lucide-react'
import Papa from 'papaparse'
import { supabase } from '../lib/supabase'
import { DEFAULT_PARTICIPANT_CATEGORIES, readParticipantCategories, categoryName, type ParticipantCategory } from '../lib/participantCategories'
import './ParticipantManagement.css'

type Role = 'super_admin' | 'event_admin' | 'front_desk'
type Category = string

type Participant = {
  id: string
  participant_code: string
  full_name: string
  email: string | null
  phone: string | null
  category: Category
  organisation: string | null
  form_timestamp: string | null
  ic_number: string | null
  student_id: string | null
  university_name: string | null
  gender: string | null
  race: string | null
  notes: string | null
  is_active: boolean
  needs_review: boolean
  import_issue_reasons: string[]
  created_at: string
  updated_at: string | null
  manual_revised_at: string | null
}

type ParticipantRevision = { id: number; action: string; details: Record<string, unknown>; created_at: string; actor_user_id: string | null }
type ImportSourceRow = { id: string; batch_id: string; participant_id: string | null; source_row_number: number; source_data: Record<string, string>; source_name: string | null; source_ic: string | null; issue_types: string[] }
type ImportBatch = { id: string; file_name: string; file_type: string; source_row_count: number; linked_participant_count: number; issue_row_count: number; created_at: string }

type ParticipantForm = {
  full_name: string
  ic_number: string
  email: string
  phone: string
  student_id: string
  university_name: string
  gender: string
  race: string
  category: Category
  organisation: string
  notes: string
}

type ParticipantInsert = {
  participant_code: string
  full_name: string
  email: string | null
  phone: string | null
  category: Category
  organisation: string | null
  form_timestamp: string | null
  ic_number: string | null
  student_id: string | null
  university_name: string | null
  gender: string | null
  race: string | null
  notes: string | null
  needs_review?: boolean
  import_issue_reasons?: string[]
}

const emptyForm: ParticipantForm = {
  full_name: '',
  ic_number: '',
  email: '',
  phone: '',
  student_id: '',
  university_name: '',
  gender: '',
  race: '',
  category: 'staff',
  organisation: '',
  notes: '',
}

function normaliseIc(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '')
}

function normaliseParticipantName(value: string | null | undefined) {
  return (value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

function isValidIc(value: string | null | undefined) {
  const raw = (value ?? '').trim()
  return /^\d{12}$/.test(raw) || /^\d{6}-\d{2}-\d{4}$/.test(raw)
}

function generateParticipantCode() {
  return `JMX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

async function fetchAllPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await fetchPage(offset, offset + 999)
    if (error) return { data: rows, error }
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return { data: rows, error: null }
  }
}

export default function ParticipantManagement({
  currentRole,
  eventName,
}: {
  currentRole: Role
  eventName: string
}) {
  const canManage = currentRole === 'super_admin' || currentRole === 'event_admin'
  const isSuperAdmin = currentRole === 'super_admin'
  const [allowEventAdminGuestDeletion, setAllowEventAdminGuestDeletion] = useState(false)
  const canDeleteGuest = isSuperAdmin || (currentRole === 'event_admin' && allowEventAdminGuestDeletion)
  const canImport = ['super_admin', 'event_admin', 'front_desk'].includes(currentRole)

  const [importRows, setImportRows] = useState<ImportSourceRow[]>([])
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([])
  const [deleteCategoryId, setDeleteCategoryId] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [issueFilter, setIssueFilter] = useState('all')
  const [participants, setParticipants] = useState<Participant[]>([])
  const [checkedInIds, setCheckedInIds] = useState<Set<string>>(new Set())
  const [categories, setCategories] = useState<ParticipantCategory[]>(DEFAULT_PARTICIPANT_CATEGORIES)
  const [form, setForm] = useState<ParticipantForm>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null)
  const [revisionHistory, setRevisionHistory] = useState<ParticipantRevision[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    if (currentRole !== 'event_admin') return
    let cancelled = false
    async function loadGuestDeletionPermission() {
      const { data, error } = await supabase.functions.invoke('admin-management', { body: { action: 'get-guest-deletion-permission' } })
      if (!cancelled && !error && !data?.error) setAllowEventAdminGuestDeletion(data?.allow_event_admin_guest_deletion === true)
    }
    void loadGuestDeletionPermission()
    return () => { cancelled = true }
  }, [currentRole])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadImportHistory = useCallback(async () => {
    const [rowsResult, batchesResult] = await Promise.all([
      fetchAllPages<ImportSourceRow>((from, to) => supabase.from('participant_import_rows').select('*').order('source_row_number').range(from, to)),
      fetchAllPages<ImportBatch>((from, to) => supabase.from('participant_import_batches').select('*').order('created_at', { ascending: false }).range(from, to)),
    ])
    if (rowsResult.error) setError(rowsResult.error.message)
    else setImportRows(rowsResult.data)
    if (batchesResult.error) setError(batchesResult.error.message)
    else setImportBatches(batchesResult.data)
  }, [])
  const fileInput = useRef<HTMLInputElement>(null)

  const loadParticipants = useCallback(async (): Promise<Participant[] | null> => {
    const [participantResult, attendanceResult] = await Promise.all([
      fetchAllPages<Participant>((from, to) => supabase.from('participants').select('*').order('created_at', { ascending: false }).order('id').range(from, to)),
      fetchAllPages<{ participant_id: string }>((from, to) => supabase.from('attendance').select('participant_id').range(from, to)),
    ])
    if (participantResult.error) setError(participantResult.error.message)
    else { setParticipants(participantResult.data); setError('') }
    if (attendanceResult.error) setError(attendanceResult.error.message)
    else setCheckedInIds(new Set(attendanceResult.data.map((item) => item.participant_id)))
    setLoading(false)
    return participantResult.error ? null : participantResult.data
  }, [])

  useEffect(() => {
    let cancelled = false
    async function initialLoad() {
      const { data: settings } = await supabase.from('display_state').select('payload').eq('id', 1).maybeSingle()
      if (!cancelled) setCategories(readParticipantCategories(settings?.payload))
      const [result, attendanceResult] = await Promise.all([
        fetchAllPages<Participant>((from, to) => supabase.from('participants').select('*').order('created_at', { ascending: false }).order('id').range(from, to)),
        fetchAllPages<{ participant_id: string }>((from, to) => supabase.from('attendance').select('participant_id').range(from, to)),
      ])
      if (cancelled) return
      if (result.error) setError(result.error.message)
      else setParticipants(result.data)
      if (attendanceResult.error) setError(attendanceResult.error.message)
      else setCheckedInIds(new Set(attendanceResult.data.map((item) => item.participant_id)))
      const [rowResult, batchResult] = await Promise.all([
        fetchAllPages<ImportSourceRow>((from, to) => supabase.from('participant_import_rows').select('*').order('source_row_number').range(from, to)),
        fetchAllPages<ImportBatch>((from, to) => supabase.from('participant_import_batches').select('*').order('created_at', { ascending: false }).range(from, to)),
      ])
      if (!cancelled) {
        if (rowResult.error) setError(rowResult.error.message)
        else setImportRows(rowResult.data)
        if (batchResult.error) setError(batchResult.error.message)
        else setImportBatches(batchResult.data)
      }
      setLoading(false)
    }
    void initialLoad()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('eventflow-participant-directory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => {
        void loadParticipants()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        void loadParticipants()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participant_import_batches' }, () => {
        void loadImportHistory()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participant_import_rows' }, () => {
        void loadImportHistory()
      })
      .subscribe((status) => {
        // A newly opened or reconnected Front Desk/Admin session immediately
        // reconciles its local view against the shared database.
        if (status === 'SUBSCRIBED') {
          void loadParticipants()
          void loadImportHistory()
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadParticipants, loadImportHistory])

  // Reconcile after tab switches, laptop wake, network recovery, and as a
  // fallback if a browser misses a Realtime event while it is suspended.
  useEffect(() => {
    const refreshSharedData = () => {
      if (document.visibilityState !== 'visible') return
      void loadParticipants()
      void loadImportHistory()
    }
    window.addEventListener('focus', refreshSharedData)
    document.addEventListener('visibilitychange', refreshSharedData)
    const intervalId = window.setInterval(refreshSharedData, 30000)
    return () => {
      window.removeEventListener('focus', refreshSharedData)
      document.removeEventListener('visibilitychange', refreshSharedData)
      window.clearInterval(intervalId)
    }
  }, [loadParticipants, loadImportHistory])

  async function openParticipantDetails(participant: Participant) {
    setSelectedParticipant(participant)
    setRevisionHistory([])
    setHistoryError('')
    setHistoryLoading(true)
    const { data, error: historyQueryError } = await supabase.from('audit_logs')
      .select('id, action, details, created_at, actor_user_id')
      .eq('entity_type', 'participant').eq('entity_id', participant.id)
      .order('created_at', { ascending: false }).limit(100)
    if (historyQueryError) setHistoryError(historyQueryError.message)
    else setRevisionHistory((data ?? []) as ParticipantRevision[])
    setHistoryLoading(false)
  }

  function formatRevisionValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—'
    if (Array.isArray(value)) return value.join(', ') || '—'
    if (typeof value === 'object') return JSON.stringify(value)
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    return String(value)
  }

  function formatRevisionLabel(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  }

  function openAddForm() {
    setEditingId(null)
    setForm({ ...emptyForm, category: categories[0]?.id ?? 'staff' })
    setFormOpen(true)
    setError('')
    setMessage('')
  }

  function openEditForm(participant: Participant) {
    setEditingId(participant.id)
    setForm({
      full_name: participant.full_name,
      ic_number: participant.ic_number ?? '',
      email: participant.email ?? '',
      phone: participant.phone ?? '',
      student_id: participant.student_id ?? '',
      university_name: participant.university_name ?? '',
      gender: participant.gender ?? '',
      race: participant.race ?? '',
      category: participant.import_issue_reasons?.includes('Unknown category') ? '' : participant.category,
      organisation: participant.organisation ?? '',
      notes: participant.notes ?? '',
    })
    setFormOpen(true)
    setError('')
    setMessage('')
  }

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  function findDuplicates(icNumber: string, excludeId?: string) {
    const normalIc = normaliseIc(icNumber)
    if (!normalIc) return []
    return participants.filter((participant) =>
      participant.id !== excludeId && normaliseIc(participant.ic_number) === normalIc,
    )
  }

  async function flagDuplicateRegistrations(duplicates: Participant[]) {
    for (const duplicate of duplicates) {
      const reasons = Array.from(new Set([
        ...(duplicate.import_issue_reasons ?? []),
        'Duplicate IC — different guest names share this IC; verify details',
      ]))
      const { error: updateError } = await supabase
        .from('participants')
        .update({ needs_review: true, import_issue_reasons: reasons })
        .eq('id', duplicate.id)
      if (updateError) throw updateError
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    const normalIc = normaliseIc(form.ic_number)
    if ((!editingId || form.ic_number.trim()) && !isValidIc(form.ic_number)) {
      setError('Enter a valid 12-digit IC number. IC number is required for every new registration.')
      setSaving(false)
      return
    }

    if (!categories.some((item) => item.id === form.category)) {
      setError('Choose a valid category before saving this guest.')
      setSaving(false)
      return
    }

    const duplicates = findDuplicates(form.ic_number, editingId ?? undefined)
    const submittedNameKey = normaliseParticipantName(form.full_name)
    const samePersonDuplicates = duplicates.filter((participant) => normaliseParticipantName(participant.full_name) === submittedNameKey)
    const differentNameDuplicates = duplicates.filter((participant) => normaliseParticipantName(participant.full_name) !== submittedNameKey)
    if (duplicates.length && samePersonDuplicates.length && !differentNameDuplicates.length) {
      setError('This guest already exists with the same IC number and name. No additional guest record was created.')
      setSaving(false)
      return
    }
    if (differentNameDuplicates.length) {
      try {
        await flagDuplicateRegistrations(differentNameDuplicates)
      } catch (duplicateError) {
        setError(duplicateError instanceof Error ? duplicateError.message : 'Could not flag the existing duplicate registrations for review.')
        setSaving(false)
        return
      }
    }

    const duplicateIssue = differentNameDuplicates.length > 0 ? ['Duplicate IC — different guest names share this IC; verify details'] : []
    const values = {
      full_name: form.full_name.trim(),
      ic_number: normalIc || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      student_id: form.student_id.trim() || null,
      university_name: form.university_name.trim() || null,
      gender: form.gender.trim() || null,
      race: form.race.trim() || null,
      form_timestamp: editingId ? undefined : new Date().toISOString(),
      category: form.category,
      organisation: form.organisation.trim() || null,
      notes: form.notes.trim() || null,
      needs_review: !form.full_name.trim() || normalIc.length !== 12 || !categories.some((item) => item.id === form.category) || duplicateIssue.length > 0,
      import_issue_reasons: duplicateIssue,
      updated_at: new Date().toISOString(),
    }

    const existingParticipant = editingId
      ? participants.find((participant) => participant.id === editingId)
      : null
    const revisionFields: (keyof typeof values)[] = [
      'full_name', 'ic_number', 'email', 'phone', 'student_id',
      'university_name', 'gender', 'race', 'category', 'organisation',
      'notes', 'needs_review', 'import_issue_reasons',
    ]
    const hasActualChanges = !editingId || !existingParticipant || revisionFields.some((field) => {
      const previous = existingParticipant[field as keyof Participant]
      const nextValue = values[field]
      if (Array.isArray(previous) || Array.isArray(nextValue)) {
        return JSON.stringify(previous ?? []) !== JSON.stringify(nextValue ?? [])
      }
      return (previous ?? null) !== (nextValue ?? null)
    })

    // Do not touch updated_at for a no-op edit. The yellow REVISED marker is
    // based on updated_at being later than created_at, so it must only advance
    // when a real participant field has changed and the update is saved.
    const updateValues = {
      ...values,
      manual_revised_at: hasActualChanges ? values.updated_at : existingParticipant?.manual_revised_at ?? null,
      updated_at: hasActualChanges ? values.updated_at : existingParticipant?.updated_at,
    }

    const result = editingId
      ? hasActualChanges
        ? await supabase
            .from('participants')
            .update(updateValues)
            .eq('id', editingId)
            .select('id')
            .maybeSingle()
        : { error: null }
      : await supabase
          .from('participants')
          .insert({
            ...values,
            participant_code: generateParticipantCode(),
          })

    if (result.error) {
      setError(result.error.code === '23505'
        ? 'This IC number is already registered. Refresh the directory and check the existing participant.'
        : result.error.message)
    } else if (editingId && hasActualChanges && !result.data) {
      setError('The guest was not updated. The record may have changed or your account may not have permission. Refresh the directory and try again.')
    } else {
      setMessage(
        differentNameDuplicates.length
          ? `Duplicate IC conflict detected. This record and ${differentNameDuplicates.length} existing matching record(s) have been flagged for admin verification.`
          : editingId ? 'Participant updated.' : 'Participant added successfully.',
      )
      closeForm()
      await loadParticipants()
    }

    setSaving(false)
  }

  async function readZipText(view: DataView, path: string): Promise<string> {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
    let endOffset = -1
    for (let offset = Math.max(0, bytes.length - 65557); offset <= bytes.length - 22; offset++) {
      if (view.getUint32(offset, true) === 0x06054b50) endOffset = offset
    }
    if (endOffset < 0) throw new Error('This Excel file is not a valid .xlsx workbook.')
    const entryCount = view.getUint16(endOffset + 10, true)
    let cursor = view.getUint32(endOffset + 16, true)
    const decoder = new TextDecoder()
    for (let index = 0; index < entryCount; index++) {
      if (view.getUint32(cursor, true) !== 0x02014b50) break
      const method = view.getUint16(cursor + 10, true)
      const compressedSize = view.getUint32(cursor + 20, true)
      const uncompressedSize = view.getUint32(cursor + 24, true)
      const nameLength = view.getUint16(cursor + 28, true)
      const extraLength = view.getUint16(cursor + 30, true)
      const commentLength = view.getUint16(cursor + 32, true)
      const localOffset = view.getUint32(cursor + 42, true)
      const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength))
      cursor += 46 + nameLength + extraLength + commentLength
      if (name !== path) continue
      if (uncompressedSize > 25 * 1024 * 1024) throw new Error('The selected Excel worksheet is too large (25 MB limit).')
      if (method !== 0 && method !== 8) throw new Error('This Excel workbook uses an unsupported compression method.')
      const localNameLength = view.getUint16(localOffset + 26, true)
      const localExtraLength = view.getUint16(localOffset + 28, true)
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength
      const compressed = bytes.slice(dataOffset, dataOffset + compressedSize)
      if (method === 0) return decoder.decode(compressed)
      if (typeof DecompressionStream === 'undefined') throw new Error('Your browser cannot read compressed Excel files. Please use the latest Chrome or Edge.')
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      const result = await new Response(stream).arrayBuffer()
      if (result.byteLength > 25 * 1024 * 1024) throw new Error('The selected Excel worksheet is too large (25 MB limit).')
      return decoder.decode(result)
    }
    throw new Error('The Excel workbook is missing a required worksheet file: ' + path)
  }

  function recordsFromMatrix(matrix: string[][]): Record<string, string>[] {
    const normalise = (value: string) => (value ?? '').replace(/^\\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    const nameHeaders = ['fullname', 'participantname', 'yourname', 'name', 'namapenuh', 'namapeserta', 'nama', 'namapeserta', 'namaahli', 'namaindividu', 'namapemohon']
    const icHeaders = ['icnumber', 'identitycardnumber', 'mykad', 'nokadpengenalan', 'nomborkadpengenalan', 'nokp', 'nokad', 'kadpengenalan', 'nomboric', 'ic', 'noic', 'nokadpengenalan diri']
    const categoryHeaders = ['category', 'kategori', 'participantcategory', 'kategoripeserta', 'jenispenyertaan', 'jenispeserta', 'statuspeserta']
    const headerScore = (row: string[]) => {
      const values = row.map(normalise)
      return Number(values.some((value) => nameHeaders.includes(value) || nameHeaders.some((alias) => alias.length > 4 && value.includes(alias)))) * 4
        + Number(values.some((value) => icHeaders.includes(value) || icHeaders.some((alias) => alias.length > 4 && value.includes(alias)))) * 2
        + Number(values.some((value) => categoryHeaders.includes(value) || categoryHeaders.some((alias) => value.includes(alias)))) * 2
    }
    const candidates = matrix.slice(0, 40)
    const headerIndex = candidates.reduce((best, row, index) => headerScore(row) > headerScore(candidates[best] ?? []) ? index : best, 0)
    const headers = (matrix[headerIndex] ?? []).map((value) => (value ?? '').trim().replace(/^\\uFEFF/, ''))
    if (headerScore(headers) < 4) throw new Error('Could not identify the participant header row. Include Full Name / Nama Penuh and IC Number / No. Kad Pengenalan columns.')
    const seenHeaderKeys = new Set<string>()
    const duplicateHeaders = headers.filter((header) => {
      const key = normalise(header)
      if (!key) return false
      if (seenHeaderKeys.has(key)) return true
      seenHeaderKeys.add(key)
      return false
    })
    if (duplicateHeaders.length) {
      throw new Error(`The uploaded file contains duplicate column headers: ${Array.from(new Set(duplicateHeaders)).join(', ')}. Please correct the headers before importing.`)
    }
    const dataRows = matrix.slice(headerIndex + 1).filter((row) => row.some((value) => (value ?? '').trim()))
    // Keep every non-empty source row. A missing or malformed serial value
    // must not cause a guest row to disappear from the import.
    return dataRows.map((row, rowIndex) => {
      const record: Record<string, string> = {}
      headers.forEach((header, index) => { if (header) record[header] = row[index] ?? '' })
      record.__eventflow_source_row = String(headerIndex + rowIndex + 2)
      return record
    })
  }

  async function parseXlsxFile(file: File): Promise<Record<string, string>[]> {
    if (file.size > 20 * 1024 * 1024) throw new Error('Excel files must be 20 MB or smaller.')
    const view = new DataView(await file.arrayBuffer())
    const workbookXml = new DOMParser().parseFromString(await readZipText(view, 'xl/workbook.xml'), 'application/xml')
    const relationshipsXml = new DOMParser().parseFromString(await readZipText(view, 'xl/_rels/workbook.xml.rels'), 'application/xml')
    if (workbookXml.querySelector('parsererror') || relationshipsXml.querySelector('parsererror')) throw new Error('The Excel workbook structure could not be read.')
    const firstSheet = workbookXml.getElementsByTagName('sheet')[0]
    const relationshipId = firstSheet?.getAttribute('r:id')
    if (!relationshipId) throw new Error('The Excel workbook does not contain a readable worksheet.')
    const relationship = Array.from(relationshipsXml.getElementsByTagName('Relationship')).find((item) => item.getAttribute('Id') === relationshipId)
    const target = relationship?.getAttribute('Target')
    if (!target) throw new Error('Could not locate the first worksheet in this Excel workbook.')
    const sheetPath = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.?\//, '')
    const sharedStrings: string[] = []
    try {
      const stringsXml = new DOMParser().parseFromString(await readZipText(view, 'xl/sharedStrings.xml'), 'application/xml')
      for (const item of Array.from(stringsXml.getElementsByTagName('si'))) {
        sharedStrings.push(Array.from(item.getElementsByTagName('t')).map((node) => node.textContent ?? '').join(''))
      }
    } catch { /* Inline-string workbooks do not need sharedStrings.xml. */ }

    // Read explicit Excel zero-padding formats so numeric IC cells retain leading
    // zeroes exactly as Excel displays them. Never infer padding without a format.
    const customNumberFormats = new Map<number, string>()
    const cellNumberFormats: number[] = []
    try {
      const stylesXml = new DOMParser().parseFromString(await readZipText(view, 'xl/styles.xml'), 'application/xml')
      for (const item of Array.from(stylesXml.getElementsByTagName('numFmt'))) {
        customNumberFormats.set(Number(item.getAttribute('numFmtId')), item.getAttribute('formatCode') ?? '')
      }
      const cellXfs = stylesXml.getElementsByTagName('cellXfs')[0]
      for (const item of Array.from(cellXfs?.children ?? [])) {
        cellNumberFormats.push(Number(item.getAttribute('numFmtId') ?? 0))
      }
    } catch { /* Workbooks without styles use their stored cell values. */ }
    const applyExcelZeroFormat = (raw: string, format: string) => {
      const firstSection = format.split(';')[0].replace(/\\\\/g, '').trim()
      const groups = firstSection.match(/^(0{1,12})(?:-(0{2}))?(?:-(0{4}))?$/)
      if (!groups || !/^\\d+$/.test(raw)) return raw
      const widths = groups.slice(1).filter(Boolean).map((part) => part!.length)
      if (raw.length > widths.reduce((sum, width) => sum + width, 0)) return raw
      const padded = raw.padStart(widths.reduce((sum, width) => sum + width, 0), '0')
      let offset = 0
      return widths.map((width) => {
        const part = padded.slice(offset, offset + width)
        offset += width
        return part
      }).join('-')
    }

    const sheetXml = new DOMParser().parseFromString(await readZipText(view, sheetPath), 'application/xml')
    if (sheetXml.querySelector('parsererror')) throw new Error('The first Excel worksheet contains invalid XML.')
    const worksheetRows = Array.from(sheetXml.getElementsByTagName('row'))
    if (!worksheetRows.length) throw new Error('The first worksheet is empty.')
    const columnIndex = (reference: string) => {
      const letters = reference.match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? ''
      let value = 0
      for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64
      return Math.max(0, value - 1)
    }
    const matrix: string[][] = worksheetRows.map((row) => {
      const values: string[] = []
      for (const cell of Array.from(row.getElementsByTagName('c'))) {
        const index = columnIndex(cell.getAttribute('r') ?? '')
        // Formula cells are intentionally not evaluated and their cached results are not imported.
        if (cell.getElementsByTagName('f').length) continue
        const type = cell.getAttribute('t')
        const value = cell.getElementsByTagName('v')[0]?.textContent ?? ''
        let display = value
        if (type === 's') display = sharedStrings[Number(value)] ?? ''
        else if (type === 'inlineStr') display = Array.from(cell.getElementsByTagName('t')).map((node) => node.textContent ?? '').join('')
        else if (type === 'b') display = value === '1' ? 'TRUE' : 'FALSE'
        else if (!type || type === 'n') {
          const styleIndex = Number(cell.getAttribute('s') ?? 0)
          const numFmtId = cellNumberFormats[styleIndex] ?? 0
          const format = customNumberFormats.get(numFmtId) ?? ''
          display = applyExcelZeroFormat(value, format)
        }
        values[index] = display
      }
      return values
    })
    return recordsFromMatrix(matrix)
  }

  async function processImportRows(rows: Record<string, string>[], fileType: 'CSV' | 'Excel', existingParticipants: Participant[]) {
    const normaliseHeader = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    const getValue = (row: Record<string, string>, names: string[]) => {
      const aliases = new Set(names.map(normaliseHeader))
      const matches = Object.entries(row).filter(([key]) => aliases.has(normaliseHeader(key)))
      if (matches.length > 1) throw new Error(`The uploaded file has multiple columns matching "${names[0]}". Please confirm the correct header before importing.`)
      return matches[0]?.[1] ?? ''
    }
    const nameKeys = rows.map(row => normaliseParticipantName(getValue(row, ['fullname','participantname','yourname','whatisyourfullname','name','namapenuh','namapeserta','nama'])))
    const icValues = rows.map(row => getValue(row, ['nomboric','icnumber','identitycardnumber','mykad','nokadpengenalan','nomborkadpengenalan','nokp','nokad','kadpengenalan','ic','noic','no kad pengenalan','no kp']))
    const icKeys = icValues.map(normaliseIc)
    const namesByIc = new Map<string, Set<string>>()
    const countsByIc = new Map<string, number>()
    const rowsByName = new Map<string, Set<string>>()
    rows.forEach((_, index) => {
      const ic = icKeys[index]
      const name = nameKeys[index]
      if (ic) {
        countsByIc.set(ic, (countsByIc.get(ic) ?? 0) + 1)
        if (!namesByIc.has(ic)) namesByIc.set(ic, new Set())
        if (name) namesByIc.get(ic)!.add(name)
      }
      if (name && ic) {
        if (!rowsByName.has(name)) rowsByName.set(name, new Set())
        rowsByName.get(name)!.add(ic)
      }
    })
    const existingByIc = new Map<string, Participant[]>()
    existingParticipants.forEach((participant) => {
      const ic = normaliseIc(participant.ic_number)
      if (ic) existingByIc.set(ic, [...(existingByIc.get(ic) ?? []), participant])
    })
    const records: (ParticipantInsert & { id: string })[] = []
    const issuesByRow: string[][] = rows.map(() => [])
    const existingFlags = new Map<string, string>()
    const categoriesById = categories
    for (const [index, row] of rows.entries()) {
      const fullName = getValue(row, ['fullname', 'participantname', 'yourname', 'whatisyourfullname', 'name', 'namapenuh', 'namapeserta', 'nama'])
      const formTimestamp = getValue(row, ['timestamp', 'submissiontimestamp', 'submittedat'])
      const icNumber = icValues[index]
      const studentId = getValue(row, ['idpelajar', 'studentid', 'matricnumber', 'matricno', 'nomatrik', 'nombormatrik', 'matrik', 'no matrik', 'no pelajar', 'student no', 'studentnumber'])
      const universityName = getValue(row, ['ipt', 'namaipt', 'namauniversiti', 'universityname', 'university', 'institution', 'institusi', 'kolej', 'universiti', 'nama institusi'])
      const gender = getValue(row, ['jantina', 'gender', 'sex', 'lelaki/perempuan'])
      const race = getValue(row, ['bangsa', 'race', 'ethnicity', 'kaum'])
      const email = getValue(row, ['alamateemail', 'alamatemel', 'emailaddress', 'email', 'emel', 'e-mail', 'mail', 'emel peribadi', 'email peribadi'])
      const phone = getValue(row, ['nombortelefon', 'not telefon', 'notel', 'telefon', 'phonenumber', 'mobilenumber', 'mobile', 'phone', 'no hp', 'no handphone', 'handphone', 'hp', 'telefon bimbit', 'tel bimbit', 'contactnumber', 'contactno', 'no telefon'])
      const rawCategory = getValue(row, ['category', 'kategori', 'participantcategory', 'studentstaff', 'staffstudent', 'employmentstatus', 'jenis penyertaan', 'jenis peserta', 'status peserta'])
      const normalCategory = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
      const matchedCategory = categoriesById.find(item => normalCategory(item.id) === normalCategory(rawCategory) || normalCategory(item.name) === normalCategory(rawCategory))
      // Map only an exact configured category ID/name. Unknown or blank submitted
      // values stay as received and are flagged; never guess a category.
      const categoryValue = matchedCategory?.id ?? rawCategory
      const organisation = getValue(row, ['organisation', 'organization', 'organisasi', 'syarikat', 'company', 'school', 'sekolah', 'majikan', 'jabatan', 'department'])
      const notes = getValue(row, ['notes', 'remarks', 'catatan', 'nota', 'keterangan', 'description', 'comment', 'comments', 'maklumat tambahan', 'butiran', 'info'])
      const issues = issuesByRow[index]
      if (!fullName.trim()) issues.push('missing_name')
      if (!isValidIc(icNumber)) issues.push('invalid_ic')
      if (!matchedCategory) issues.push('unknown_category')
      const ic = icKeys[index]
      const name = nameKeys[index]
      const existingMatches = ic ? (existingByIc.get(ic) ?? []) : []
      const allNames = new Set([
        ...(namesByIc.get(ic) ?? []),
        ...existingMatches.map(person => normaliseParticipantName(person.full_name)).filter(Boolean),
      ])
      const totalSameIc = (countsByIc.get(ic) ?? 0) + existingMatches.length
      if (ic && totalSameIc > 1) {
        const hasUnknownName = rows.some((_, rowPosition) => icKeys[rowPosition] === ic && !nameKeys[rowPosition])
          || existingMatches.some(person => !normaliseParticipantName(person.full_name))
        if (allNames.size > 1 || hasUnknownName) issues.push('duplicate_ic')
        else issues.push('duplicate_registration')
      }
      if (name && (rowsByName.get(name)?.size ?? 0) > 1) issues.push('duplicate_name')
      const hasPhoneColumn = Object.keys(row).some(key => ['phonenumber','mobilenumber','phone','telefon','nombortelefon','nohp','handphone','notel','nottelefon','notelefon','nohandphone','telefonbimbit','telbimbit','contactnumber','contactno'].includes(normaliseHeader(key)))
      const hasStudentIdColumn = Object.keys(row).some(key => ['studentid','studentnumber','matricnumber','matricno','idpelajar','nomatrik','nombormatrik','studentno','nospelajar'].includes(normaliseHeader(key)))
      if (hasPhoneColumn && !phone.trim()) issues.push('missing_phone')
      if (hasStudentIdColumn && !studentId.trim()) issues.push('missing_student_id')
      if (ic && totalSameIc > 1) {
        const hasUnknownName = rows.some((_, rowPosition) => icKeys[rowPosition] === ic && !nameKeys[rowPosition])
          || existingMatches.some(person => !normaliseParticipantName(person.full_name))
        const reason = allNames.size > 1 || hasUnknownName
          ? 'Duplicate IC — different or missing guest names share this IC; verify details'
          : 'Repeated registration — same IC and guest name exists more than once'
        existingMatches.forEach(person => existingFlags.set(person.id, reason))
      }
      records.push({
        id: crypto.randomUUID(),
        participant_code: generateParticipantCode(),
        full_name: fullName,
        email: email || null,
        phone: phone || null,
        category: categoryValue,
        organisation: organisation || null,
        form_timestamp: formTimestamp || null,
        ic_number: icNumber || null,
        student_id: studentId || null,
        university_name: universityName || null,
        gender: gender || null,
        race: race || null,
        notes: notes || null,
        needs_review: issues.length > 0,
        import_issue_reasons: Array.from(new Set(issues.map(type => {
          const reasonLabels: Record<string, string> = {
            duplicate_ic: 'Duplicate IC — different or missing guest names share this IC; verify details',
            duplicate_registration: 'Repeated registration — same IC and guest name exists more than once',
            duplicate_name: 'Possible same-name match — verify guest identity',
            invalid_ic: 'Invalid IC format',
            missing_name: 'Missing guest name',
            unknown_category: 'Unknown category',
            missing_phone: 'Missing phone number',
            missing_student_id: 'Missing Student ID',
          }
          return reasonLabels[type] ?? type
        }))),
      })
    }

    for (let offset = 0; offset < records.length; offset += 500) {
      const { error: insertError } = await supabase.from('participants').insert(records.slice(offset, offset + 500))
      if (insertError) throw new Error(`Could not import source rows ${offset + 1}–${Math.min(offset + 500, records.length)}. ${insertError.message}`)
    }
    for (const [participantId, reason] of existingFlags) {
      const existing = existingParticipants.find(person => person.id === participantId)
      if (!existing) continue
      const reasons = Array.from(new Set([...(existing.import_issue_reasons ?? []), reason]))
      const { error: flagError } = await supabase.from('participants').update({ needs_review: true, import_issue_reasons: reasons }).eq('id', participantId)
      if (flagError) throw new Error('Guests were imported, but existing matching registrations could not be flagged: ' + flagError.message)
    }
    await loadParticipants()
    return { participantIds: records.map(record => record.id), issuesByRow, importedCount: records.length, fileType }
  }

  async function recordImportBatch(file: File, rows: Record<string, string>[], participantIds: string[], issuesByRow: string[][]) {
    const userResult = await supabase.auth.getUser()
    const { data: batch, error: batchError } = await supabase.from('participant_import_batches').insert({
      file_name: file.name, file_type: /\.xlsx$/i.test(file.name) ? 'Excel' : 'CSV',
      uploaded_by: userResult.data.user?.id ?? null, source_row_count: rows.length,
    }).select('id').single()
    if (batchError || !batch) throw new Error('Guests were imported, but the source-file history could not be saved: ' + (batchError?.message ?? 'Unknown database error'))
    const sourceRecords = rows.map((row, index) => {
      const sourceData = Object.fromEntries(Object.entries(row).filter(([key]) => key !== '__eventflow_source_row'))
      const sourceName = Object.entries(row).find(([key]) => ['fullname','participantname','yourname','whatisyourfullname','name','namapenuh','namapeserta','nama'].includes(key.trim().toLowerCase().replace(/[^a-z0-9]/g,'')))?.[1] ?? ''
      const sourceIc = Object.entries(row).find(([key]) => ['icnumber','identitycardnumber','mykad','nokp','nokadpengenalan','nomborkadpengenalan','kadpengenalan','nomboric','ic','noic','nokad','nokadpengenal diri','nokadpengenalan diri','no kad pengenalan','no kp'].includes(key.trim().toLowerCase().replace(/[^a-z0-9]/g,'')))?.[1] ?? ''
      return {
        batch_id: batch.id, participant_id: participantIds[index] ?? null,
        source_row_number: Number(row.__eventflow_source_row) || index + 2,
        source_data: sourceData, source_name: sourceName || null, source_ic: sourceIc || null,
        issue_types: Array.from(new Set(issuesByRow[index] ?? [])),
      }
    })
    for (let offset = 0; offset < sourceRecords.length; offset += 500) {
      const { error: rowsError } = await supabase.from('participant_import_rows').insert(sourceRecords.slice(offset, offset + 500))
      if (rowsError) throw new Error('Guests were imported, but source-file rows could not be fully saved: ' + rowsError.message)
    }
    const linkedCount = sourceRecords.filter(row => row.participant_id).length
    const issueCount = sourceRecords.filter(row => row.issue_types.length).length
    const { error: updateError } = await supabase.from('participant_import_batches')
      .update({ linked_participant_count: linkedCount, issue_row_count: issueCount }).eq('id', batch.id)
    if (updateError) throw new Error('Source rows were saved, but the import summary could not be updated: ' + updateError.message)
    await Promise.all([loadImportHistory(), loadParticipants()])
  }

  async function handleFileImport(file?: File) {
    if (!file || !canImport) return
    const isExcel = /\.xlsx$/i.test(file.name)
    const isCsv = /\.csv$/i.test(file.name)
    if (!isExcel && !isCsv) { setError('Choose a .csv or .xlsx file.'); return }
    setImporting(true)
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const rows = isExcel
        ? await parseXlsxFile(file)
        : await new Promise<Record<string, string>[]>((resolve, reject) => {
            Papa.parse<string[]>(file, {
              header: false,
              skipEmptyLines: true,
              complete: (result) => {
                try { resolve(recordsFromMatrix(result.data)) }
                catch (parseError) { reject(parseError) }
              },
              error: reject,
            })
          })
      if (!rows.length) throw new Error('No participant rows were found in the selected file.')

      // Refresh the complete shared directory and attendance before duplicate checks.
      const latestParticipants = await loadParticipants()
      if (!latestParticipants) throw new Error('Could not refresh the shared participant directory. No rows were imported; refresh and try again.')
      const importResult = await processImportRows(rows, isExcel ? 'Excel' : 'CSV', latestParticipants)
      await recordImportBatch(file, rows, importResult.participantIds, importResult.issuesByRow)
      setMessage(`${importResult.importedCount} submitted guest row(s) imported from ${file.name}. ${importResult.issuesByRow.filter(items => items.length > 0).length} row(s) flagged for admin review. No duplicate rows were removed, merged or used to overwrite existing guests.`)
    } catch (err) {
      setLoading(false)
      setError(err instanceof Error ? err.message : (isExcel ? 'Excel' : 'CSV') + ' import failed.')
    } finally {
      setImporting(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function deleteParticipant(participant: Participant) {
    if (!canDeleteGuest) return
    const confirmed = window.confirm(
      `Permanently delete ${participant.full_name} (${participant.participant_code}) from the shared EventFlow database? This also permanently removes their attendance and Lucky Draw records. This cannot be undone.`,
    )
    if (!confirmed) return

    setError('')
    setMessage('')
    const { error: deleteError } = await supabase.rpc('delete_participant_permanently', { p_participant_id: participant.id })
    if (deleteError) {
      setError(`Could not delete participant: ${deleteError.message}`)
      return
    }

    setCheckedInIds((current) => {
      const updated = new Set(current)
      updated.delete(participant.id)
      return updated
    })
    setImportRows((current) => current.filter((row) => row.participant_id !== participant.id))
    if (selectedParticipant?.id === participant.id) setSelectedParticipant(null)
    setMessage(`${participant.full_name} and all linked guest, attendance, draw, invitation, notification, import-source and guest-history records were permanently deleted.`)
    await Promise.all([loadParticipants(), loadImportHistory()])
  }

  async function deleteUploadedList(batch: ImportBatch) {
    if (!isSuperAdmin) return
    const confirmed = window.confirm(
      `PERMANENTLY DELETE UPLOADED LIST "${batch.file_name}"? This deletes its source rows and guest records that belong only to this upload, including their attendance and Lucky Draw records. A guest still linked to another uploaded list will be kept. This cannot be undone.`,
    )
    if (!confirmed) return
    setError('')
    setMessage('')
    const { data, error: deleteError } = await supabase.rpc('delete_import_batch', { p_batch_id: batch.id })
    if (deleteError) {
      setError('Could not delete uploaded list: ' + deleteError.message)
      return
    }
    const result = data as { participants_deleted?: number; source_rows_deleted?: number } | null
    await Promise.all([loadParticipants(), loadImportHistory()])
    setMessage(`Uploaded list "${batch.file_name}" permanently deleted. ${result?.participants_deleted ?? 0} guest record(s) and ${result?.source_rows_deleted ?? 0} source row(s) deleted.`)
  }

  async function deleteCategoryGuests() {
    if (!isSuperAdmin || !deleteCategoryId) return
    const category = categories.find(item => item.id === deleteCategoryId)
    if (!category) return
    const categoryCount = participants.filter(item => item.category === category.id || item.category === category.name).length
    const confirmed = window.confirm(
      `PERMANENTLY DELETE ALL ${categoryCount} GUEST RECORD(S) IN "${category.name}"? Their linked attendance, Lucky Draw records, import-source rows and guest history will also be deleted. The category setting itself will remain. This cannot be undone.`,
    )
    if (!confirmed) return
    setError('')
    setMessage('')
    const { data, error: deleteError } = await supabase.rpc('delete_participant_category', {
      p_category_id: category.id,
      p_category_name: category.name,
    })
    if (deleteError) {
      setError('Could not delete category guests: ' + deleteError.message)
      return
    }
    const result = data as { participants_deleted?: number; unlinked_source_rows_deleted?: number } | null
    setDeleteCategoryId('')
    if (categoryFilter === category.id) setCategoryFilter('all')
    await Promise.all([loadParticipants(), loadImportHistory()])
    setMessage(`Category "${category.name}" cleared. ${result?.participants_deleted ?? 0} guest record(s) permanently deleted. The category setting remains available.`)
  }

  async function clearParticipantDirectory() {
    if (!isSuperAdmin || clearing) return
    const confirmed = window.confirm(
      `PERMANENTLY DELETE ALL ${participants.length} GUEST RECORDS? This will also delete all attendance, Lucky Draw entries, winners and draw rounds. Event settings, categories and admin accounts will be kept. This cannot be undone. Continue?`,
    )
    if (!confirmed) return

    setClearing(true)
    setError('')
    setMessage('')
    const { data, error: clearError } = await supabase.rpc('clear_participant_directory')
    setClearing(false)
    if (clearError) {
      setError(`Could not clear the participant directory: ${clearError.message}`)
      return
    }

    const result = data as { participants_deleted?: number } | null
    setParticipants([])
    setCheckedInIds(new Set())
    setImportRows([])
    setImportBatches([])
    setSelectedParticipant(null)
    setRevisionHistory([])
    setSearch('')
    setCategoryFilter('all')
    setStatusFilter('all')
    setCurrentPage(1)
    await Promise.all([loadParticipants(), loadImportHistory()])
    setMessage(`Directory cleared. ${result?.participants_deleted ?? participants.length} guest record(s) permanently deleted from the shared database. The directory has been refreshed and is ready for a new upload.`)
  }

  function participantIssues(participant: Participant) {
    const issues: string[] = []
    const sourceIssueTypes = Array.from(new Set(importRows.filter(row => row.participant_id === participant.id).flatMap(row => row.issue_types)))
    const sourceIssueLabels: Record<string, string> = {
      missing_name: 'Missing guest name', invalid_ic: 'Invalid IC', duplicate_ic: 'Duplicate IC conflict',
      duplicate_registration: 'Repeated registration (same IC and name)', duplicate_name: 'Possible same-name match',
      missing_phone: 'Missing phone number',
      missing_student_id: 'Missing Student ID', unknown_category: 'Unknown category', other: 'Other import issue',
    }
    for (const type of sourceIssueTypes) {
      const label = sourceIssueLabels[type] ?? type
      if (!issues.includes(label)) issues.push(label)
    }
    if (participant.needs_review) issues.push(...(participant.import_issue_reasons?.length ? participant.import_issue_reasons : ['Needs admin review']))
    if (!participant.full_name.trim() || participant.full_name.startsWith('NEEDS REVIEW ·')) issues.push('Missing guest name')
    if (!isValidIc(participant.ic_number)) issues.push('Invalid IC format (expected XXXXXX-XX-XXXX or XXXXXXXXXXXX)')
    if (!categories.some((category) => category.id === participant.category)) issues.push('Unknown category')
    return issues
  }

  const selectedSourceRows = sourceFilter === 'issues'
    ? importRows.filter(row => row.issue_types.length > 0 && (issueFilter === 'all' || row.issue_types.includes(issueFilter)))
    : null
  const selectedParticipantIds = selectedSourceRows ? new Set([
    ...selectedSourceRows.map(row => row.participant_id).filter((id): id is string => Boolean(id)),
    ...participants.filter((participant) => {
      const reasons = participant.import_issue_reasons ?? []
      if (issueFilter === 'all') return participant.needs_review
      if (issueFilter === 'duplicate_registration') return reasons.some((reason) => /repeated registration/i.test(reason))
      if (issueFilter === 'duplicate_ic') return reasons.some((reason) => /duplicate.*ic/i.test(reason))
      return false
    }).map((participant) => participant.id),
  ]) : null
  const unlinkedSourceRows = (selectedSourceRows ?? []).filter(row => !row.participant_id)
  const filteredParticipants = participants.filter((participant) => {
    const matchesSource = !selectedParticipantIds || selectedParticipantIds.has(participant.id)
    const term = search.trim().toLowerCase()

    const matchesSearch =
      !term ||
      participant.full_name.toLowerCase().includes(term) ||
      participant.participant_code.toLowerCase().includes(term) ||
      (participant.email ?? '').toLowerCase().includes(term) ||
      (participant.phone ?? '').toLowerCase().includes(term) ||
      (participant.ic_number ?? '').toLowerCase().includes(term) ||
      (participant.student_id ?? '').toLowerCase().includes(term) ||
      (participant.university_name ?? '').toLowerCase().includes(term)

    const matchesCategory =
      categoryFilter === 'all' || participant.category === categoryFilter

    const issues = participantIssues(participant)
    const checkedIn = checkedInIds.has(participant.id)
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'with_issues' && issues.length > 0) ||
      (statusFilter === 'not_checked_in' && !checkedIn && issues.length === 0) ||
      (statusFilter === 'completed' && checkedIn && issues.length === 0)

    return matchesSource && matchesSearch && matchesCategory && matchesStatus
  }).sort((a, b) =>
    a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base', numeric: true }) ||
    a.id.localeCompare(b.id),
  )

  const completedCount = participants.filter((p) => checkedInIds.has(p.id) && participantIssues(p).length === 0).length
  const wasRevised = (participant: Participant) => Boolean(participant.manual_revised_at)
  const issueCount = (() => {
    const affectedIds = new Set(importRows.filter(row => row.issue_types.length > 0).map(row => row.participant_id).filter((id): id is string => Boolean(id)))
    participants.forEach((participant) => {
      if (
        participant.needs_review ||
        !participant.full_name.trim() ||
        participant.full_name.startsWith('NEEDS REVIEW ·') ||
        !isValidIc(participant.ic_number) ||
        !categories.some((category) => category.id === participant.category)
      ) affectedIds.add(participant.id)
    })
    return affectedIds.size + importRows.filter(row => row.issue_types.length > 0 && !row.participant_id).length
  })()
  const totalPages = Math.max(1, Math.ceil(filteredParticipants.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedParticipants = filteredParticipants.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <div className="participant-management">
      <div className="participant-toolbar">
        <div className="participant-summary">
          <div className="participant-summary-icon">
            <Users size={21} />
          </div>
          <div>
            <strong>{participants.length} participants</strong>
            <span>{completedCount} completed · {issueCount} with issues</span>
          </div>
        </div>

        <div className="participant-toolbar-actions">
          {canImport && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="participant-file-input"
                onChange={(event) =>
                  void handleFileImport(event.target.files?.[0])
                }
              />

              <button
                className="participant-secondary-button"
                type="button"
                disabled={importing}
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={16} />
                {importing ? 'Importing...' : 'Import CSV / Excel'}
              </button>
            </>
          )}

          {isSuperAdmin && (
            <button
              className="participant-secondary-button participant-delete-button"
              type="button"
              onClick={() => void clearParticipantDirectory()}
              disabled={clearing || loading || participants.length === 0}
              title="Permanently delete all guest records and their attendance and Lucky Draw history"
            >
              <Trash2 size={16} /> {clearing ? 'Deleting list...' : 'Delete All Guests'}
            </button>
          )}

          <button
            className="participant-secondary-button"
            type="button"
            onClick={() => {
              setLoading(true)
              void loadParticipants()
            }}
            disabled={loading}
          >
            <RefreshCw size={16} /> Refresh
          </button>

          <button
            className="participant-primary-button"
            type="button"
            onClick={openAddForm}
          >
            <Plus size={17} /> Add Participant
          </button>
        </div>
      </div>

      {error && <div className="participant-alert error">{error}</div>}
      {message && <div className="participant-alert success">{message}</div>}

      {canImport && (
        <div className="participant-import-help">
          <strong>Import Google Form responses</strong>
          <span>Download the registration list from Google Sheets or Excel as CSV or Microsoft Excel (.xlsx), then choose Import CSV / Excel. The first worksheet is read automatically. EventFlow matches complete column headers (not partial header text). IC Number is read only from an IC / Kad Pengenalan column; Phone Number is read only from a Phone / Telefon column; Student ID is read only from an explicit Student ID / Matric / No. Pelajar column. These three fields are never substituted for one another, and Student ID is never extracted from an email address. If the workbook has no Student ID column, Student ID remains blank. IPT is read as the university/institution field, EMEL as Email, and Category as the participant category. Imported cell values are preserved as provided by the workbook; EventFlow does not add leading zeros, strip separators, trim or otherwise correct imported values. For numeric Excel cells, the underlying stored value is used, not a display-only number format, so a leading zero that exists only in Excel formatting will not be reconstructed and the IC will be flagged for admin review. Formula cells are skipped and formula results are never calculated or imported. Non-empty guest rows are retained even when an index/serial value is missing or malformed; blank rows are skipped. Import validation highlights issues for admins to review and correct manually. Large imports are sent to the database in batches of up to 500. Ensure the category matches Settings → Pool Settings. Admins can review the submitted timestamp, IC, Student ID, university, gender, race, contact details and notes in this directory.</span>
        </div>
      )}

      {isSuperAdmin && (
        <section className="participant-list-panel">
          <div className="participant-list-heading">
            <div>
              <h3>Delete selected data</h3>
              <p>Permanent deletion only. These actions do not remove category settings or other uploaded lists.</p>
            </div>
          </div>
          <div className="participant-filters">
            <select value={deleteCategoryId} onChange={(event) => setDeleteCategoryId(event.target.value)} aria-label="Choose category to delete">
              <option value="">Choose a category to delete…</option>
              {categories.map(category => <option key={category.id} value={category.id}>{category.name} ({participants.filter(item => item.category === category.id || item.category === category.name).length} guests)</option>)}
            </select>
            <button type="button" className="participant-secondary-button participant-delete-button" disabled={!deleteCategoryId} onClick={() => void deleteCategoryGuests()}>
              <Trash2 size={15} /> Delete category guests
            </button>
          </div>
          <div className="participant-table-wrap">
            <table className="participant-table">
              <thead><tr><th>Uploaded list</th><th>Rows</th><th>Issues</th><th>Uploaded</th><th>Action</th></tr></thead>
              <tbody>
                {importBatches.map(batch => (
                  <tr key={batch.id}>
                    <td><strong>{batch.file_name}</strong><small>{batch.file_type}</small></td>
                    <td>{batch.source_row_count}</td>
                    <td>{batch.issue_row_count}</td>
                    <td>{new Date(batch.created_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}</td>
                    <td><button type="button" className="participant-action-button participant-delete-button" onClick={() => void deleteUploadedList(batch)}><Trash2 size={14} /> Delete list</button></td>
                  </tr>
                ))}
                {importBatches.length === 0 && <tr><td colSpan={5}>No uploaded lists recorded.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {formOpen && (
        <section className="participant-form-panel">
          <div className="participant-form-heading">
            <div>
              <h3>{editingId ? 'Edit participant' : `Walk-in registration · ${eventName}`}</h3>
              <p>
                {editingId
                  ? 'Update this participant’s registration details.'
                  : 'Enter the same registration details collected by the online form. The submission timestamp is recorded automatically.'}
              </p>
            </div>

            <button
              type="button"
              className="participant-close-button"
              onClick={closeForm}
            >
              <X size={19} />
            </button>
          </div>

          <form className="participant-form" onSubmit={handleSubmit}>
            <label>
              Full name *
              <input
                value={form.full_name}
                onChange={(e) =>
                  setForm({ ...form, full_name: e.target.value })
                }
                required
                maxLength={150}
                placeholder="Participant full name"
              />
            </label>

            <label>
              IC number *
              <input
                value={form.ic_number}
                onChange={(e) => setForm({ ...form, ic_number: e.target.value })}
                inputMode="numeric"
                maxLength={20}
                placeholder="e.g. 900101-14-5678"
              />
            </label>

            <label>
              Student ID
              <input value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} placeholder="Student / matric number" />
            </label>

            <label>
              University name
              <input value={form.university_name} onChange={(e) => setForm({ ...form, university_name: e.target.value, organisation: e.target.value })} placeholder="Name of university" />
            </label>

            <label>
              Gender
              <input value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} placeholder="Gender" />
            </label>

            <label>
              Race
              <input value={form.race} onChange={(e) => setForm({ ...form, race: e.target.value })} placeholder="Race" />
            </label>

            <label>
              Phone number
              <input
                type="tel"
                value={form.phone}
                onChange={(e) =>
                  setForm({ ...form, phone: e.target.value })
                }
                placeholder="+60 12-345 6789"
              />
            </label>

            <label>
              Email address
              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm({ ...form, email: e.target.value })
                }
                placeholder="name@example.com"
              />
            </label>

            <label>
              Category *
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({
                    ...form,
                    category: e.target.value as Category,
                  })
                }
                required
              >
                {!categories.some((category) => category.id === form.category) && <option value="">Choose a category</option>}
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>

            <label>
              Notes
              <input
                value={form.notes}
                onChange={(e) =>
                  setForm({ ...form, notes: e.target.value })
                }
                placeholder="Optional notes"
              />
            </label>

            <div className="participant-form-actions">
              <button
                type="button"
                className="participant-secondary-button"
                onClick={closeForm}
              >
                Cancel
              </button>

              <button
                className="participant-primary-button"
                type="submit"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : editingId
                    ? 'Save changes'
                    : 'Add participant'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="participant-list-panel">
        <div className="participant-list-heading">
          <div>
            <h3>Participant Directory</h3>
            <p>Search and manage {eventName} registrations · maximum 50 records per page.</p>
          </div>

          <span className="participant-count">
            {filteredParticipants.length} total · {paginatedParticipants.length} on this page
          </span>
        </div>

        <div className="participant-filters">
          <div className="participant-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
              placeholder="Search name, code, IC, student ID, email or phone..."
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1) }}
          >
            <option value="all">All categories</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => { setSourceFilter(e.target.value); setIssueFilter('all'); setCurrentPage(1) }}
            aria-label="Filter participants or import issues"
          >
            <option value="all">All Participants</option>
            <option value="issues">Issues · {issueCount}</option>
          </select>
          {sourceFilter === 'issues' && (
            <select value={issueFilter} onChange={(e) => { setIssueFilter(e.target.value); setCurrentPage(1) }} aria-label="Filter issue type">
              <option value="all">All issue types</option>
              <option value="invalid_ic">IC issues</option>
              <option value="duplicate_ic">Duplicate IC conflict</option>
              <option value="duplicate_registration">Repeated registration</option>
              <option value="duplicate_name">Possible same-name matches</option>
              <option value="missing_name">Missing names</option>
              <option value="missing_phone">Missing phone</option>
              <option value="missing_student_id">Missing Student ID</option>
              <option value="unknown_category">Unknown category</option>
              <option value="other">Other import issues</option>
            </select>
          )}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1) }}
          >
            <option value="all">All statuses</option>
            <option value="with_issues">Need attention</option>
            <option value="not_checked_in">Haven't Check in</option>
            <option value="completed">Complete Check In</option>
          </select>
        </div>

        {unlinkedSourceRows.length > 0 && (
          <div className="participant-unlinked-rows">
            <strong>{unlinkedSourceRows.length} source row(s) need manual matching</strong>
            <div className="participant-table-wrap">
              <table className="participant-table">
                <thead><tr><th>Source row</th><th>Guest name</th><th>IC number</th><th>Issues</th></tr></thead>
                <tbody>{unlinkedSourceRows.map(row => (
                  <tr key={row.id} className="participant-row--issues">
                    <td>#{row.source_row_number}</td>
                    <td>{row.source_name || 'Missing name'}</td>
                    <td>{row.source_ic || '—'}</td>
                    <td>{row.issue_types.map(type => type.replace(/_/g, ' ')).join(', ') || 'Could not link to a unique participant'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

        {loading ? (
          <div className="participant-empty">Loading participants...</div>
        ) : filteredParticipants.length === 0 ? (
          <div className="participant-empty">
            <Users size={28} />
            <strong>No participants found</strong>
            <span>
              Try changing your search or add a new participant.
            </span>
          </div>
        ) : (
          <div className="participant-table-wrap">
            <table className="participant-table">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Contact</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {paginatedParticipants.slice(0, pageSize).map((participant) => {
                  const issues = participantIssues(participant)
                  const checkedIn = checkedInIds.has(participant.id)
                  const statusLabel = issues.length ? 'With issues' : checkedIn ? 'Completed' : "Haven't checked in"
                  return (
                  <tr key={participant.id} className={issues.length ? 'participant-row--issues' : undefined}>
                    <td>
                      {canManage ? (
                        <button type="button" className={`participant-name-button ${wasRevised(participant) ? 'participant-name--revised' : ''}`} onClick={() => void openParticipantDetails(participant)} title="View guest details and revision history">
                          {participant.full_name}
                          {wasRevised(participant) && <span className="participant-revised-label">REVISED</span>}
                          <History size={13} aria-hidden="true" />
                        </button>
                      ) : <strong>{participant.full_name}</strong>}
                      <small>{participant.participant_code}</small>
                      {participant.organisation && (
                        <small>{participant.organisation}</small>
                      )}
                      <small>IC: {participant.ic_number || '—'} · Student ID: {participant.student_id || '—'}</small>
                      <small>University: {participant.university_name || '—'}</small>
                      <small>Gender: {participant.gender || '—'} · Race: {participant.race || '—'}</small>
                      <small>Submitted: {participant.form_timestamp || '—'}</small>
                      {participant.notes && <small>Notes: {participant.notes}</small>}
                    </td>

                    <td>
                      <span>{participant.email || '—'}</span>
                      <small>{participant.phone || 'No phone number'}</small>
                    </td>

                    <td>
                      <span
                        className={`participant-category ${participant.category} category-color-${Math.max(0, categories.findIndex((item) => item.id === participant.category)) % 5}`}
                      >
                        {categoryName(categories, participant.category)}
                      </span>
                    </td>

                    <td>
                      <span className={`participant-status ${issues.length ? 'issue' : checkedIn ? 'active' : 'pending'}`}>
                        {statusLabel}
                      </span>
                      {issues.map((issue) => <small className="participant-issue-text" key={issue}>{issue}</small>)}
                    </td>

                    <td>
                      <div className="participant-row-actions">
                        {canManage && (
                          <>
                          <button
                            type="button"
                            className="participant-action-button"
                            onClick={() => openEditForm(participant)}
                            title="Edit participant"
                          >
                            <Pencil size={15} /> Edit
                          </button>
                          {canDeleteGuest && (
                            <button
                              type="button"
                              className="participant-action-button participant-delete-button"
                              onClick={() => void deleteParticipant(participant)}
                              title="Permanently delete participant and related database records"
                            >
                              <Trash2 size={15} /> Delete
                            </button>
                          )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filteredParticipants.length > 0 && (
          <div className="participant-pagination">
            <span>Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredParticipants.length)} of {filteredParticipants.length}</span>
            <div>
              <button type="button" className="participant-secondary-button" onClick={() => setCurrentPage(1)} disabled={safePage === 1}>First</button>
              <button type="button" className="participant-secondary-button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safePage === 1}>Previous</button>
              <span>Page {safePage} of {totalPages}</span>
              <button type="button" className="participant-secondary-button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safePage === totalPages}>Next</button>
              <button type="button" className="participant-secondary-button" onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages}>Last</button>
            </div>
          </div>
        )}
      </section>
      {selectedParticipant && (
        <div className="participant-history-backdrop" role="presentation" onClick={() => setSelectedParticipant(null)}>
          <section className="participant-history-modal" role="dialog" aria-modal="true" aria-labelledby="participant-history-title" onClick={(event) => event.stopPropagation()}>
            <header className="participant-history-header">
              <div><span>GUEST RECORD</span><h2 id="participant-history-title">{selectedParticipant.full_name}</h2><p>{selectedParticipant.participant_code} · {selectedParticipant.ic_number || 'No IC recorded'}</p></div>
              <button type="button" className="participant-history-close" onClick={() => setSelectedParticipant(null)} aria-label="Close guest details"><X size={19} /></button>
            </header>
            <div className="participant-history-current"><strong>Current details</strong>
              <div className="participant-history-grid">
                {[
                  ['Category', categoryName(categories, selectedParticipant.category)], ['Email', selectedParticipant.email], ['Phone', selectedParticipant.phone],
                  ['Student ID', selectedParticipant.student_id], ['University', selectedParticipant.university_name], ['Organisation', selectedParticipant.organisation],
                  ['Gender', selectedParticipant.gender], ['Race', selectedParticipant.race], ['Notes', selectedParticipant.notes],
                ].map(([label, value]) => <div key={label}><small>{label}</small><span>{value || '—'}</span></div>)}
              </div>
            </div>
            <div className="participant-history-timeline"><h3><History size={16} /> Added &amp; changed history</h3>
              {historyLoading ? <p className="participant-history-empty">Loading revision history…</p>
                : historyError ? <p className="participant-history-error">{historyError}</p>
                : revisionHistory.length === 0 ? <p className="participant-history-empty">No detailed history was recorded before revision tracking was enabled. New registrations and edits will appear here.</p>
                : revisionHistory.map((revision) => {
                  const details = revision.details ?? {}
                  const changedFields = details.changed_fields && typeof details.changed_fields === 'object' ? Object.entries(details.changed_fields as Record<string, { old?: unknown; new?: unknown }>) : []
                  const newValues = details.new_values && typeof details.new_values === 'object'
                    ? Object.entries(details.new_values as Record<string, unknown>).filter(([key, value]) => ['full_name','ic_number','email','phone','category','organisation','student_id','university_name','gender','race','notes','needs_review','import_issue_reasons'].includes(key) && value !== null && value !== '' && value !== false && (!Array.isArray(value) || value.length > 0))
                    : []
                  return <article className="participant-history-entry" key={revision.id}>
                    <div className="participant-history-entry-top"><strong>{revision.action === 'participant_created' ? 'Guest registered' : 'Guest details updated'}</strong><time>{new Date(revision.created_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}</time></div>
                    <small className="participant-history-actor">{String(details.actor_email ?? 'Admin')} · {String(details.actor_role ?? 'administrator').replace(/_/g, ' ')}</small>
                    {changedFields.length ? <div className="participant-history-changes">{changedFields.map(([field, change]) => <div className="participant-history-change" key={field}><strong>{formatRevisionLabel(field)}</strong><span><del>{formatRevisionValue(change.old)}</del><b>→</b><ins>{formatRevisionValue(change.new)}</ins></span></div>)}</div>
                      : newValues.length ? <div className="participant-history-changes">{newValues.map(([field, value]) => <div className="participant-history-change" key={field}><strong>{formatRevisionLabel(field)}</strong><span><ins>{formatRevisionValue(value)}</ins></span></div>)}</div> : null}
                  </article>
                })}
            </div>
            <footer className="participant-history-footer">
              <button type="button" className="participant-secondary-button" onClick={() => { setSelectedParticipant(null); openEditForm(selectedParticipant) }}><Pencil size={15} /> Edit guest</button>
              <button type="button" className="participant-primary-button" onClick={() => setSelectedParticipant(null)}>Close</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
