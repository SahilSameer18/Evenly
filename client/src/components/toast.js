import { createContext, useContext } from 'react'

export const ToastContext = createContext(() => {})

/** const toast = useToast(); toast('Link copied'); toast('Expense added', { label: 'Undo', onClick }) */
export const useToast = () => useContext(ToastContext)
