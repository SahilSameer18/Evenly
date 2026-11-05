import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { request } from './client.js'

// `month` is "YYYY-MM"; left out, the server picks the current month in the household's timezone.
// The last answer stays on screen while the next month loads, so switching months does not flash.
export const useMonthlyReport = (householdId, month) =>
  useQuery({
    queryKey: ['report', householdId, month ?? 'current'],
    enabled: Boolean(householdId),
    placeholderData: keepPreviousData,
    queryFn: async () => (await request(`/households/${householdId}/reports/monthly${month ? `?month=${month}` : ''}`)).data,
  })
