import type { SaveEntry, Settings } from './types';

export type Request =
  | { type: 'status'; host: string }
  | { type: 'save'; host: string; entries: SaveEntry[] }
  | { type: 'query'; keys: string[]; query: string; host: string }
  | { type: 'getAll' }
  | { type: 'deleteValue'; key: string; value: string }
  | { type: 'deleteField'; key: string }
  | { type: 'clearAll' }
  | { type: 'import'; data: unknown }
  | { type: 'setSettings'; patch: Partial<Settings> };

/** Send a message to the background worker; resolves undefined if the extension context is gone. */
export async function send<T = unknown>(req: Request): Promise<T | undefined> {
  try {
    return (await chrome.runtime.sendMessage(req)) as T;
  } catch {
    return undefined;
  }
}
