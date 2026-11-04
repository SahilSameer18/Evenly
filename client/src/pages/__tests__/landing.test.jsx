import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Landing from '../Landing.jsx'

const page = () => render(<MemoryRouter><Landing /></MemoryRouter>)

describe('Landing page', () => {
  it('has one main heading and a heading for every section', () => {
    page()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Split the bills.')
    for (const name of ['How it works', 'What you get', 'Numbers you can check', 'Questions', 'Start splitting']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
  })

  it('has the page landmarks', () => {
    page()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('sends visitors to register or login from every call to action', () => {
    page()
    const start = screen.getAllByRole('link', { name: 'Get started' })
    const login = screen.getAllByRole('link', { name: 'Log in' })
    expect(start.length).toBeGreaterThanOrEqual(3)
    start.forEach((a) => expect(a).toHaveAttribute('href', '/register'))
    login.forEach((a) => expect(a).toHaveAttribute('href', '/login'))
  })

  it('credits the author with a safe external link', () => {
    page()
    const link = screen.getByRole('link', { name: 'Sahil Sameer Siddique' })
    expect(link).toHaveAttribute('href', 'https://www.linkedin.com/in/sahil-sameer-siddique/')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('labels the sample balance as an example', () => {
    page()
    const sample = screen.getByRole('region', { name: 'Example balance' })
    expect(within(sample).getByText('Example')).toBeInTheDocument()
    // signs and words, never colour alone
    expect(within(sample).getByText('+₹1,000')).toBeInTheDocument()
    expect(within(sample).getAllByText('you owe').length).toBeGreaterThan(0)
  })

  it('does not promise repayments as if they already worked: both mentions carry a Soon tag', () => {
    page()
    const tagged = ['Pay each other back', 'Repayments you both confirm']
    for (const title of tagged) {
      const heading = screen.getByRole('heading', { level: 3, name: new RegExp(title) })
      expect(within(heading).getByText('Soon')).toBeInTheDocument()
    }
  })

  it('answers the questions without JavaScript, using native details elements', () => {
    page()
    const items = document.querySelectorAll('details')
    expect(items).toHaveLength(4)
    expect(screen.getByText('Do my roommates need accounts?').closest('summary')).not.toBeNull()
  })
})
