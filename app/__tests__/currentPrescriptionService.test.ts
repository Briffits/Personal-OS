import {
  createCurrentPrescriptionService,
  type PrescriptionCandidateId,
  type PrescriptionId,
  type PrescriptionState,
} from '../src/prescriptions/currentPrescriptionService';

const oldId = 'old' as PrescriptionId;
const newId = 'new' as PrescriptionId;
const candidate = 'candidate' as PrescriptionCandidateId;

function setup(initial: PrescriptionId | null = oldId) {
  let state: PrescriptionState =
    initial === null
      ? { current: null, pendingCleanup: null }
      : { current: initial, pendingCleanup: null };
  const copies = new Set(initial === null ? [] : [initial]);
  const candidates = new Set<PrescriptionCandidateId>();
  const store = {
    read: jest.fn(async () => ({ ...state })),
    commit: jest.fn(async (_candidate: PrescriptionCandidateId) => {
      if (state.pendingCleanup !== null) {
        throw new Error('Pending cleanup');
      }
      copies.add(newId);
      state = { current: newId, pendingCleanup: state.current };
      return newId;
    }),
    cleanup: jest.fn(async () => {
      expect(state.current).toBe(newId);
      expect(copies.has(newId)).toBe(true);
      if (state.pendingCleanup !== null) {
        copies.delete(state.pendingCleanup);
        state = { current: state.current, pendingCleanup: null };
      }
    }),
  };
  const selector = {
    select: jest.fn(async (): Promise<PrescriptionCandidateId | null> => {
      candidates.add(candidate);
      return candidate;
    }),
    release: jest.fn(async (id: PrescriptionCandidateId) => {
      candidates.delete(id);
    }),
  };
  const viewer = { open: jest.fn(async (_id: PrescriptionId) => {}) };
  const confirmReplacement = jest.fn(async (_id: PrescriptionId) => true);
  const recreate = () =>
    createCurrentPrescriptionService({
      store,
      selector,
      viewer,
      confirmReplacement,
    });
  return {
    service: recreate(),
    recreate,
    store,
    selector,
    viewer,
    confirmReplacement,
    copies,
    candidates,
  };
}

test('initial import needs no confirmation and releases candidate', async () => {
  const { service, store, confirmReplacement, candidates, copies } =
    setup(null);
  expect(await service.getState()).toEqual({
    current: null,
    pendingCleanup: null,
  });
  expect(await service.importPrescription()).toEqual({
    status: 'saved',
    current: newId,
  });
  expect(store.commit).toHaveBeenCalledWith(candidate);
  expect(confirmReplacement).not.toHaveBeenCalled();
  expect(store.cleanup).not.toHaveBeenCalled();
  expect(candidates.size).toBe(0);
  expect([...copies]).toEqual([newId]);
});

test('selection cancellation preserves current and has no candidate to release', async () => {
  const { service, selector, store, confirmReplacement } = setup();
  selector.select.mockResolvedValue(null);
  expect(await service.importPrescription()).toEqual({
    status: 'cancelled',
    reason: 'selection',
  });
  expect(store.commit).not.toHaveBeenCalled();
  expect(confirmReplacement).not.toHaveBeenCalled();
  expect(selector.release).not.toHaveBeenCalled();
  expect((await service.getState()).current).toBe(oldId);
});

test('accepted confirmation commits before cleanup and releases candidate', async () => {
  const { service, store, confirmReplacement, copies, candidates } = setup();
  confirmReplacement.mockImplementation(async id => {
    expect(id).toBe(oldId);
    expect(store.commit).not.toHaveBeenCalled();
    return true;
  });
  expect(await service.importPrescription()).toEqual({
    status: 'saved',
    current: newId,
  });
  expect(confirmReplacement).toHaveBeenCalledTimes(1);
  expect(store.cleanup).toHaveBeenCalledTimes(1);
  expect([...copies]).toEqual([newId]);
  expect(candidates.size).toBe(0);
});

test('declined replacement releases candidate and preserves current', async () => {
  const { service, store, selector, confirmReplacement, copies, candidates } =
    setup();
  confirmReplacement.mockResolvedValue(false);
  expect(await service.importPrescription()).toEqual({
    status: 'cancelled',
    reason: 'confirmation',
  });
  expect(store.commit).not.toHaveBeenCalled();
  expect(store.cleanup).not.toHaveBeenCalled();
  expect(selector.release).toHaveBeenCalledWith(candidate);
  expect(candidates.size).toBe(0);
  expect([...copies]).toEqual([oldId]);
  expect((await service.getState()).current).toBe(oldId);
});

