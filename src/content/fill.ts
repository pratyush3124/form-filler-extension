import { applyChoice, isChoice } from './choice';
import type { FormControl } from './sensitive';

/**
 * Set a control's value so frameworks (React, Vue, Angular) notice it:
 * use the prototype's native setter (bypasses React's value tracker), then fire input + change.
 */
export function fillControl(el: FormControl, value: string): boolean {
  if (isChoice(el)) return applyChoice(el, value); // radios/checkboxes: click the remembered option(s)
  if (el instanceof HTMLSelectElement) {
    const want = value.trim().toLowerCase();
    const opt = [...el.options].find(
      (o) => o.text.trim().toLowerCase() === want || o.value.toLowerCase() === want,
    );
    if (!opt) return false;
    el.selectedIndex = opt.index;
  } else {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  }
  el.dispatchEvent(
    new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertReplacementText', data: value }),
  );
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
