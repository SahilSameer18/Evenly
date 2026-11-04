// An invitation link survives the login or register detour. It is kept for that redirect only: the invite page
// clears it once the signed-in person is looking at it.
const KEY = 'evenly.pendingInvite'

export const rememberInvite = (token) => {
  try { sessionStorage.setItem(KEY, token) } catch { /* private mode: the link still works if they come back to it */ }
}
export const peekInvite = () => {
  try { return sessionStorage.getItem(KEY) } catch { return null }
}
export const clearInvite = () => {
  try { sessionStorage.removeItem(KEY) } catch { /* nothing to clear */ }
}
