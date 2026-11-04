import { Link } from 'react-router'
import { Button } from '../components/Button.jsx'
import { Icon } from '../components/Icon.jsx'
import { Panel } from '../components/Panel.jsx'
import { ThemeToggle } from '../components/ThemeToggle.jsx'
import { formatMoney } from '../lib/money.js'
import { stagger } from '../lib/motion.js'
import { useCountUp } from '../lib/useCountUp.js'
import { useScrolled } from '../lib/useScrolled.js'

const LINKEDIN = 'https://www.linkedin.com/in/sahil-sameer-siddique/'
const wrap = 'mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-8'
const h2 = 'num text-[clamp(1.75rem,5vw,2.5rem)] leading-tight'

// Every claim here must be true of the product today. Add a "Soon" tag to anything that is not built yet.

const STEPS = [
  { title: 'Add an expense', text: 'Split it equally, by percentage, by weight, or with exact amounts. Everyone sees it straight away.' },
  { title: 'Pay each other back', text: 'Record a repayment. The other person confirms it before any balance changes.' },
  { title: 'See where you stand', text: 'Your balance says who owes whom, worked out from the expenses you recorded.' },
]

const FEATURES = [
  { icon: 'settings', title: 'Four ways to split', text: 'Equally, by percentage, by weight, or exact amounts, with a live preview of each person\'s share.' },
  { icon: 'receipt', title: 'Balances worked out, not guessed', text: 'Nothing is stored as a running total. Every balance is calculated from the expenses and repayments on record.' },
  { icon: 'lock', title: 'Private when you want', text: 'A personal expense is visible only to you and never changes anyone\'s balance.' },
  { icon: 'refresh', title: 'Safe on a bad connection', text: 'Tapping twice or retrying after the signal drops never records the same expense twice.' },
  { icon: 'clock', title: 'A history that stays', text: 'Nothing is deleted. A mistake is reversed, and the record shows who changed what and why.' },
  { icon: 'swap', title: 'Repayments you both confirm', text: 'The person being paid confirms the money arrived, so a balance never moves on one person\'s word.' },
]

const FACTS = [
  ['Whole paise only', 'Money is kept as whole paise, so nothing drifts or rounds away.'],
  ['Every change is recorded', 'Who did it, when, and why, written in the same step as the change.'],
  ['Balances add up to zero', 'What one person is owed, another owes. If the books ever stop adding up, it is flagged.'],
]

const QUESTIONS = [
  ['Do my roommates need accounts?', 'Yes. You create a household and send each roommate a single-use invitation link. They sign up or log in and join.'],
  ['Which currency does it use?', 'Indian rupees (₹) only, for now.'],
  ['Can my roommates see my personal expenses?', 'No. A personal expense is visible only to you.'],
  ['What if I record something wrong?', 'Tap Undo right after adding it. Corrections are recorded rather than erased, so there is always a history of what changed. More correction tools are on the way.'],
]

