import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  CalendarError,
  type CalendarAuthorization,
  type CalendarService,
  type CalendarSnapshot,
} from './calendar';

export type CalendarState =
  | { kind: 'loading' | 'requesting' | 'error' }
  | { kind: Exclude<CalendarAuthorization, 'authorized'> }
  | { kind: 'ready'; snapshot: CalendarSnapshot; readAt: number };

function failure(error: unknown): CalendarState {
  if (error instanceof CalendarError) {
    switch (error.code) {
      case 'unavailable':
      case 'denied':
      case 'restricted':
        return { kind: error.code };
      case 'write-only':
        return { kind: 'writeOnly' };
      case 'not-authorized':
        return { kind: 'notDetermined' };
    }
  }
  return { kind: 'error' };
}

export function useCalendar(service: CalendarService) {
  const [state, setState] = useState<CalendarState>({ kind: 'loading' });
  const actions = useRef({ refresh: () => {}, requestAccess: () => {} });

  useEffect(() => {
    let mounted = true;
    let active = AppState.currentState === 'active';
    let inFlight = false;
    let refreshPending = false;
    let generation = 0;
    let current: CalendarState = { kind: 'loading' };
    let timer: ReturnType<typeof setTimeout> | undefined;

    function clearTimer() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    }

    function publish(next: CalendarState) {
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
        const snapshot = await service.fetchToday();
        if (!isCurrent()) {
          return;
        }
        // Freshness only, never event membership: the native reader supplies
        // the next local-day boundary (including DST). Fail closed if expired.
        const readAt = Date.now();
        const delay = snapshot.day.endsAt - readAt;
        if (delay <= 0 || snapshot.day.startsAt > readAt) {
          publish({ kind: 'error' });
          return;
        }
        publish({ kind: 'ready', snapshot, readAt });
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
        if (
          (current.kind === 'notDetermined' || current.kind === 'writeOnly') &&
          !inFlight &&
          active
        ) {
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
