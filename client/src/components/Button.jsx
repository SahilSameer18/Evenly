import { Link } from 'react-router'

const BASE = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 font-medium transition-opacity disabled:opacity-60'
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
