import { describe, expect, it } from 'vitest';
import { mergeRecords, rankSuggestions, sanitizeFields, upsertValue } from '../src/shared/records';
import type { FieldRecord } from '../src/shared/types';

const rec = (key = 'g:email'): FieldRecord => ({ key, label: 'Email', values: [] });

describe('upsertValue', () => {
  it('dedupes by value and counts uses', () => {
    const r = rec();
    upsertValue(r, 'a@x.com', 'one.com', 1, 20);
    upsertValue(r, 'a@x.com', 'two.com', 2, 20);
    expect(r.values).toHaveLength(1);
    expect(r.values[0]).toMatchObject({ count: 2, lastUsed: 2, sites: ['one.com', 'two.com'] });
  });

  it('evicts least recently used beyond the cap', () => {
    const r = rec();
    ['a', 'b', 'c', 'd'].forEach((v, i) => upsertValue(r, v, 'h', i, 3));
    expect(r.values.map((v) => v.value).sort()).toEqual(['b', 'c', 'd']);
  });
});

describe('rankSuggestions', () => {
  const g = rec('g:email');
  upsertValue(g, 'work@acme.com', 'acme.com', 5, 20);
  upsertValue(g, 'me@home.com', 'home.com', 9, 20);
  upsertValue(g, 'me@home.com', 'home.com', 10, 20);

  it('returns everything for an empty query, most used first', () => {
    expect(rankSuggestions([g], '', 'other.com').map((s) => s.value)).toEqual(['me@home.com', 'work@acme.com']);
  });

  it('ranks values previously used on this site first', () => {
    expect(rankSuggestions([g], '', 'acme.com')[0]!.value).toBe('work@acme.com');
  });

  it('filters by substring, prefix matches first, and drops an exact match', () => {
    expect(rankSuggestions([g], 'ME@', 'x').map((s) => s.value)).toEqual(['me@home.com']);
    expect(rankSuggestions([g], 'me@home.com', 'x')).toEqual([]);
  });

  it('merges the same value across global and site records without double counting', () => {
    const s = rec('s:https://a.example|email');
    upsertValue(s, 'me@home.com', 'a.example', 11, 20);
    const out = rankSuggestions([s, g], '', 'a.example');
    expect(out.filter((x) => x.value === 'me@home.com')).toHaveLength(1);
  });
});

describe('import helpers', () => {
  it('sanitizeFields drops malformed entries', () => {
    const out = sanitizeFields({
      'g:email': { key: 'g:email', label: 'E', values: [{ value: 'a@b.c', count: 2, lastUsed: 1, sites: ['x'] }, { value: 5 }] },
      bad: { values: [] },
      'g:empty': { label: 'x', values: [] },
      'g:evil': 'nope',
    });
    expect(Object.keys(out)).toEqual(['g:email']);
    expect(out['g:email']!.values).toHaveLength(1);
  });

  it('mergeRecords unions values', () => {
    const a = rec();
    const b = rec();
    upsertValue(a, 'x', 's1', 1, 20);
    upsertValue(b, 'x', 's2', 5, 20);
    upsertValue(b, 'y', 's2', 5, 20);
    const m = mergeRecords(a, b);
    expect(m.values).toHaveLength(2);
    expect(m.values.find((v) => v.value === 'x')!.sites).toEqual(['s1', 's2']);
  });
});
