/**
 * Entry point: loads capture + suggestions (./full) and keeps a console log of every field the
 * user leaves, including the storage keys we derived for it, to debug field identity.
 */
import './full';
import { choiceValue, isChoice } from './choice';
import { describeField, getLabel } from './fieldKey';
import { isSensitiveField, type FormControl } from './sensitive';

console.log('[Form Filler] content script loaded in', location.href, window === window.top ? '(top frame)' : '(iframe)');

document.addEventListener(
  'focusout',
  (e) => {
    // composedPath()[0] sees through open shadow roots to the real element
    const el = (e.composedPath()[0] ?? e.target) as Element | null;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;

    const label = getLabel(el as FormControl);
    const secret = isSensitiveField(el as FormControl, label);
    const value =
      el instanceof HTMLSelectElement
        ? (el.selectedOptions[0]?.text ?? '')
        : isChoice(el)
          ? (choiceValue(el) ?? '(nothing selected)')
          : el.value;

    console.log('[Form Filler] left field', {
      field: label || el.getAttribute('name') || el.id || el.getAttribute('aria-label') || '(unnamed)',
      label,
      name: el.getAttribute('name'),
      id: el.id,
      type: el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase(),
      keys: secret ? [] : describeField(el as FormControl)?.keys ?? '(no usable identity: not saved)',
      value: secret ? '[hidden: sensitive field]' : value,
    });
  },
  true,
);
