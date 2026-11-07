import { CopyButton } from './CopyButton'

export function CurlCommand({ url }: { url: string }) {
  const command = [
    `curl -X POST '${url}'`,
    `  -H 'Content-Type: application/json'`,
    `  -d '{"hello":"world"}'`,
  ].join(' \\\n')

  return (
    <div>
      <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
        {command}
      </pre>
      <div className="mt-2 flex justify-end">
        <CopyButton value={command} label="Copy curl" />
      </div>
    </div>
  )
}
