import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { request } from './client.js'

const base = (householdId) => `/households/${householdId}`

// Everything about repayments hangs off ['settlements', householdId, ...], so one invalidation refreshes all of it.
export const usePendingSettlements = (householdId) =>
  useQuery({
    queryKey: ['settlements', householdId, 'pending'],
    enabled: Boolean(householdId),
    queryFn: async () => (await request(`${base(householdId)}/settlements?status=pending&limit=100`)).data.settlements,
  })

// Every repayment, newest first, 25 at a time on the server's cursor.
export function useSettlementHistory(householdId) {
  return useInfiniteQuery({
    queryKey: ['settlements', householdId, 'history'],
    enabled: Boolean(householdId),
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: 25 })
      if (pageParam) params.set('cursor', pageParam)
      const { data, meta } = await request(`${base(householdId)}/settlements?${params}`)
      return { settlements: data.settlements, nextCursor: meta.pagination?.nextCursor ?? null }
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}

export const useSuggestions = (householdId) =>
  useQuery({ queryKey: ['suggestions', householdId], enabled: Boolean(householdId), queryFn: async () => (await request(`${base(householdId)}/settlement-suggestions`)).data.suggestions })

export const useLedger = (householdId, enabled = true) =>
  useQuery({ queryKey: ['ledger', householdId], enabled: Boolean(householdId) && enabled, queryFn: async () => (await request(`${base(householdId)}/ledger`)).data })

// The idempotency key makes a retry or a double tap record exactly one repayment.
export const createSettlement = (householdId, body, idempotencyKey) =>
  request(`${base(householdId)}/settlements`, { method: 'POST', body, idempotencyKey }).then(({ data }) => data.settlement)

export const confirmSettlement = (householdId, id) =>
  request(`${base(householdId)}/settlements/${id}/confirm`, { method: 'POST' }).then(({ data }) => data)

export const rejectSettlement = (householdId, id, reason) =>
  request(`${base(householdId)}/settlements/${id}/reject`, { method: 'POST', body: reason ? { reason } : {} }).then(({ data }) => data.settlement)

export const cancelSettlement = (householdId, id) =>
  request(`${base(householdId)}/settlements/${id}/cancel`, { method: 'POST' }).then(({ data }) => data.settlement)

// A repayment moves balances and suggestions; the ledger and the balances are worked out from it.
export const refreshSettle = (queryClient, householdId) =>
  Promise.all(['settlements', 'balances', 'suggestions', 'ledger'].map((key) => queryClient.invalidateQueries({ queryKey: [key, householdId] })))
