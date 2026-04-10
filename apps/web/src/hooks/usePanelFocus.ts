'use client';

import { useSyncExternalStore } from 'react';

type PanelId = 'chat' | 'actions';

let focused: PanelId = 'chat';
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return focused;
}

export function focusPanel(id: PanelId) {
  if (focused === id) return;
  focused = id;
  listeners.forEach((cb) => cb());
}

export function usePanelFocus(id: PanelId) {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    isFocused: current === id,
    focus: () => focusPanel(id),
  };
}
