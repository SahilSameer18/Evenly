import { useId, useState } from 'react'
import { formatMoneyCompact, formatSigned } from '../../lib/money.js'
import { niceTicks, shortDate } from '../../lib/charts.js'
import { ChartCard, ChartEmpty } from './ChartCard.jsx'
import { useWidth } from './useWidth.js'

const H = 208
const M = { top: 20, right: 16, bottom: 28, left: 48 }
const OWED = 'var(--owed)'
const OWE = 'var(--owe)'

/**
 * Your balance over time. Above zero (you are owed) the line is the accent; below zero (you owe) it turns to
 * the owing colour; the zero line is drawn, so the sign never rests on colour alone. `points` come from balanceSeries.
 * Hover, touch or the arrow keys read one point; the last balance is labelled; "View as table" lists every point.
 */
export function BalanceTrend({ points, title = 'Your balance over time', subtitle }) {
  const uid = useId().replace(/:/g, '')
  const [wrap, width] = useWidth()
  const [active, setActive] = useState(null)
  const table = {
    columns: ['Date', 'What happened', 'Change', 'Balance'],
    rows: points.map((p) => [shortDate(p.at), p.label, formatSigned(p.delta), formatSigned(p.value)]),
  }

  if (points.length < 2) {
    return <ChartCard title={title} subtitle={subtitle}><ChartEmpty>Your balance line appears after a couple of expenses or repayments.</ChartEmpty></ChartCard>
  }

  const iw = Math.max(width - M.left - M.right, 40)
  const ih = H - M.top - M.bottom
  const times = points.map((p) => +p.at)
  const t0 = Math.min(...times)
  const t1 = Math.max(...times)
  const x = (t) => M.left + (t1 === t0 ? iw / 2 : ((t - t0) / (t1 - t0)) * iw)
  const values = points.map((p) => p.value)
  const { ticks, min, max } = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 4)
  const y = (v) => M.top + ih - ((v - min) / (max - min)) * ih
  const zero = y(0)

  const px = points.map((p) => [x(+p.at), y(p.value)])
  const line = px.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)} ${b.toFixed(1)}`).join(' ')
  const area = `${line} L${px[px.length - 1][0].toFixed(1)} ${zero.toFixed(1)} L${px[0][0].toFixed(1)} ${zero.toFixed(1)} Z`
  const last = points[points.length - 1]
  const [lx, ly] = px[px.length - 1]
  const current = points[active] ?? null // a point that no longer exists (the data changed) reads as none
  const shown = current ? active : null

  const nearest = (clientX, rect) => {
    const at = clientX - rect.left
    let best = 0
    px.forEach(([a], i) => { if (Math.abs(a - at) < Math.abs(px[best][0] - at)) best = i })
    return best
  }
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const from = active ?? points.length - 1
    setActive(Math.min(points.length - 1, Math.max(0, from + (e.key === 'ArrowRight' ? 1 : -1))))
  }
  const tipLeft = current ? Math.min(Math.max(px[shown][0], 92), width - 92) : 0

  return (
    <ChartCard title={title} subtitle={subtitle} table={table}>
      {/* The latest value is read out here, in words and sign, rather than printed on the line where it would cross it. */}
      <p className="num mb-1 text-2xl leading-none">{formatSigned(last.value)}<span className="ml-2 font-sans text-xs text-ink-2">{last.value > 0 ? 'you are owed now' : last.value < 0 ? 'you owe now' : 'settled now'}</span></p>
      <div
        ref={wrap}
        tabIndex={0}
        role="group"
        aria-label={`${title}. Use the left and right arrow keys to read each point.`}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => a ?? points.length - 1)}
        onBlur={() => setActive(null)}
        onPointerMove={(e) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerLeave={() => setActive(null)}
        className="relative touch-pan-y rounded-lg"
      >
        <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={`Line chart of your balance. Latest: ${formatSigned(last.value)}.`} className="block max-w-full">
          <defs>
            <clipPath id={`${uid}up`}><rect x="0" y="0" width={width} height={Math.max(zero, 0)} /></clipPath>
            <clipPath id={`${uid}down`}><rect x="0" y={zero} width={width} height={Math.max(H - zero, 0)} /></clipPath>
          </defs>

          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--panel-edge)" strokeWidth="1" />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="12" fill="var(--ink-2)" className="num">{formatMoneyCompact(t)}</text>
            </g>
          ))}
          <line x1={M.left} x2={width - M.right} y1={zero} y2={zero} stroke="var(--ink-2)" strokeOpacity="0.5" strokeWidth="1" />

          <g className="enter-fade">
            <path d={area} clipPath={`url(#${uid}up)`} fill={OWED} fillOpacity="0.12" />
            <path d={area} clipPath={`url(#${uid}down)`} fill={OWE} fillOpacity="0.12" />
            <path d={line} clipPath={`url(#${uid}up)`} fill="none" stroke={OWED} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <path d={line} clipPath={`url(#${uid}down)`} fill="none" stroke={OWE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </g>

          <text x={M.left} y={H - 8} fontSize="12" fill="var(--ink-2)">{shortDate(points[0].at)}</text>
          <text x={width - M.right} y={H - 8} textAnchor="end" fontSize="12" fill="var(--ink-2)">{shortDate(last.at)}</text>

          {current ? (
            <g>
              <line x1={px[shown][0]} x2={px[shown][0]} y1={M.top} y2={M.top + ih} stroke="var(--ink-2)" strokeOpacity="0.5" strokeWidth="1" />
              <circle cx={px[shown][0]} cy={px[shown][1]} r="5" fill={current.value >= 0 ? OWED : OWE} stroke="var(--bg)" strokeWidth="2" />
            </g>
          ) : (
            <circle cx={lx} cy={ly} r="5" fill={last.value >= 0 ? OWED : OWE} stroke="var(--bg)" strokeWidth="2" className="enter-pop" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
          )}
        </svg>

        {current && (
          <div style={{ left: tipLeft }} className="pointer-events-none absolute top-0 w-44 -translate-x-1/2 rounded-lg border border-edge bg-menu p-2 text-xs">
            <p className="text-ink-2">{shortDate(current.at)}</p>
            <p className="truncate font-medium text-ink">{current.label}</p>
            <p className="mt-1 flex justify-between gap-3"><span className="text-ink-2">Change</span><span className="num">{formatSigned(current.delta)}</span></p>
            <p className="flex justify-between gap-3"><span className="text-ink-2">Balance</span><span className="num">{formatSigned(current.value)}</span></p>
          </div>
        )}
        <p aria-live="polite" className="sr-only">{current ? `${shortDate(current.at)}, ${current.label}, balance ${formatSigned(current.value)}` : ''}</p>
      </div>
    </ChartCard>
  )
}
