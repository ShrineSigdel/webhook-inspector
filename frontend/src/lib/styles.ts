// Shared Tailwind class strings keep buttons and inputs consistent without a
// component library. Every color comes from a token in styles/theme.css.
export const primaryButton =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)] disabled:cursor-not-allowed disabled:opacity-50'

export const secondaryButton =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50'

export const dangerButton =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--border-danger)] bg-transparent px-3 py-1.5 text-xs font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)] disabled:cursor-not-allowed disabled:opacity-50'

export const inputClass =
  'block w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:outline-none'

export const cardClass =
  'rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)]'

export const codeBlockClass =
  'overflow-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 font-mono text-[13px] leading-relaxed text-[var(--text)]'
