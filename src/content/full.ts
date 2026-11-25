import { send } from '../shared/messages';
import type { Suggestion } from '../shared/types';
import { collectFresh, freshEntryFor } from './capture';
import { canApply, choiceValue, isChoice } from './choice';
import { describeField, getLabel } from './fieldKey';
import { fillControl } from './fill';
import { isSensitiveField, isSupportedControl, type FormControl } from './sensitive';
import { SuggestBox } from './suggest';

const host = location.hostname;
let active = false;
let filling = false;
let seq = 0;
let timer: number | undefined;

const box = new SuggestBox((value, el) => {
  filling = true; // our own input/change events must not re-open the dropdown
  try {
    fillControl(el, value);
  } finally {
    filling = false;
  }
});

async function refreshStatus(): Promise<void> {
  const res = await send<{ active: boolean }>({ type: 'status', host });
  active = !!res?.active;
  if (!active) box.hide();
}

/** The real target, even when the field lives inside an open shadow root. */
function targetOf(e: Event): FormControl | null {
  const el = (e.composedPath()[0] ?? e.target) as Element | null;
  if (!el || !isSupportedControl(el)) return null;
  if (el.disabled || (!(el instanceof HTMLSelectElement) && el.readOnly)) return null;
  if (isSensitiveField(el, getLabel(el))) return null;
  return el;
}

async function suggestFor(el: FormControl, highlightFirst = false): Promise<void> {
  if (!active || el instanceof HTMLSelectElement) return; // selects have their own native picker
  const desc = describeField(el);
  if (!desc) return;
  const choice = isChoice(el);
  if (choice && choiceValue(el) !== null) return box.hide(); // already answered: don't second-guess
  const mine = ++seq;
  const res = await send<{ suggestions: Suggestion[] }>({
    type: 'query',
    keys: desc.keys,
    query: choice ? '' : el.value, // choices aren't typed, so no text filtering
    host,
  });
  if (mine !== seq || document.activeElement === null) return; // stale or focus left
  let items = res?.suggestions ?? [];
  if (choice) items = items.filter((s) => canApply(el, s.value)); // only options that exist in this group
  // Arrow keys already mean something on radios/checkboxes/date pickers, so they need Alt+arrows.
  const plainArrows = !choice && !(el instanceof HTMLInputElement && el.type !== 'text' && /date|time|month|week|number/.test(el.type));
  box.show(el, items, desc.label, plainArrows, highlightFirst);
}

function save(root: ParentNode): void {
  if (!active) return;
  const entries = collectFresh(root);
  if (entries.length) void send({ type: 'save', host, entries });
}

/** Save one field as soon as the user is done with it: no submit needed. */
function saveControl(el: Element | null): void {
  if (!active || !el) return;
  const entry = freshEntryFor(el);
  if (entry) void send({ type: 'save', host, entries: [entry] });
}

// --- listeners (document-level delegation so dynamically added fields just work) ---

document.addEventListener(
  'focusin',
  (e) => {
    const el = targetOf(e);
    if (el) void suggestFor(el);
  },
  true,
);

document.addEventListener(
  'input',
  (e) => {
    if (filling || !e.isTrusted) return;
    const el = targetOf(e);
    if (!el || isChoice(el)) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void suggestFor(el), 80);
  },
  true,
);

document.addEventListener(
  'focusout',
  (e) => {
    seq++;
    box.hide();
    saveControl((e.composedPath()[0] ?? e.target) as Element | null); // user finished typing in this field
  },
  true,
);

// Selects (and anything committed without a blur) save when their value changes.
document.addEventListener(
  'change',
  (e) => {
    const el = (e.composedPath()[0] ?? e.target) as Element | null;
    if (el && isChoice(el)) box.hide(); // the user (or a suggestion) just answered it
    saveControl(el);
  },
  true,
);

// Closing or switching tabs while a field still has focus never fires blur: save it now.
const saveFocused = () => saveControl(deepActiveElement());
window.addEventListener('pagehide', saveFocused);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveFocused();
});

function deepActiveElement(): Element | null {
  let el: Element | null = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
}

document.addEventListener(
  'keydown',
  (e) => {
    if (box.current && targetOf(e) === box.current && box.handleKey(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    // Alt+↓ on a field with no dropdown open: (re)open its suggestions with the first one highlighted.
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowDown' && !box.current) {
      const el = targetOf(e);
      if (el && !(el instanceof HTMLSelectElement)) {
        e.preventDefault(); // (selects keep Alt+↓ for their native picker)
        void suggestFor(el, true);
        return;
      }
    }
    // Enter in a field that isn't inside a <form>: treat as a submission.
    const el = e.key === 'Enter' ? targetOf(e) : null;
    if (el && !(el instanceof HTMLTextAreaElement) && !el.form) {
      save(el.getRootNode() instanceof ShadowRoot ? (el.getRootNode() as ShadowRoot) : document);
    }
  },
  true,
);

// Normal form submissions.
document.addEventListener(
  'submit',
  (e) => {
    const form = e.target;
    if (form instanceof HTMLFormElement) save(form);
  },
  true,
);

// Many SPAs submit via a click handler without ever firing `submit`.
document.addEventListener(
  'click',
  (e) => {
    const t = (e.composedPath()[0] as Element | undefined)?.closest?.(
      'button, input[type=submit], input[type=button], [role=button]',
    );
    if (!t) return;
    const isSubmit =
      (t instanceof HTMLButtonElement && (t.type === 'submit' || !t.form)) ||
      (t instanceof HTMLInputElement && t.type === 'submit') ||
      t.getAttribute('role') === 'button';
    if (!isSubmit) return;
    const form = (t as HTMLButtonElement).form ?? t.closest('form');
    save(form ?? document);
  },
  true,
);

try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) void refreshStatus();
  });
} catch {
  /* extension context invalidated */
}

void refreshStatus();
