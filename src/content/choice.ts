import { CHOICE_SEP } from '../shared/records';
import { clean, nearbyQuestionText, usable } from './labels';

/** Radio buttons and checkboxes. A *group* of them is one field whose value is the checked option label(s). */
export type Choice = HTMLInputElement;

export function isChoice(el: Element): el is Choice {
  return el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox');
}

const GROUP_SELECTOR = 'fieldset, [role="radiogroup"], [role="group"]';

/** The visible text of one option ("Male", "I agree"); '' if we can't tell. */
export function optionLabel(el: Choice): string {
  const by = (el.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
    .join(' ');
  const own = clean(el.labels?.[0]?.textContent) || clean(by) || clean(el.getAttribute('aria-label'));
  if (own) return own;
  return el.value && el.value !== 'on' ? clean(el.value) : '';
}

function accessibleName(group: Element): string {
  const legend = group instanceof HTMLFieldSetElement ? group.querySelector(':scope > legend') : null;
  const by = (group.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => group.ownerDocument.getElementById(id)?.textContent ?? '')
    .join(' ');
  return usable(legend?.textContent) || usable(by) || usable(group.getAttribute('aria-label'));
}

export interface ChoiceGroup {
  members: Choice[];
  /** The question this group answers, or the option's own text for a lone checkbox. */
  label: string;
  /** A single checkbox with no question around it ("I agree to the terms"): value is just "Checked". */
  standalone: boolean;
}

function membersOf(el: Choice, labelled: Element | null): Choice[] {
  const same = (i: HTMLInputElement) => i.type === el.type;
  if (el.name) {
    const scope = (el.form ?? el.getRootNode()) as ParentNode;
    const byName = [...scope.querySelectorAll<HTMLInputElement>('input')].filter(
      (i) => same(i) && i.name === el.name && (el.form ? i.form === el.form : !i.form),
    );
    if (byName.includes(el)) return byName;
  }
  if (labelled) {
    const inside = [...labelled.querySelectorAll<HTMLInputElement>('input')].filter(same);
    if (inside.includes(el)) return inside;
  }
  return [el];
}

export function describeGroup(el: Choice): ChoiceGroup {
  // Nearest enclosing fieldset / radiogroup / group that actually carries a question as its name.
  let labelled: Element | null = null;
  let name = '';
  for (let g = el.closest(GROUP_SELECTOR); g; g = g.parentElement?.closest(GROUP_SELECTOR) ?? null) {
    name = accessibleName(g);
    if (name) {
      labelled = g;
      break;
    }
  }
  const members = membersOf(el, labelled);
  const question = name || nearbyQuestionText(members[0] ?? el, members);
  if (question) return { members, label: question.slice(0, 60), standalone: false };
  if (members.length === 1 && el.type === 'checkbox') {
    return { members, label: optionLabel(el).slice(0, 60), standalone: true };
  }
  return { members, label: '', standalone: false };
}

/** Currently selected option(s) as one storable string, or null when nothing (or something unnamed) is checked. */
export function choiceValue(el: Choice): string | null {
  const g = describeGroup(el);
  const checked = g.members.filter((m) => m.checked);
  if (!checked.length) return null;
  if (g.standalone) return 'Checked';
  const labels = checked.map(optionLabel);
  return labels.every(Boolean) ? labels.join(CHOICE_SEP) : null;
}

const norm = (s: string) => s.trim().toLowerCase();

function wanted(value: string, g: ChoiceGroup): string[] | null {
  if (g.standalone) return value === 'Checked' ? [] : null;
  const labels = value.split(CHOICE_SEP);
  const have = new Set(g.members.map((m) => norm(optionLabel(m))));
  if (g.members[0]?.type === 'radio' && labels.length !== 1) return null;
  return labels.every((l) => have.has(norm(l))) ? labels : null;
}

/** Would `value` make sense for this group (every remembered option exists here)? */
export function canApply(el: Choice, value: string): boolean {
  return wanted(value, describeGroup(el)) !== null;
}

/** Check exactly the remembered option(s). Uses click() so page handlers and frameworks see a real interaction. */
export function applyChoice(el: Choice, value: string): boolean {
  const g = describeGroup(el);
  const labels = wanted(value, g);
  if (!labels) return false;
  if (g.standalone) {
    if (!el.checked && !el.disabled) el.click();
    return true;
  }
  const want = new Set(labels.map(norm));
  for (const m of g.members) {
    if (m.disabled) continue;
    const should = want.has(norm(optionLabel(m)));
    if (m.checked !== should) m.click();
  }
  return true;
}

/** Stable identity for a group (its first option), used to avoid saving the same selection twice. */
export function groupRepresentative(el: Choice): Choice {
  return describeGroup(el).members[0] ?? el;
}
