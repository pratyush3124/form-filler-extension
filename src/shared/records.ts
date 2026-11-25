import type { FieldMap, FieldRecord, Suggestion, StoredValue } from './types';

const MAX_SITES_PER_VALUE = 20;

/** Separates the options of a multi-select checkbox group inside one stored value. */
export const CHOICE_SEP = '\u001f';

/** Human-readable form of a stored value (multi-option values show as "A, B"). */
export function displayValue(v: string): string {
  return v.split(CHOICE_SEP).join(', ');
}

/** Add (or bump) a value in a record, evicting least-recently-used values beyond `max`. */
export function upsertValue(
  rec: FieldRecord,
  value: string,
  site: string,
  now: number,
  max: number,
): FieldRecord {
  const existing = rec.values.find((v) => v.value === value);
  if (existing) {
    existing.count += 1;
    existing.lastUsed = now;
    if (!existing.sites.includes(site)) existing.sites.push(site);
    if (existing.sites.length > MAX_SITES_PER_VALUE) existing.sites.shift();
  } else {
    rec.values.push({ value, count: 1, lastUsed: now, sites: [site] });
  }
  if (rec.values.length > max) {
    rec.values.sort((a, b) => b.lastUsed - a.lastUsed);
    rec.values.length = Math.max(1, max);
  }
  return rec;
}

/** Merge several records' values into ranked, de-duplicated suggestions for `query`. */
export function rankSuggestions(
  records: FieldRecord[],
  query: string,
  site: string,
  limit = 6,
): Suggestion[] {
  const q = query.trim().toLowerCase();
  const merged = new Map<string, Suggestion>();

  for (const rec of records) {
    const siteScoped = rec.key.startsWith('s:');
    for (const v of rec.values) {
      const lower = v.value.toLowerCase();
      if (q && (lower === q || !lower.includes(q))) continue;
      const fromSite = siteScoped || v.sites.includes(site);
      const prev = merged.get(v.value);
      if (prev) {
        prev.count = Math.max(prev.count, v.count);
        prev.lastUsed = Math.max(prev.lastUsed, v.lastUsed);
        prev.fromSite = prev.fromSite || fromSite;
      } else {
        merged.set(v.value, { value: v.value, count: v.count, lastUsed: v.lastUsed, fromSite });
      }
    }
  }

  const prefix = (s: Suggestion) => (q && s.value.toLowerCase().startsWith(q) ? 1 : 0);
  return [...merged.values()]
    .sort(
      (a, b) =>
        prefix(b) - prefix(a) ||
        Number(b.fromSite) - Number(a.fromSite) ||
        b.count - a.count ||
        b.lastUsed - a.lastUsed,
    )
    .slice(0, limit);
}

export function mergeRecords(a: FieldRecord, b: FieldRecord): FieldRecord {
  const out: FieldRecord = { key: a.key, label: a.label || b.label, values: a.values.map(cloneValue) };
  for (const v of b.values) {
    const hit = out.values.find((x) => x.value === v.value);
    if (hit) {
      hit.count = Math.max(hit.count, v.count);
      hit.lastUsed = Math.max(hit.lastUsed, v.lastUsed);
      for (const s of v.sites) if (!hit.sites.includes(s)) hit.sites.push(s);
    } else {
      out.values.push(cloneValue(v));
    }
  }
  return out;
}

function cloneValue(v: StoredValue): StoredValue {
  return { ...v, sites: [...v.sites] };
}

/** Validate untrusted (imported) data into a well-formed FieldMap; drops anything malformed. */
export function sanitizeFields(data: unknown): FieldMap {
  const out: FieldMap = {};
  if (!data || typeof data !== 'object') return out;
  for (const [key, raw] of Object.entries(data as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Partial<FieldRecord>;
    if (typeof key !== 'string' || !/^[gs]:/.test(key) || !Array.isArray(r.values)) continue;
    const values: StoredValue[] = [];
    for (const v of r.values) {
      if (!v || typeof v.value !== 'string' || !v.value || v.value.length > 500) continue;
      values.push({
        value: v.value,
        count: Number.isFinite(v.count) && v.count > 0 ? Math.floor(v.count) : 1,
        lastUsed: Number.isFinite(v.lastUsed) ? v.lastUsed : 0,
        sites: Array.isArray(v.sites) ? v.sites.filter((s) => typeof s === 'string').slice(0, MAX_SITES_PER_VALUE) : [],
      });
    }
    if (values.length) out[key] = { key, label: typeof r.label === 'string' ? r.label.slice(0, 80) : '', values };
  }
  return out;
}
