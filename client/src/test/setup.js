import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// jsdom has no <dialog> behaviour; this is enough for the Sheet to open and close in tests.
HTMLDialogElement.prototype.showModal ??= function showModal() { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close ??= function close() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }

// The default 1 s wait for async results ran out now and then on a busy machine (a flaky session-restore test).
// Passing tests are not slower: the wait only matters when something is late.
configure({ asyncUtilTimeout: 4000 })

afterEach(cleanup)
