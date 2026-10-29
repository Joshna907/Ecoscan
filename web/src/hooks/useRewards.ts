import { useCallback, useEffect, useRef, useState } from 'react'
import type { OffersResponse } from 'shared'
import { api, messageOf } from '../lib/api'
export function useRewards() {
  const [data, setData] = useState<OffersResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++sequence.current
    setLoading(true); setError('')
    try { const result = await api.offers(); if (request === sequence.current) setData(result) }
    catch (cause) { if (request === sequence.current) setError(messageOf(cause)) }
    finally { if (request === sequence.current) setLoading(false) }
  }, [])
  // Initial fetch synchronizes the view with the server-owned balance.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void refresh() }, [refresh])
  return { data, loading, error, refresh }
}
export type RewardsState = ReturnType<typeof useRewards>
