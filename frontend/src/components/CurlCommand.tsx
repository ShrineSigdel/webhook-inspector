import { CopyButton } from './CopyButton'
import { codeBlockClass } from '../lib/styles'

export function CurlCommand({ url }: { url: string }) {
  const command = [
    `curl -X POST '${url}'`,
    `  -H 'Content-Type: application/json'`,
    `  -d '{"hello":"world"}'`,
  ].join(' \\\n')

  return (
    <div>
      <pre className={`${codeBlockClass} whitespace-pre`}>{command}</pre>
      <div className="mt-2 flex justify-end">
        <CopyButton value={command} label="Copy curl" />
      </div>
    </div>
  )
}
