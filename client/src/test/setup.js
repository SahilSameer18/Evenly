import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom has no <dialog> behaviour; this is enough for the Sheet to open and close in tests.
HTMLDialogElement.prototype.showModal ??= function showModal() { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close ??= function close() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }

afterEach(cleanup)