test.each([null, oldId])(
  'commit failure preserves current %p and releases candidate',
  async initial => {
    const { service, store, candidates } = setup(initial);
    const error = new Error('Commit failed');
    store.commit.mockRejectedValueOnce(error);
    expect(await service.importPrescription()).toEqual({
      status: 'failed',
      stage: 'commit',
      error,
    });
    expect(await service.getState()).toEqual({
      current: initial,
      pendingCleanup: null,
    });
    expect(store.cleanup).not.toHaveBeenCalled();
    expect(candidates.size).toBe(0);
  },
);

test('pending cleanup survives service recreation and blocks imports until retry succeeds', async () => {
  const fixture = setup();
  let service = fixture.service;
  fixture.store.cleanup.mockRejectedValueOnce(new Error('Removal failed'));
  expect(await service.importPrescription()).toEqual({
    status: 'cleanup-pending',
    current: newId,
  });
  expect(fixture.candidates.size).toBe(0);
  expect(fixture.copies.has(oldId)).toBe(true);
  service = fixture.recreate();
  expect(await service.getState()).toEqual({
    current: newId,
    pendingCleanup: oldId,
  });
  await expect(service.importPrescription()).rejects.toMatchObject({
    code: 'cleanup-pending',
  });
  expect(fixture.selector.select).toHaveBeenCalledTimes(1);
  expect(await service.viewPrescription()).toBe('opened');
  expect(fixture.viewer.open).toHaveBeenCalledWith(newId);
  expect(await service.retryCleanup()).toEqual({
    status: 'saved',
    current: newId,
  });
  expect(await fixture.recreate().getState()).toEqual({
    current: newId,
    pendingCleanup: null,
  });
  expect([...fixture.copies]).toEqual([newId]);
  expect(await service.retryCleanup()).toEqual({ status: 'nothing-to-clean' });
  fixture.selector.select.mockResolvedValueOnce(null);
  expect(await service.importPrescription()).toEqual({
    status: 'cancelled',
    reason: 'selection',
  });
});

test('confirmation errors release candidate and preserve current', async () => {
  const { service, confirmReplacement, candidates, store } = setup();
  const error = new Error('Confirmation failed');
  confirmReplacement.mockRejectedValueOnce(error);
  expect(await service.importPrescription()).toEqual({
    status: 'failed',
    stage: 'confirmation',
    error,
  });
  expect(candidates.size).toBe(0);
  expect(store.commit).not.toHaveBeenCalled();
  expect((await service.getState()).current).toBe(oldId);
});

test('selection error is reported and releases operation lock', async () => {
  const { service, selector } = setup();
  const error = new Error('Selection failed');
  selector.select.mockRejectedValueOnce(error);
  expect(await service.importPrescription()).toEqual({
    status: 'failed',
    stage: 'selection',
    error,
  });
  expect(selector.release).not.toHaveBeenCalled();
  expect((await service.getState()).current).toBe(oldId);
});

test('release failure preserves import outcome and allows explicit release retry', async () => {
  const { service, selector, candidates } = setup(null);
  const error = new Error('Release failed');
  selector.release.mockRejectedValueOnce(error);
  expect(await service.importPrescription()).toEqual({
    status: 'candidate-release-failed',
    candidate,
    outcome: { status: 'saved', current: newId },
    error,
  });
  expect(candidates.has(candidate)).toBe(true);
  await service.retryCandidateRelease(candidate);
  expect(candidates.size).toBe(0);
  expect((await service.getState()).current).toBe(newId);
});

test('view delegates current identifier and empty view does not open', async () => {
  const existing = setup();
  expect(await existing.service.viewPrescription()).toBe('opened');
  expect(existing.viewer.open).toHaveBeenCalledWith(oldId);
  const empty = setup(null);
  expect(await empty.service.viewPrescription()).toBe('empty');
  expect(empty.viewer.open).not.toHaveBeenCalled();
});

test('viewer failure propagates and releases the lock', async () => {
  const { service, viewer } = setup();
  viewer.open.mockRejectedValueOnce(new Error('Unavailable'));
  await expect(service.viewPrescription()).rejects.toThrow('Unavailable');
  expect(await service.viewPrescription()).toBe('opened');
});

test('overlapping operations are rejected while confirmation is pending', async () => {
  const { service, confirmReplacement, store } = setup();
  let respond!: (value: boolean) => void;
  let entered!: () => void;
  const waiting = new Promise<void>(resolve => {
    entered = resolve;
  });
  confirmReplacement.mockImplementation(
    () =>
      new Promise(resolve => {
        respond = resolve;
        entered();
      }),
  );
  const importing = service.importPrescription();
  await waiting;
  for (const operation of [
    service.importPrescription,
    service.viewPrescription,
    service.getState,
    service.retryCleanup,
  ]) {
    await expect(operation()).rejects.toMatchObject({ code: 'busy' });
  }
  expect(store.commit).not.toHaveBeenCalled();
  respond(false);
  await expect(importing).resolves.toEqual({
    status: 'cancelled',
    reason: 'confirmation',
  });
  expect((await service.getState()).current).toBe(oldId);
});
