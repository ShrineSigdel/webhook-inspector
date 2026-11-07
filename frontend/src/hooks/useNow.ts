import { useEffect, useState } from 'react'

// Relative timestamps and expiry labels should keep moving even when no new
// request arrives, so pages re-render on a slow tick.
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])

  return now
}
