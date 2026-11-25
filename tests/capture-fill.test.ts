import { describe, expect, it, vi } from 'vitest';
import { collectEntries } from '../src/content/capture';
import { fillControl } from '../src/content/fill';

describe('collectEntries', () => {
  it('saves ordinary fields and never sensitive ones', () => {
    document.body.innerHTML = `
      <form>
        <input name="email" type="email" value="me@x.com">
        <input name="firstName" value="Ada">
        <input name="password" type="password" value="hunter2">
        <input name="card" autocomplete="cc-number" value="4111111111111111">
        <input name="notes_card" value="4111 1111 1111 1111">
        <input name="pin" value="1234">
        <input name="empty" value="">
        <input type="hidden" name="csrf" value="abc">
        <input name="disabled" value="nope" disabled>
        <select name="country"><option value="">Choose</option><option value="IN" selected>India</option></select>
        <textarea name="bio">line1\nline2</textarea>
      </form>`;
    const entries = collectEntries(document.querySelector('form')!, 'https://t.example');
    expect(entries.map((e) => e.value).sort()).toEqual(['Ada', 'India', 'me@x.com']);
  });
});

describe('fillControl', () => {
  it('uses the native setter and fires input + change that bubble', () => {
    document.body.innerHTML = '<input id="i">';
    const input = document.getElementById('i') as HTMLInputElement;
    const onInput = vi.fn();
    const onChange = vi.fn();
    document.body.addEventListener('input', onInput);
    document.body.addEventListener('change', onChange);
    expect(fillControl(input, 'hello')).toBe(true);
    expect(input.value).toBe('hello');
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('defeats a React-style value tracker', () => {
    document.body.innerHTML = '<input id="i">';
    const input = document.getElementById('i') as HTMLInputElement;
    let tracked = '';
    // Simulate React: shadow the value property on the instance and track writes made through it.
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.get!.call(input),
      set: (v) => {
        tracked = v;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v);
      },
    });
    let seen = '';
    input.addEventListener('input', () => (seen = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.get!.call(input)));
    fillControl(input, 'x');
    expect(tracked).toBe(''); // instance setter (the tracker) was bypassed, so React sees a change
    expect(seen).toBe('x');
  });

  it('selects an option by text or value, and reports no match', () => {
    document.body.innerHTML = '<select id="s"><option value="IN">India</option><option value="US">United States</option></select>';
    const sel = document.getElementById('s') as HTMLSelectElement;
    expect(fillControl(sel, 'united states')).toBe(true);
    expect(sel.value).toBe('US');
    expect(fillControl(sel, 'Atlantis')).toBe(false);
  });
});
