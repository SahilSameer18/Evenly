// A few inline SVG icons (no icon font to download). Stroke icons on a 24 grid.
const PATHS = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  receipt: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  swap: <path d="M7 7h13l-3-3M17 17H4l3 3" />,
  settings: <><path d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2" /><circle cx="14" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="16" cy="18" r="2" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  copy: <path d="M9 9h10v10H9zM5 15V5h10" />,
  check: <path d="M5 12.5 10 17.5 19 7" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  'arrow-up-right': <path d="M7 17 17 7M8 7h9v9" />,
  'log-out': <path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></>,
}

export function Icon({ name, size = 20, className }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {PATHS[name]}
    </svg>
  )
}
