import { useState } from 'react'
import { Panel } from '../Panel.jsx'

// The exact numbers behind a chart, as a table: for screen readers and anyone who wants to read them off.
function ChartTable({ columns, rows }) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-left">
        <thead className="text-xs text-ink-2">
          <tr>{columns.map((c, i) => <th key={c} scope="col" className={`py-1.5 font-normal ${i > 0 ? 'pl-3 text-right' : ''}`}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-t border-edge">
              {row.map((cell, i) => <td key={i} className={`py-2 ${i > 0 ? 'num pl-3 text-right' : 'min-w-0'}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// A titled panel for one chart. A chart is never the only way to read its data, so the toggle swaps it for a table.
export function ChartCard({ title, subtitle, table, children, className = '' }) {
  const [asTable, setAsTable] = useState(false)
  return (
    <Panel as="section" aria-label={title} className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="num text-lg">{title}</h2>
          {subtitle && <p className="text-ink-2">{subtitle}</p>}
        </div>
        {table && (
          <button type="button" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)} className="-mr-2 inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-ink-2 underline">
            {asTable ? 'View chart' : 'View as table'}
          </button>
        )}
      </div>
      <div className="mt-2">{asTable && table ? <ChartTable columns={table.columns} rows={table.rows} /> : children}</div>
    </Panel>
  )
}

// Shown in place of a chart that has too little to draw. Says what will make it appear.
export function ChartEmpty({ children }) {
  return <p className="py-6 text-ink-2">{children}</p>
}

// A small coloured mark beside a word: identity comes from the mark, and the text stays in the text colour.
export function Swatch({ className }) {
  return <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 shrink-0 rounded-[3px] ${className}`} />
}
