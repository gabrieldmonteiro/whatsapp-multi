import { describe, expect, it } from 'vitest';
import { initialState, reducer } from './reducer';
import type { Account, ViewInfo } from './types';

const acc = (id: string): Account => ({
  id, name: id, color: 'green', order: 0, createdAt: '2024-01-01T00:00:00.000Z', keepAlive: false, notifications: true,
});
const view = (id: string, state: ViewInfo['state'] = 'ready'): ViewInfo => ({ id, state, unread: null });

describe('reducer', () => {
  it('init loads accounts and views', () => {
    const s = reducer(initialState, { type: 'init', accounts: [acc('a')], views: [view('a')] });
    expect(s.loaded).toBe(true);
    expect(s.views['a']?.state).toBe('ready');
  });
  it('view event replaces one entry', () => {
    let s = reducer(initialState, { type: 'accounts', accounts: [acc('a')] });
    s = reducer(s, { type: 'view', info: view('a', 'error') });
    expect(s.views['a']?.state).toBe('error');
  });
  it('removing the active account clears active and prunes views', () => {
    let s = reducer(initialState, { type: 'accounts', accounts: [acc('a'), acc('b')] });
    s = reducer(s, { type: 'view', info: view('a') });
    s = reducer(s, { type: 'active', id: 'a' });
    s = reducer(s, { type: 'accounts', accounts: [acc('b')] });
    expect(s.activeId).toBeNull();
    expect(s.views['a']).toBeUndefined();
  });
  it('same active id keeps state reference', () => {
    const s = reducer(initialState, { type: 'active', id: 'x' });
    expect(reducer(s, { type: 'active', id: 'x' })).toBe(s);
  });
});
