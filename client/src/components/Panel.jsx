// A flat translucent panel with a hairline edge: no blur, no shadow, so it is cheap to draw.
export function Panel({ as: Tag = 'div', className = '', ...props }) {
  return <Tag className={`rounded-[22px] border border-edge bg-panel p-4 ${className}`} {...props} />
}

export function Chip({ icon, children }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-pending-bg px-2.5 py-0.5 text-xs text-pending">{icon}{children}</span>
}

export function Avatar({ name, size = 36 }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <span style={{ width: size, height: size }} className="num inline-flex shrink-0 items-center justify-center rounded-full border border-edge bg-panel text-xs" aria-hidden="true">
      {initials}
    </span>
  )
}

// Static on purpose: nothing loops, so a loading screen costs no battery.
export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`rounded-xl bg-panel ${className}`} />
}
