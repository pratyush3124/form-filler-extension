import type { SaveEntry } from '../shared/types';
import { choiceValue, groupRepresentative, isChoice } from './choice';
import { describeField, getLabel } from './fieldKey';
import { isSensitiveField, isSupportedControl, looksLikeCardNumber, type FormControl } from './sensitive';

const MAX_INPUT_LEN = 200;

/** Current value of a control as a human-readable string, or null if it shouldn't be stored. */
export function readValue(el: FormControl): string | null {
  if (el instanceof HTMLSelectElement) {
    const opt = el.selectedOptions[0];
    if (!opt || opt.value === '' || opt.disabled) return null;
    return opt.text.trim() || null;
  }
  const v = el.value.trim();
  if (!v || v.length > MAX_INPUT_LEN || v.includes('\n')) return null;
  if (looksLikeCardNumber(v)) return null;
  return v;
}

/** The saveable entry for one control, or null if it is unsupported, sensitive, empty or opaque. */
export function entryFor(el: Element, origin: string = location.origin): SaveEntry | null {
  if (!isSupportedControl(el)) return null;
  if (el.disabled || (!(el instanceof HTMLSelectElement) && el.readOnly)) return null;
  if (isSensitiveField(el, getLabel(el))) return null;
  const value = isChoice(el) ? choiceValue(el) : readValue(el);
  if (value === null) return null;
  const desc = describeField(el, origin);
  return desc ? { keys: desc.keys, label: desc.label, value } : null;
}

/** Gather saveable entries from every supported, non-sensitive control under `root`. */
export function collectEntries(root: ParentNode, origin: string = location.origin): SaveEntry[] {
  const entries: SaveEntry[] = [];
  const seen = new Set<Element>();
  for (const el of root.querySelectorAll('input, textarea, select')) {
    const rep = savedKey(el);
    if (seen.has(rep)) continue; // a radio/checkbox group is one field, not one per option
    seen.add(rep);
    const e = entryFor(el, origin);
    if (e) entries.push(e);
  }
  return entries;
}

/** What we last saved for each element, so blur + submit + click don't count one entry three times. */
const saved = new WeakMap<Element, string>();

/** Radio/checkbox groups are tracked as one unit, via their first member. */
function savedKey(el: Element): Element {
  return isChoice(el) ? groupRepresentative(el) : el;
}

/** Entries under `root` that changed since we last saved them; marks them as saved. */
export function collectFresh(root: ParentNode): SaveEntry[] {
  const out: SaveEntry[] = [];
  for (const el of root.querySelectorAll('input, textarea, select')) {
    const e = entryFor(el);
    const k = savedKey(el);
    if (e && saved.get(k) !== e.value) {
      saved.set(k, e.value);
      out.push(e);
    }
  }
  return out;
}

/** Same as collectFresh, for a single control (used when the user finishes typing in it). */
export function freshEntryFor(el: Element): SaveEntry | null {
  const e = entryFor(el);
  const k = savedKey(el);
  if (!e || saved.get(k) === e.value) return null;
  saved.set(k, e.value);
  return e;
}
