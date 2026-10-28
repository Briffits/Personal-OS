import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  HealthMedicationsError,
  type HealthMedication,
  type HealthMedicationsService,
} from '../native/NativeHealthMedications';

export type HealthState =
  | {
      kind:
        | 'loading'
        | 'requesting'
        | 'empty'
        | 'unavailable'
        | 'error'
        | 'waiting';
    }
  | { kind: 'ready'; rows: HealthMedication[] };

export function useHealthMedications(service: HealthMedicationsService) {
  const [state, setState] = useState<HealthState>({ kind: 'loading' });
  const [requestFailed, setRequestFailed] = useState(false);
  const commands = useRef({ refresh: () => {}, connect: () => {} });
  useEffect(() => {
    let mounted = true;
    let active = AppState.currentState === 'active';
    let generation = 0;
    let busy = false;
    let pending = false;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function run(request: boolean) {
      if (!mounted || !active) {
        return;
      }
      if (busy) {
        if (timedOut) {
          setState({ kind: 'waiting' });
        }
        if (!request) {
          pending = true;
        }
        return; // Never queue a prompt.
      }
      busy = true;
      timedOut = false;
      const current = ++generation;
      setState({ kind: request ? 'requesting' : 'loading' }); // Drop obsolete rows immediately.
      if (request) {
        setRequestFailed(false);
      }
      timer = setTimeout(() => {
        timedOut = true;
        if (mounted && active) {
          ++generation;
          setState({ kind: 'waiting' });
        }
        // This is only a UI deadline. Keep the operation gate until completion.
      }, 30000);
      try {
        if (request) {
          try {
            await service.requestAccess();
          } catch (error) {
            if (
              error instanceof HealthMedicationsError &&
              error.kind === 'unavailable'
            ) {
              throw error;
            }
            if (mounted) {
              setRequestFailed(true);
            }
          }
          // Refresh after every completed request, including cancellation/failure.
          // Never publish its Boolean as permission. Read only while foregrounded.
          if (!mounted || !active || current !== generation) {
            pending = true;
            return;
          }
          setState({ kind: 'loading' });
        }
        const rows = await service.read();
        if (mounted && active && current === generation) {
          setState(rows.length ? { kind: 'ready', rows } : { kind: 'empty' });
        }
      } catch (error) {
        if (mounted && active && current === generation) {
          setState({
            kind:
              error instanceof HealthMedicationsError &&
              error.kind === 'unavailable'
                ? 'unavailable'
                : 'error',
          });
        }
      } finally {
        clearTimeout(timer);
        busy = false;
        if (mounted && active && timedOut && !pending) {
          // The old response is obsolete, but the operation is no longer running.
          setState({ kind: 'error' });
        }
        if (mounted && active && pending) {
          pending = false;
          run(false);
        }
      }
    }
    commands.current = {
      refresh: () => {
        run(false);
      },
      connect: () => {
        run(true);
      },
    };
    const listener = AppState.addEventListener('change', next => {
      const wasActive = active;
      active = next === 'active';
      if (!active) {
        ++generation;
        setState({ kind: 'loading' });
        pending = true;
      } else if (!wasActive) {
        pending = false;
        run(false);
      }
    });
    run(false);
    return () => {
      mounted = false;
      ++generation;
      clearTimeout(timer);
      listener.remove();
    };
  }, [service]);
  return {
    state,
    requestFailed,
    refresh: () => commands.current.refresh(),
    connect: () => commands.current.connect(),
  };
}
