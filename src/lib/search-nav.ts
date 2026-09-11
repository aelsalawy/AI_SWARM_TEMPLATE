/**
 * Lightweight event bus for cross-component communication.
 * Used by global search to navigate to specific items.
 *
 * Usage:
 *   searchNav.emit({ type: 'task', id: 'abc123' })
 *   searchNav.subscribe((payload) => { ... })
 */

export interface SearchNavPayload {
  type: 'task' | 'run';
  id: string;
}

type Listener = (payload: SearchNavPayload) => void;

const listeners: Listener[] = [];

export const searchNav = {
  emit(payload: SearchNavPayload) {
    listeners.forEach((fn) => fn(payload));
  },
  subscribe(fn: Listener): () => void {
    listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  },
};
