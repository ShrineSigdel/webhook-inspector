import { useEffect, useRef, useState } from 'react'
import { secondaryButton } from '../lib/styles'

interface Props {
  value: string
  label?: string
}

export function CopyButton({ value, label = 'Copy' }: Props) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
      }
    }
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
      }
      timer.current = window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can be denied; the value is still visible on screen.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={`${secondaryButton} px-3 py-1.5 text-xs`}
      aria-live="polite"
    >
      {copied ? 'Copied' : label}
    </button>
  )
}
