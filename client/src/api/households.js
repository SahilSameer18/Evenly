import { useQuery } from '@tanstack/react-query'
import { request } from './client.js'

export const useHouseholds = () =>
  useQuery({ queryKey: ['households'], queryFn: async () => (await request('/households')).data.households })

export const useHousehold = (id) =>
  useQuery({ queryKey: ['household', id], enabled: Boolean(id), queryFn: async () => (await request(`/households/${id}`)).data.household })

// One household per person in the MVP, so "mine" is the first one the server lists.
export function useMyHousehold() {
  const { data, ...rest } = useHouseholds()
  return { household: data?.[0] ?? null, ...rest }
}
