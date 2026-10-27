import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  RemindersError,
  type RemindersAuthorization,
  type RemindersService,
  type RemindersSnapshot,
} from './reminders';

export type RemindersState =
  | { kind: 'loading' | 'requesting' | 'error' }
  | { kind: Exclude<RemindersAuthorization, 'authorized'> }
  | { kind: 'ready'; snapshot: RemindersSnapshot };

function failure(error: unknown): RemindersState {
  if (error instanceof RemindersError) {
    switch (error.code) {
      case 'unavailable':
      case 'denied':
      case 'restricted':
        return { kind: error.code };
      case 'not-authorized':
        return { kind: 'notDetermined' };
    }
  }
  return { kind: 'error' };
}

export function useReminders(service: RemindersService) {
  const [state, setState] = useState<RemindersState>({ kind: 'loading' });
  const actions = useRef({ refresh: () => {}, requestAccess: () => {} });

  useEffect(() => {
    let mounted = true;
    let active = AppState.currentState === 'active';
    let inFlight = false;
    let refreshPending = false;
    let generation = 0;
    let current: RemindersState = { kind: 'loading' };
    let timer: ReturnType<typeof setTimeout> | undefined;

    function clearTimer() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    }

    function publish(next: RemindersState) {
      if (mounted) {
        current = next;
        setState(next);
      }
    }

    async function load(requestPermission: boolean) {
      if (!mounted || !active || inFlight) {
        return;
      }
      inFlight = true;
      refreshPending = false;
      clearTimer();
      const version = ++generation;
      const isCurrent = () => mounted && active && version === generation;
      publish({ kind: requestPermission ? 'requesting' : 'loading' });
      try {
        const authorization = requestPermission
          ? await service.requestAccess()
          : await service.getAuthorizationStatus();
        if (!isCurrent()) {
          return;
        }
        if (authorization !== 'authorized') {
          publish({ kind: authorization });
          return;
        }
        publish({ kind: 'loading' });
        const snapshot = await service.fetchDueToday();
        if (!isCurrent()) {
          return;
        }
        // Freshness only, never reminder membership: the native reader supplies
        // the next local-day boundary (including DST). Fail closed if expired.
        const delay = snapshot.day.endsAt - Date.now();
        if (delay <= 0) {
          publish({ kind: 'error' });
          return;
        }
        publish({ kind: 'ready', snapshot });
        timer = setTimeout(refresh, Math.min(delay, 2_147_483_647));
      } catch (error) {
        if (isCurrent()) {
          publish(failure(error));
        }
      } finally {
        inFlight = false;
        if (mounted && active && refreshPending) {
          // Coalesce foreground events into one fresh read after the old call
          // settles. An obsolete permission action is never replayed here.
          load(false);
        }
      }
    }

    function refresh() {
      if (!mounted || !active) {
        return;
      }
      generation += 1;
      clearTimer();
      publish({ kind: 'loading' });
      if (inFlight) {
        refreshPending = true;
      } else {
        load(false);
      }
    }

    actions.current = {
      refresh,
      requestAccess: () => {
        if (current.kind === 'notDetermined' && !inFlight && active) {
          load(true);
        }
      },
    };

    const subscription = AppState.addEventListener('change', next => {
      const wasActive = active;
      active = next === 'active';
      if (!active) {
        generation += 1;
        clearTimer();
        // Do not retain visible content after authorization may have changed.
        publish({ kind: 'loading' });
      } else if (!wasActive) {
        refresh();
      }
    });
    refresh();
    return () => {
      mounted = false;
      generation += 1;
      refreshPending = false;
      clearTimer();
      subscription.remove();
      actions.current = { refresh: () => {}, requestAccess: () => {} };
    };
  }, [service]);

  return {
    state,
    refresh: () => actions.current.refresh(),
    requestAccess: () => actions.current.requestAccess(),
  };
}
