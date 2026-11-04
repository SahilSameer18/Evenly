import { useEffect, useRef } from 'react'
import { Icon } from './Icon.jsx'

// A bottom sheet on phones and a side panel on desktop. The native <dialog> gives focus trapping and Escape for free.
export function Sheet({ open, onClose, title, children }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto h-auto max-h-[90dvh] w-full max-w-none rounded-t-[28px] border border-edge bg-bg p-5 text-ink backdrop:bg-black/60 md:ml-auto md:mt-0 md:h-dvh md:max-h-none md:w-[420px] md:rounded-none"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="num text-xl">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-11 items-center justify-center rounded-full text-ink-2">
          <Icon name="x" />
        </button>
      </div>
      {children}
    </dialog>
  )
}
