import { Link } from 'react-router'

// Pressing shrinks the button a touch (transform only, 100 ms), so a tap always feels acknowledged.
const BASE = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 font-medium transition-[transform,opacity] duration-100 active:scale-[0.97] disabled:opacity-60'
const VARIANTS = {
  action: 'bg-action text-on-action',
  quiet: 'border border-edge text-ink',
  destructive: 'border border-owe text-owe',
}

// One main action per view; everything else is quiet. Renders a link when given `to`.
export function Button({ variant = 'action', to, className = '', ...props }) {
  const cls = `${BASE} ${VARIANTS[variant]} ${className}`
  return to ? <Link to={to} className={cls} {...props} /> : <button type="button" className={cls} {...props} />
}
