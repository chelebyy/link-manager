import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchInterval: query => query.state.error instanceof ApiError && query.state.error.status === 429
        ? Math.max(60_000, query.state.error.retryAfterMs ?? 60_000)
        : 60_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
