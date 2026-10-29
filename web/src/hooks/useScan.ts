import { useEffect, useRef, useState } from 'react'
import type { AnalysisResponse, ConfirmScanRequest, ConfirmScanResponse } from 'shared'
import { api, ApiError, messageOf } from '../lib/api'

const pendingKey = 'ecoscan.pending-analysis'
function remembered() { try { return sessionStorage.getItem(pendingKey) } catch { return null } }
function remember(id: string | null) { try { if (id) sessionStorage.setItem(pendingKey, id); else sessionStorage.removeItem(pendingKey) } catch { /* Storage is optional. */ } }
export type Phase = 'upload' | 'uploading' | 'queued' | 'processing' | 'paused' | 'review' | 'confirming' | 'complete' | 'failed'
export type DraftItem = ConfirmScanRequest['items'][number] & { key: string }
export function useScan(onConfirmed: () => void) {
  const [pendingId, setPendingId] = useState(remembered)
  const [phase, setPhase] = useState<Phase>(() => remembered() ? 'queued' : 'upload')
  const [file, setFile] = useState<File | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [items, setItems] = useState<DraftItem[]>([])
  const [replaces, setReplaces] = useState<boolean | null>(null)
  const [result, setResult] = useState<ConfirmScanResponse | null>(null)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<ConfirmScanRequest | null>(null)
  const busy = useRef(false)
  const generation = useRef(0)
  const retryId = useRef(pendingId)
  function ready(value: AnalysisResponse) {
    setAnalysis(value)
    setItems(value.suggestions.map((item) => ({ key: crypto.randomUUID(), category: item.category, quantity: 1 })))
    setReplaces(null); setPhase('review'); setError('')
  }
  useEffect(() => {
    if (!pendingId) return
    const controller = new AbortController()
    const started = Date.now()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const job = await api.status(pendingId!, controller.signal)
        if (controller.signal.aborted) return
        if (job.status === 'ready') { ready(job); setPendingId(null); return }
        if (job.status === 'failed' || job.status === 'confirmed') {
          setError(job.status === 'failed' ? 'Recognition could not finish. Please start a new scan.' : 'This scan was already confirmed. Your current points are on the Rewards page.')
          setPhase('failed'); setPendingId(null); remember(null); return
        }
        setPhase(job.status)
        if (Date.now() - started > 120_000) {
          setPhase('paused'); setError('Your scan is taking longer than usual. You can check its progress again.'); setPendingId(null); return
        }
        timer = setTimeout(() => { void poll() }, 1500)
      } catch (cause) {
        if (controller.signal.aborted) return
        setError(messageOf(cause)); setPendingId(null)
        if (cause instanceof ApiError && [404, 410].includes(cause.status)) {
          setPhase('failed'); remember(null); retryId.current = null
        } else setPhase('paused')
      }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [pendingId])
  function selectFile(value: File | null) {
    setError('')
    if (!value) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(value.type)) { setFile(null); setError('Choose a JPEG, PNG, or WebP image.'); return }
    if (!value.size || value.size > 5 * 1024 * 1024) { setFile(null); setError('Choose an image between 1 byte and 5 MB.'); return }
    setFile(value)
  }
  async function upload() {
    if (!file || busy.current) return
    const current = generation.current
    busy.current = true; setError(''); setPhase('uploading')
    try {
      const response = await api.upload(file)
      if (current !== generation.current) return
      if (response.kind === 'queued') {
        retryId.current = response.job.analysisId; remember(response.job.analysisId); setPendingId(response.job.analysisId); setPhase('queued')
      } else ready(response.analysis)
    } catch (cause) { if (current === generation.current) { setError(messageOf(cause)); setPhase('upload') } }
    finally { if (current === generation.current) busy.current = false }
  }
  async function confirm() {
    if (!analysis || replaces === null || busy.current) return false
    const current = generation.current
    const input = confirmation ?? { analysisId: analysis.analysisId, items: items.map(({ category, quantity }) => ({ category, quantity })), replacesPlannedNewPurchase: replaces }
    busy.current = true; setConfirmation(input); setPhase('confirming'); setError('')
    try {
      const value = await api.confirm(input)
      if (current !== generation.current) return false
      setResult(value); setPhase('complete'); remember(null); setConfirmation(null); onConfirmed()
      return true
    } catch (cause) {
      if (current !== generation.current) return false
      setError(messageOf(cause)); setPhase('review')
      if (cause instanceof ApiError && cause.status === 400) setConfirmation(null)
      return false
    } finally { if (current === generation.current) busy.current = false }
  }
  function reset(force = false) {
    if (busy.current && !force) return
    generation.current++; busy.current = false
    retryId.current = null; setPendingId(null); remember(null); setFile(null); setAnalysis(null); setItems([])
    setReplaces(null); setResult(null); setConfirmation(null); setError(''); setPhase('upload')
  }
  return { phase, file, analysis, items, setItems, replaces, setReplaces, result, error, confirmation,
    selectFile, upload, confirm, reset,
    resume: () => { const id = retryId.current ?? remembered(); if (id) { setError(''); setPhase('queued'); setPendingId(id) } else { setError('This scan is unavailable. Please start again.'); setPhase('failed') } },
  }
}
export type ScanFlow = ReturnType<typeof useScan>
