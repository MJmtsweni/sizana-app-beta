import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

// NetInfo's initial fetch is async, so isConnected starts out `null` —
// assume online until the first event arrives rather than flashing an
// "offline" banner on every cold start.
export function useIsOnline() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected !== false);
    });
    return unsubscribe;
  }, []);

  return isOnline;
}

type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  // Most Supabase failures are application errors (bad RLS, bad input) that
  // will just fail again identically — only retry ones that look transient
  // (network drop, timeout, 5xx) so a real error doesn't hang the caller.
  shouldRetry?: (error: any) => boolean;
};

const defaultShouldRetry = (error: any) => {
  const message = String(error?.message ?? error ?? '').toLowerCase();
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('fetch failed') ||
    message.includes('failed to fetch')
  );
};

// Wraps a Supabase (or any async) call with exponential-backoff retry for
// transient network failures. Usage: const { data, error } = await withRetry(
//   () => supabase.from('table').select('*')
// );
// Takes PromiseLike rather than Promise so Supabase's PostgrestFilterBuilder
// (thenable but not a strict Promise) still lets TS infer T correctly.
export async function withRetry<T>(fn: () => PromiseLike<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 2, baseDelayMs = 600, shouldRetry = defaultShouldRetry } = options;

  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result: any = await fn();
      // Supabase client calls resolve with { data, error } instead of throwing —
      // treat a populated `error` field the same as a thrown one so retry logic
      // covers both call styles.
      if (result && typeof result === 'object' && 'error' in result && result.error) {
        if (attempt < retries && shouldRetry(result.error)) {
          lastError = result.error;
          await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
          continue;
        }
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < retries && shouldRetry(error)) {
        await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
