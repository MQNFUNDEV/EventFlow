import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Plus, Search, RefreshCw, Pencil, Upload, Users, X, Trash2,
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
}

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
  const canImport = ['super_admin', 'event_admin', 'front_desk'].includes(currentRole)

  const [participants, setParticipants] = useState<Participant[]>([])
  const [checkedInIds, setCheckedInIds] = useState<Set<string>>(new Set())
  const [categories, setCategories] = useState<ParticipantCategory[]>(DEFAULT_PARTICIPANT_CATEGORIES)
  const [form, setForm] = useState<ParticipantForm>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('not_checked_in')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const loadParticipants = useCallback(async () => {
    const [participantResult, attendanceResult] = await Promise.all([
      fetchAllPages<Participant>((from, to) => supabase.from('participants').select('*').order('created_at', { ascending: false }).order('id').range(from, to)),
      fetchAllPages<{ participant_id: string }>((from, to) => supabase.from('attendance').select('participant_id').range(from, to)),
    ])
    if (participantResult.error) setError(participantResult.error.message)
    else { setParticipants(participantResult.data); setError('') }
    if (attendanceResult.error) setError(attendanceResult.error.message)
    else setCheckedInIds(new Set(attendanceResult.data.map((item) => item.participant_id)))
    setLoading(false)
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
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadParticipants])

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
      organisation: participant.university_name ?? participant.organisation ?? '',
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

  function findDuplicate(icNumber: string, excludeId?: string) {
    const normalIc = normaliseIc(icNumber)
    if (!normalIc) return undefined
    return participants.find((participant) =>
      participant.id !== excludeId && normaliseIc(participant.ic_number) === normalIc,
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    const normalIc = normaliseIc(form.ic_number)
    if ((!editingId || form.ic_number.trim()) && normalIc.length !== 12) {
      setError('Enter a valid 12-digit IC number. IC number is required for every new registration.')
      setSaving(false)
      return
    }

    if (!categories.some((item) => item.id === form.category)) {
      setError('Choose a valid category before saving this guest.')
      setSaving(false)
      return
    }

    const duplicate = findDuplicate(form.ic_number, editingId ?? undefined)

    if (duplicate) {
      setError(
        `This IC number is already registered to ${duplicate.full_name} (${duplicate.participant_code}). Each IC number can only be registered once.`,
      )
      setSaving(false)
      return
    }

    const values = {
      full_name: form.full_name.trim(),
      ic_number: normalIc || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      student_id: form.student_id.trim() || null,
      university_name: form.university_name.trim() || form.organisation.trim() || null,
      gender: form.gender.trim() || null,
      race: form.race.trim() || null,
      form_timestamp: editingId ? undefined : new Date().toISOString(),
      category: form.category,
      organisation: form.organisation.trim() || null,
      notes: form.notes.trim() || null,
      needs_review: !form.full_name.trim() || normalIc.length !== 12 || !categories.some((item) => item.id === form.category),
      import_issue_reasons: [],
      updated_at: new Date().toISOString(),
    }

    const result = editingId
      ? await supabase
          .from('participants')
          .update(values)
          .eq('id', editingId)
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
    } else {
      setMessage(
        editingId
          ? 'Participant updated.'
          : 'Participant added successfully.',
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
    const nameHeaders = ['fullname', 'participantname', 'yourname', 'name', 'namapenuh', 'namapeserta', 'nama']
    const icHeaders = ['icnumber', 'identitycardnumber', 'mykad', 'nokadpengenalan', 'nomborkadpengenalan', 'nokp', 'nokad', 'kadpengenalan', 'nomboric']
    const categoryHeaders = ['category', 'kategori', 'participantcategory', 'kategoripeserta']
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
    return matrix.slice(headerIndex + 1).filter((row) => row.some((value) => (value ?? '').trim())).map((row) => {
      const record: Record<string, string> = {}
      headers.forEach((header, index) => { if (header) record[header] = row[index] ?? '' })
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
        const type = cell.getAttribute('t')
        const value = cell.getElementsByTagName('v')[0]?.textContent ?? ''
        let display = value
        if (type === 's') display = sharedStrings[Number(value)] ?? ''
        else if (type === 'inlineStr') display = Array.from(cell.getElementsByTagName('t')).map((node) => node.textContent ?? '').join('')
        else if (type === 'b') display = value === '1' ? 'TRUE' : 'FALSE'
        values[index] = display.trim()
      }
      return values
    })
    return recordsFromMatrix(matrix)
  }

  async function processImportRows(rows: Record<string, string>[], fileType: 'CSV' | 'Excel') {
    const getValue = (row: Record<string, string>, names: string[]) => {
      const normaliseHeader = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
      const aliases = names.map(normaliseHeader)
      const entries = Object.entries(row)
      const entry = entries.find(([key]) => aliases.includes(normaliseHeader(key))) ?? entries.find(([key]) => {
        const header = normaliseHeader(key)
        return aliases.some((alias) => alias.length >= 5 && header.includes(alias))
      })
      return (entry?.[1] ?? '').trim()
    }
    const knownIcNumbers = new Set(participants.map((p) => normaliseIc(p.ic_number)).filter(Boolean))
    let skipped = 0
    const skipReasons: Record<string, number> = { 'Missing name': 0, 'Invalid IC (must be 12 digits)': 0, 'Unknown category': 0, 'Duplicate IC': 0 }
    const rowsToInsert: ParticipantInsert[] = []
    let issueRows = 0
    for (const [rowIndex, row] of rows.entries()) {
      const fullName = getValue(row, ['fullname', 'participantname', 'yourname', 'whatisyourfullname', 'name', 'namapenuh', 'namapeserta', 'nama'])
      const formTimestamp = getValue(row, ['timestamp', 'submissiontimestamp', 'submittedat'])
      const icNumber = getValue(row, ['nomboric', 'icnumber', 'identitycardnumber', 'mykad', 'nokadpengenalan', 'nomborkadpengenalan', 'nokp', 'nokad', 'kadpengenalan'])
      const studentId = getValue(row, ['idpelajar', 'studentid', 'matricnumber', 'matricno', 'nomatrik', 'nombormatrik'])
      const universityName = getValue(row, ['namauniversiti', 'universityname', 'university', 'institution', 'institusi'])
      const gender = getValue(row, ['jantina', 'gender', 'sex'])
      const race = getValue(row, ['bangsa', 'race', 'ethnicity'])
      const email = getValue(row, ['alamateemail', 'alamatemel', 'emailaddress', 'email', 'emel'])
      const phone = getValue(row, ['nombortelefon', 'not telefon', 'notel', 'telefon', 'phonenumber', 'mobilenumber', 'mobile', 'phone'])
      const rawCategory = getValue(row, ['category', 'kategori', 'participantcategory', 'studentstaff', 'staffstudent', 'employmentstatus']).toLowerCase()
      const normaliseCategory = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
      const normalCategory = normaliseCategory(rawCategory)
      const matchedCategory = categories.find((item) =>
        normaliseCategory(item.id) === normalCategory || normaliseCategory(item.name) === normalCategory,
      )
      const legacyCategory = rawCategory.includes('student') || rawCategory.includes('pupil')
        ? categories.find((item) => item.id === 'student')
        : rawCategory.includes('staff') || rawCategory.includes('employee') || rawCategory.includes('lecturer')
          ? categories.find((item) => item.id === 'staff') : undefined
      const categoryValue = matchedCategory?.id ?? legacyCategory?.id
      const organisation = universityName || getValue(row, ['organisation', 'organization', 'organisasi', 'syarikat', 'company', 'school', 'institution', 'sekolah'])
      const notes = getValue(row, ['notes', 'remarks', 'catatan', 'nota'])
      const digitsOnly = normaliseIc(icNumber)
      const normalIc = digitsOnly.length === 11 ? digitsOnly.padStart(12, '0') : digitsOnly

      // A duplicate belongs to an existing guest; never create a second guest record for it.
      if (normalIc && knownIcNumbers.has(normalIc)) {
        skipped++
        skipReasons['Duplicate IC']++
        continue
      }

      const issues: string[] = []
      if (!fullName) issues.push('Missing guest name')
      if (normalIc.length !== 12) issues.push('Invalid IC (must be 12 digits)')
      if (!categoryValue) issues.push('Unknown category')
      if (issues.length) {
        issueRows++
        if (!fullName) skipReasons['Missing name']++
        if (normalIc.length !== 12) skipReasons['Invalid IC (must be 12 digits)']++
        if (!categoryValue) skipReasons['Unknown category']++
      }
      if (normalIc) knownIcNumbers.add(normalIc)
      rowsToInsert.push({
        participant_code: generateParticipantCode(),
        full_name: fullName || `NEEDS REVIEW · Import row ${rowIndex + 1}`,
        email: email || null,
        phone: phone || null,
        category: categoryValue ?? categories[0]?.id ?? 'staff',
        organisation: organisation || null,
        form_timestamp: formTimestamp || null,
        ic_number: normalIc || (icNumber || null),
        student_id: studentId || null,
        university_name: universityName || null,
        gender: gender || null,
        race: race || null,
        notes: notes || null,
        needs_review: issues.length > 0,
        import_issue_reasons: issues,
      })
    }
    if (!rowsToInsert.length) {
      const breakdown = Object.entries(skipReasons).filter(([, count]) => count > 0).map(([reason, count]) => reason + ': ' + count).join(' · ')
      setMessage('No new guests imported. ' + skipped + ' duplicate row(s) skipped. ' + (breakdown || 'No valid participant rows found.'))
      return
    }
    let imported = 0
    let insertFailure: string | null = null
    for (let offset = 0; offset < rowsToInsert.length; offset += 500) {
      const batch = rowsToInsert.slice(offset, offset + 500)
      const { error: insertError } = await supabase.from('participants').insert(batch)
      if (insertError?.code === '23505') {
        for (const record of batch) {
          const { error: rowError } = await supabase.from('participants').insert(record)
          if (rowError?.code === '23505') skipped++
          else if (rowError) { insertFailure = rowError.message; break }
          else imported++
        }
        if (insertFailure) break
      } else if (insertError) { insertFailure = insertError.message; break }
      else imported += batch.length
    }
    if (imported > 0) await loadParticipants()
    if (insertFailure) {
      setError(imported + ' participant(s) imported before the next batch failed. ' + insertFailure + ' Refresh the directory before retrying; already imported records will be skipped by the duplicate checks.')
    } else {
      const breakdown = Object.entries(skipReasons).filter(([, count]) => count > 0).map(([reason, count]) => reason + ': ' + count).join(' · ')
      setMessage(imported + ' guest record(s) saved from ' + fileType + ', including ' + issueRows + ' guest(s) flagged for review. ' + skipped + ' duplicate row(s) skipped.' + (breakdown ? ' ' + breakdown + '.' : '') + ' Existing registrations will not be duplicated.')
    }
  }

  async function handleFileImport(file?: File) {
    if (!file || !canImport) return
    const isExcel = /\.xlsx$/i.test(file.name)
    const isCsv = /\.csv$/i.test(file.name)
    if (!isExcel && !isCsv) { setError('Choose a .csv or .xlsx file.'); return }
    setImporting(true)
    setError('')
    setMessage('')
    try {
      if (isExcel) {
        const rows = await parseXlsxFile(file)
        if (!rows.length) throw new Error('No participant rows were found in the first worksheet.')
        await processImportRows(rows, 'Excel')
      } else {
        const result = await new Promise<Papa.ParseResult<string[]>>((resolve, reject) => {
          Papa.parse<string[]>(file, { header: false, skipEmptyLines: true, complete: resolve, error: reject })
        })
        await processImportRows(recordsFromMatrix(result.data), 'CSV')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : (isExcel ? 'Excel' : 'CSV') + ' import failed.')
    } finally {
      setImporting(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function deleteParticipant(participant: Participant) {
    if (!canManage) return
    const confirmed = window.confirm(
      `Permanently delete ${participant.full_name} (${participant.participant_code}) from the shared EventFlow database? This also permanently removes their attendance and Lucky Draw records. This cannot be undone.`,
    )
    if (!confirmed) return

    setError('')
    setMessage('')
    // Remove dependent operational records first because these foreign keys intentionally restrict deletion.
    const dependentDeletes = await Promise.all([
      supabase.from('draw_winners').delete().eq('participant_id', participant.id),
      supabase.from('draw_entries').delete().eq('participant_id', participant.id),
      supabase.from('attendance').delete().eq('participant_id', participant.id),
      supabase.from('participant_invitations').delete().eq('participant_id', participant.id),
      supabase.from('push_subscriptions').delete().eq('participant_id', participant.id),
    ])
    const dependentError = dependentDeletes.find((result) => result.error)?.error
    if (dependentError) {
      setError(`Could not delete participant records completely: ${dependentError.message}. The participant record was kept.`)
      return
    }

    const { error: deleteError } = await supabase.from('participants').delete().eq('id', participant.id)
    if (deleteError) {
      setError(`Could not delete participant: ${deleteError.message}`)
      return
    }

    setCheckedInIds((current) => {
      const next = new Set(current)
      next.delete(participant.id)
      return next
    })
    setMessage(`${participant.full_name} and their related records were permanently deleted from the shared database.`)
    await loadParticipants()
  }

  function participantIssues(participant: Participant) {
    const issues: string[] = []
    if (participant.needs_review) issues.push(...(participant.import_issue_reasons?.length ? participant.import_issue_reasons : ['Needs admin review']))
    if (!participant.full_name.trim() || participant.full_name.startsWith('NEEDS REVIEW ·')) issues.push('Missing guest name')
    if (normaliseIc(participant.ic_number).length !== 12) issues.push('Invalid IC (must be 12 digits)')
    if (!categories.some((category) => category.id === participant.category)) issues.push('Unknown category')
    return issues
  }

  const filteredParticipants = participants.filter((participant) => {
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
      (statusFilter === 'not_checked_in' && !checkedIn && issues.length === 0) ||
      (statusFilter === 'with_issues' && issues.length > 0) ||
      (statusFilter === 'completed' && checkedIn && issues.length === 0)

    return matchesSearch && matchesCategory && matchesStatus
  })

  const completedCount = participants.filter((p) => checkedInIds.has(p.id) && participantIssues(p).length === 0).length
  const issueCount = participants.filter((p) => participantIssues(p).length > 0).length
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
          <span>Download the current Google Form responses from Google Sheets as CSV or Microsoft Excel (.xlsx), then choose Import CSV / Excel. The first worksheet is read automatically. EventFlow recognises English and Bahasa Malaysia column headings, including Full Name / Nama Penuh, IC Number / No. Kad Pengenalan, Phone Number / No. Telefon and Category / Kategori. It maps name, IC, student ID, university, gender, race, email, phone, category, timestamp and notes; serial-number and total-pax columns are ignored. You can repeat this whenever another group finishes registering: upload the latest export again, and EventFlow will skip records already in the directory and add new ones. Large imports are sent to the database in batches of up to 500. Ensure the category matches Settings → Pool Settings. Admins can review the submitted timestamp, IC, student ID, university, gender, race, contact details and notes in this directory.</span>
        </div>
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
                required
              />
            </label>

            <label>
              Student ID
              <input value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} placeholder="Student / matric number" required />
            </label>

            <label>
              University name
              <input value={form.university_name} onChange={(e) => setForm({ ...form, university_name: e.target.value, organisation: e.target.value })} placeholder="Name of university" required />
            </label>

            <label>
              Gender
              <input value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} placeholder="Gender" required />
            </label>

            <label>
              Race
              <input value={form.race} onChange={(e) => setForm({ ...form, race: e.target.value })} placeholder="Race" required />
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
                required
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
                required
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
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1) }}
          >
            <option value="not_checked_in">Haven't checked in</option>
            <option value="with_issues">With issues</option>
            <option value="completed">Completed</option>
          </select>
        </div>

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
                      <strong>{participant.full_name}</strong>
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
                          <button
                            type="button"
                            className="participant-action-button"
                            onClick={() => openEditForm(participant)}
                            title="Edit participant"
                          >
                            <Pencil size={15} /> Edit
                          </button>
                          <button
                            type="button"
                            className="participant-action-button participant-delete-button"
                            onClick={() => void deleteParticipant(participant)}
                            title="Permanently delete participant and related database records"
                          >
                            <Trash2 size={15} /> Delete
                          </button>
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
    </div>
  )
}
