import { mergeRecords, rankSuggestions, sanitizeFields, upsertValue } from './records';
import {
  DEFAULT_SETTINGS,
  type ExportFile,
  type FieldMap,
  type SaveEntry,
  type Settings,
  type Suggestion,
} from './types';

/** Only the background worker should use this module: it serializes all writes. */
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn);
  queue = run.catch(() => undefined);
  return run;
}

export async function getFields(): Promise<FieldMap> {
  const { fields } = await chrome.storage.local.get('fields');
  return (fields as FieldMap | undefined) ?? {};
}

export async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
}

export async function isActiveOn(host: string): Promise<boolean> {
  const s = await getSettings();
  return s.enabled && !s.disabledSites.includes(host);
}

export function saveEntries(host: string, entries: SaveEntry[]): Promise<void> {
  return enqueue(async () => {
    const [fields, settings] = await Promise.all([getFields(), getSettings()]);
    const now = Date.now();
    for (const e of entries) {
      for (const key of e.keys) {
        const rec = (fields[key] ??= { key, label: e.label, values: [] });
        if (!rec.label) rec.label = e.label;
        upsertValue(rec, e.value, host, now, settings.maxValuesPerField);
      }
    }
    await chrome.storage.local.set({ fields });
  });
}

export async function querySuggestions(keys: string[], query: string, host: string): Promise<Suggestion[]> {
  const fields = await getFields();
  const records = keys.map((k) => fields[k]).filter((r) => !!r);
  return rankSuggestions(records, query, host);
}

export function deleteValue(key: string, value: string): Promise<void> {
  return enqueue(async () => {
    const fields = await getFields();
    const rec = fields[key];
    if (!rec) return;
    rec.values = rec.values.filter((v) => v.value !== value);
    if (!rec.values.length) delete fields[key];
    await chrome.storage.local.set({ fields });
  });
}

export function deleteField(key: string): Promise<void> {
  return enqueue(async () => {
    const fields = await getFields();
    delete fields[key];
    await chrome.storage.local.set({ fields });
  });
}

export function clearAll(): Promise<void> {
  return enqueue(() => chrome.storage.local.set({ fields: {} }));
}

export async function exportData(): Promise<ExportFile> {
  const [fields, settings] = await Promise.all([getFields(), getSettings()]);
  return { version: 1, exportedAt: Date.now(), fields, settings };
}

/** Merge an imported file into existing data. Returns number of fields touched. */
export function importData(data: unknown): Promise<number> {
  return enqueue(async () => {
    const incoming = sanitizeFields((data as Partial<ExportFile> | null)?.fields);
    const fields = await getFields();
    for (const [key, rec] of Object.entries(incoming)) {
      fields[key] = fields[key] ? mergeRecords(fields[key], rec) : rec;
    }
    await chrome.storage.local.set({ fields });
    return Object.keys(incoming).length;
  });
}

export function setSettings(patch: Partial<Settings>): Promise<Settings> {
  return enqueue(async () => {
    const next: Settings = { ...(await getSettings()), ...patch };
    next.maxValuesPerField = Math.min(100, Math.max(1, Math.floor(next.maxValuesPerField) || 20));
    next.disabledSites = [...new Set(next.disabledSites)];
    await chrome.storage.local.set({ settings: next });
    return next;
  });
}
