import { Link } from 'react-router'
import { Panel } from './Panel.jsx'

export function AuthLayout({ title, children }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-10">
      <Link to="/" className="num inline-flex min-h-11 items-center self-start text-2xl">Evenly</Link>
      <Panel className="enter-pop flex flex-col gap-5 p-6">
        <h1 className="num text-2xl">{title}</h1>
        {children}
      </Panel>
    </main>
  )
}
