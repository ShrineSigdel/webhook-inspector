import { useEffect, useRef, useState } from 'react'
import { createStreamTicket, type CapturedRequest } from '../api/client'

export type StreamStatus = 'off' | 'connecting' | 'live' | 'reconnecting'

interface Options {
  endpointId: string
  owned: boolean
  enabled: boolean
  onRequest: (request: CapturedRequest) => void
  onReconnect: () => void
}

const RETRY_DELAY_MS = 2000

function isCapturedRequest(value: unknown): value is CapturedRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as { id?: unknown; method?: unknown; createdAt?: unknown }
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.method === 'string' &&
    typeof candidate.createdAt === 'string'
  )
}

export function useLiveRequests({
  endpointId,
  owned,
  enabled,
  onRequest,
  onReconnect,
}: Options): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>('off')
  const onRequestRef = useRef(onRequest)
  const onReconnectRef = useRef(onReconnect)

  // Keep the latest callbacks without making them reconnect dependencies.
  useEffect(() => {
    onRequestRef.current = onRequest
  }, [onRequest])

  useEffect(() => {
    onReconnectRef.current = onReconnect
  }, [onReconnect])

  useEffect(() => {
    if (!enabled) {
      return
    }

    let cancelled = false
    let source: EventSource | null = null
    let retryTimer: number | null = null
    let connectedOnce = false

    const scheduleRetry = () => {
      if (cancelled || retryTimer !== null) {
        return
      }
      retryTimer = window.setTimeout(() => {
        retryTimer = null
        void connect()
      }, RETRY_DELAY_MS)
    }

    const connect = async (): Promise<void> => {
      if (cancelled) {
        return
      }

      setStatus(connectedOnce ? 'reconnecting' : 'connecting')

      // EventSource cannot send Authorization, so owned endpoints get a
      // short-lived ticket. Guest endpoints are open to anyone with the link.
      let url = `/api/endpoints/${encodeURIComponent(endpointId)}/stream`
      if (owned) {
        try {
          const { ticket } = await createStreamTicket(endpointId)
          url += `?ticket=${encodeURIComponent(ticket)}`
        } catch {
          if (!cancelled) {
            setStatus('reconnecting')
            scheduleRetry()
          }
          return
        }
      }

      if (cancelled) {
        return
      }

      const next = new EventSource(url)
      source = next

      next.onopen = () => {
        if (cancelled || source !== next) {
          return
        }
        setStatus('live')
        // History may have changed while the stream was down, so reload it
        // after every reconnect (but not after the first connect).
        if (connectedOnce) {
          onReconnectRef.current()
        }
        connectedOnce = true
      }

      next.onmessage = (event: MessageEvent) => {
        if (cancelled || source !== next) {
          return
        }
        try {
          const payload: unknown = JSON.parse(event.data)
          if (isCapturedRequest(payload)) {
            onRequestRef.current(payload)
          }
        } catch {
          // Ignore malformed events instead of breaking the stream.
        }
      }

      next.onerror = () => {
        if (cancelled || source !== next) {
          return
        }
        // Close manually; EventSource's own reconnect cannot fetch a new
        // ticket and would keep retrying with an expired one.
        next.close()
        if (source === next) {
          source = null
        }
        setStatus('reconnecting')
        scheduleRetry()
      }
    }

    void connect()

    return () => {
      cancelled = true
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
      }
      source?.close()
    }
  }, [enabled, endpointId, owned])

  // Disabled means there is no endpoint to watch yet. Deriving the status
  // avoids a synchronous setState at the top of the effect.
  return enabled ? status : 'off'
}
