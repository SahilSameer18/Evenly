import { Panel } from './Panel.jsx'

export function AuthLayout({ title, children }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <p className="num text-2xl">Evenly</p>
      <Panel className="flex flex-col gap-5 p-6">
        <h1 className="num text-2xl">{title}</h1>
        {children}
      </Panel>
    </main>
  )
}