function SampleBalance() {
  const shown = useCountUp(30000) // the example's ₹300, counted up once
  return (
    <section aria-label="Example balance" style={stagger(3)} className="enter-pop rounded-[22px] border border-edge bg-hero p-5 text-hero-ink">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-hero-ink-2">Flat 302 · Bob owes you</p>
        <span className="shrink-0 rounded-full border border-white/20 px-2.5 py-0.5 text-xs text-hero-ink-2">Example</span>
      </div>
      <p className="num mt-1 flex items-center gap-2 text-[clamp(2.5rem,12vw,3.75rem)] leading-none text-hero-owed">
        <Icon name="arrow-up-right" size={32} /><span aria-hidden="true">{formatMoney(shown)}</span><span className="sr-only">₹300</span>
      </p>
      <ul className="mt-4 border-t border-white/10">
        {[
          ['Groceries', 'You paid', '+₹1,000', 'you lent', 'text-hero-owed'],
          ['Electricity', 'Bob paid', '−₹600', 'you owe', 'text-hero-owe'],
          ['Wifi', 'Bob paid', '−₹100', 'you owe', 'text-hero-owe'],
        ].map(([what, who, amount, words, tone]) => (
          <li key={what} className="flex items-center justify-between gap-3 border-b border-white/10 py-3 last:border-b-0">
            <span className="min-w-0"><span className="block truncate font-medium">{what}</span><span className="block text-xs text-hero-ink-2">{who}</span></span>
            <span className="shrink-0 text-right"><span className={`num block ${tone}`}>{amount}</span><span className="block text-xs text-hero-ink-2">{words}</span></span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function Landing() {
  const [topMarker, scrolled] = useScrolled()
  return (
    <>
      {/* Fixed at the top. Clear over the hero; once the page scrolls it gets an edge and a fill that is 95% opaque,
          so the page shows only faintly through it (a plain fill, no blur, which keeps it cheap for the phone). */}
      <div ref={topMarker} aria-hidden="true" className="-mb-px h-px" />
      <header className={`sticky top-0 z-40 -mt-[env(safe-area-inset-top)] border-b pt-[env(safe-area-inset-top)] transition-colors duration-150 ${scrolled ? 'border-edge bg-bg/95' : 'border-transparent'}`}>
        <div className={`${wrap} flex items-center justify-between gap-2 py-3`}>
          <p className="num text-xl">Evenly</p>
          <nav aria-label="Account" className="flex items-center gap-1">
            <ThemeToggle />
            {/* Below 480 px the hero's own Log in button is on screen, so the header keeps room for the rest. */}
            <Link to="/login" className="hidden min-h-11 items-center px-3 text-ink-2 transition-colors hover:text-ink sm:inline-flex">Log in</Link>
            <Button to="/register" className="px-4">Get started</Button>
          </nav>
        </div>
      </header>

      <main>
        <section aria-labelledby="hero-title" className={`${wrap} grid items-center gap-10 py-10 md:grid-cols-2 md:gap-12 md:py-20`}>
          <div className="min-w-0">
            <h1 id="hero-title" style={stagger(0)} className="enter num text-[clamp(2.5rem,9vw,4.5rem)] leading-[1.05]">Split the bills.<br />Stay even.</h1>
            <p style={stagger(1)} className="enter mt-5 max-w-md text-lg text-ink-2">Shared expenses for roommates. Add what you spend, and always know who owes whom.</p>
            <div style={stagger(2)} className="enter mt-7 flex flex-wrap gap-3">
              <Button to="/register">Get started</Button>
              <Button to="/login" variant="quiet">Log in</Button>
            </div>
          </div>
          <SampleBalance />
        </section>

        <section aria-labelledby="how-title" className={`${wrap} py-10 md:py-16`}>
          <h2 id="how-title" className={h2}>How it works</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="list-none">
                <Panel className="h-full">
                  <p className="num text-owed" aria-hidden="true">{i + 1}</p>
                  <h3 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-medium">{s.title}</h3>
                  <p className="mt-2 text-ink-2">{s.text}</p>
                </Panel>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="features-title" className={`${wrap} py-10 md:py-16`}>
          <h2 id="features-title" className={h2}>What you get</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="list-none">
                <Panel className="h-full">
                  <Icon name={f.icon} size={24} className="text-owed" />
                  <h3 className="mt-3 flex flex-wrap items-center gap-2 text-lg font-medium">{f.title}</h3>
                  <p className="mt-2 text-ink-2">{f.text}</p>
                </Panel>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="trust-title" className={`${wrap} grid items-start gap-8 py-10 md:grid-cols-2 md:gap-12 md:py-16`}>
          <div>
            <h2 id="trust-title" className={h2}>Numbers you can check</h2>
            <dl className="mt-6 flex flex-col gap-5">
              {FACTS.map(([term, text]) => (
                <div key={term}><dt className="font-medium">{term}</dt><dd className="mt-1 text-ink-2">{text}</dd></div>
              ))}
            </dl>
          </div>
          <Panel aria-label="Worked example" className="flex flex-col gap-3">
            <p className="text-ink-2">₹100.01 shared by two people</p>
            <ul className="flex flex-col divide-y divide-edge">
              <li className="flex justify-between gap-3 py-2.5"><span>Alice</span><span className="num">₹50.01</span></li>
              <li className="flex justify-between gap-3 py-2.5"><span>Bob</span><span className="num">₹50.00</span></li>
              <li className="flex justify-between gap-3 py-2.5 font-medium"><span>Total</span><span className="num">₹100.01</span></li>
            </ul>
            <p className="text-xs text-ink-2">The leftover paisa is given out fairly, so no paisa is lost or invented.</p>
          </Panel>
        </section>

        <section aria-labelledby="faq-title" className={`${wrap} py-10 md:py-16`}>
          <h2 id="faq-title" className={h2}>Questions</h2>
          <div className="mt-8 flex max-w-3xl flex-col gap-3">
            {QUESTIONS.map(([q, a]) => (
              <details key={q} className="group rounded-[22px] border border-edge bg-panel px-4">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 font-medium [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">{q}</span>
                  <Icon name="plus" className="shrink-0 text-ink-2 group-open:rotate-45" />
                </summary>
                <p className="pb-4 text-ink-2">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="cta-title" className={`${wrap} py-10 md:py-16`}>
          <Panel className="flex flex-col items-start gap-4 p-6 sm:items-center sm:p-10 sm:text-center">
            <h2 id="cta-title" className={h2}>Start splitting</h2>
            <p className="max-w-md text-ink-2">Create a household, invite your roommates, and add your first expense in a minute.</p>
            <div className="flex flex-wrap gap-3">
              <Button to="/register">Get started</Button>
              <Button to="/login" variant="quiet">Log in</Button>
            </div>
          </Panel>
        </section>
      </main>

      <footer className={`${wrap} flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-edge py-6 text-ink-2`}>
        <p>
          Engineered by{' '}
          <a href={LINKEDIN} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-ink underline">Sahil Sameer Siddique</a>
        </p>
        <p>Evenly is a work in progress.</p>
      </footer>
    </>
  )
}
