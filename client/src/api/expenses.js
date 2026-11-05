import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { request } from './client.js'

const base = (householdId) => `/households/${householdId}`

export const useBalances = (householdId) =>
  useQuery({ queryKey: ['balances', householdId], enabled: Boolean(householdId), queryFn: async () => (await request(`${base(householdId)}/balances`)).data })

// Pages of 25 on the server's cursor; the next page is asked for only when the person scrolls to it.
export function useExpenses(householdId, { type, q, limit = 25 } = {}) {
  return useInfiniteQuery({
    queryKey: ['expenses', householdId, { type, q, limit }],
    enabled: Boolean(householdId),
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit })
      if (type) params.set('type', type)
      if (q) params.set('q', q)
      if (pageParam) params.set('cursor', pageParam)
      const { data, meta } = await request(`${base(householdId)}/expenses?${params}`)
      return { expenses: data.expenses, nextCursor: meta.pagination?.nextCursor ?? null }
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}

export const useExpense = (householdId, expenseId) =>
  useQuery({ queryKey: ['expense', householdId, expenseId], enabled: Boolean(householdId && expenseId), queryFn: async () => (await request(`${base(householdId)}/expenses/${expenseId}`)).data.expense })

// The idempotency key makes a retry or a double tap create exactly one expense.
export const createExpense = (householdId, body, idempotencyKey) =>
  request(`${base(householdId)}/expenses`, { method: 'POST', body, idempotencyKey }).then(({ data }) => data)

export const reverseExpense = (householdId, expenseId, reason) =>
  request(`${base(householdId)}/expenses/${expenseId}/reverse`, { method: 'POST', body: { reason } }).then(({ data }) => data.expense)

// Every change is recorded: who did it, when and why. The key sits under ['expense', household, id] so one
// invalidation of the expense also refreshes its history.
export const useExpenseHistory = (householdId, expenseId) =>
  useQuery({ queryKey: ['expense', householdId, expenseId, 'history'], enabled: Boolean(householdId && expenseId), queryFn: async () => (await request(`${base(householdId)}/expenses/${expenseId}/history`)).data.history })

// An edit sends the whole expense and the version that was edited; a stale version is refused with 409 STALE_VERSION.
export const updateExpense = (householdId, expenseId, body) =>
  request(`${base(householdId)}/expenses/${expenseId}`, { method: 'PATCH', body }).then(({ data }) => data.expense)

export const disputeExpense = (householdId, expenseId, reason) =>
  request(`${base(householdId)}/expenses/${expenseId}/dispute`, { method: 'POST', body: { reason } }).then(({ data }) => data.expense)

export const withdrawDispute = (householdId, expenseId) =>
  request(`${base(householdId)}/expenses/${expenseId}/dispute/withdraw`, { method: 'POST' }).then(({ data }) => data.expense)

// Anything that changes money makes every cached balance and list stale.
export const refreshMoney = (queryClient, householdId) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ['balances', householdId] }),
    queryClient.invalidateQueries({ queryKey: ['expenses', householdId] }),
    queryClient.invalidateQueries({ queryKey: ['expense', householdId] }),
    queryClient.invalidateQueries({ queryKey: ['suggestions', householdId] }),
    queryClient.invalidateQueries({ queryKey: ['ledger', householdId] }),
    queryClient.invalidateQueries({ queryKey: ['report', householdId] }),
  ])
