import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Wires the real background handler and the real content script together on top of an
 * in-memory fake of chrome.storage / chrome.runtime, then drives them with DOM events.
 */
const mem: Record<string, unknown> = {};
let backgroundListener!: (req: unknown, sender: unknown, respond: (r: unknown) => void) => boolean;

(globalThis as any).chrome = {
  storage: {
    local: {
      get: async (k: string) => ({ [k]: structuredClone(mem[k]) }),
      set: async (o: Record<string, unknown>) => void Object.assign(mem, structuredClone(o)),
    },
    onChanged: { addListener: () => {} },
  },
  runtime: {
    onMessage: { addListener: (fn: typeof backgroundListener) => (backgroundListener = fn) },
    sendMessage: (req: unknown) => new Promise((resolve) => backgroundListener(req, {}, resolve)),
  },
};

// jsdom has no layout engine, so it doesn't implement scrollIntoView.
Element.prototype.scrollIntoView = () => {};

const tick = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true }));

beforeAll(async () => {
  await import('../src/background/index');
  await import('../src/content/full');
  await tick(20);
});

describe('capture -> suggest -> fill', () => {
  it('never suggests one field\'s values in a different field', async () => {
    document.body.innerHTML = `
      <input id="co" name="company"><input id="alt" name="alt_email" type="email">
      <input id="pet" name="pet_name"><input id="fav" name="favorite_color">`;
    (document.getElementById('co') as HTMLInputElement).value = 'Zebra Corp';
    (document.getElementById('alt') as HTMLInputElement).value = 'alt@zebra.com';
    (document.getElementById('pet') as HTMLInputElement).value = 'Rex';
    (document.getElementById('fav') as HTMLInputElement).value = 'teal';
    document.body.dispatchEvent(new Event('focusout', { bubbles: true }));
    for (const id of ['co', 'alt', 'pet', 'fav']) {
      const el = document.getElementById(id) as HTMLInputElement;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await tick();

    // Fresh page: each empty field may only ever offer its own value.
    const expected: Record<string, string> = { co: 'Zebra Corp', alt: 'alt@zebra.com', pet: 'Rex', fav: 'teal' };
    document.body.innerHTML = `
      <input id="co" name="company"><input id="alt" name="alt_email" type="email">
      <input id="pet" name="pet_name"><input id="fav" name="favorite_color">
      <input id="other" name="shoe_size"><input id="mail" name="email" type="email">`;
    for (const [id, value] of Object.entries(expected)) {
      const el = document.getElementById(id) as HTMLInputElement;
      el.focus();
      await tick();
      key(el, 'ArrowDown');
      key(el, 'Enter');
      expect(el.value).toBe(value);
      el.blur();
    }
    for (const id of ['other', 'mail']) {
      const el = document.getElementById(id) as HTMLInputElement;
      el.focus();
      await tick();
      key(el, 'ArrowDown');
      key(el, 'Enter');
      // "mail" is a different field from alt_email / company: it only gets its own history (me@home.com).
      expect(['', 'me@home.com']).toContain(el.value);
      expect(Object.values(expected)).not.toContain(el.value);
      el.blur();
    }
  });

  it('saves a field as soon as typing finishes (blur), without any submit', async () => {
    document.body.innerHTML = '<input id="t" name="firstName"><input id="other">';
    const t = document.getElementById('t') as HTMLInputElement;
    t.focus();
    t.value = 'Grace';
    expect(JSON.stringify(mem.fields ?? {})).not.toContain('Grace'); // not on keystroke
    t.blur();
    await tick();
    const rec = (mem.fields as Record<string, { values: { value: string; count: number }[] }>)['g:given-name']!;
    expect(rec.values).toEqual([expect.objectContaining({ value: 'Grace', count: 1 })]);

    // Blur again with the same value, then submit-style save: still counted once.
    t.focus();
    t.blur();
    document.getElementById('other')!.click();
    await tick();
    expect(rec.values[0]!.count).toBe(1);
  });

  it('saves on submit, suggests on next focus, fills on keyboard pick, never stores secrets', async () => {
    document.body.innerHTML = `
      <form id="f">
        <input id="e" name="email" type="email">
        <input id="p" name="password" type="password">
        <input id="c" name="cardNumber">
      </form>`;
    const f = document.getElementById('f') as HTMLFormElement;
    const e = document.getElementById('e') as HTMLInputElement;
    e.value = 'me@home.com';
    (document.getElementById('p') as HTMLInputElement).value = 'hunter2';
    (document.getElementById('c') as HTMLInputElement).value = '4111 1111 1111 1111';
    f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();

    const stored = JSON.stringify(mem.fields);
    expect(stored).toContain('me@home.com');
    expect(stored).not.toContain('hunter2');
    expect(stored).not.toContain('4111');

    // "Next visit": fresh empty field with a different name but same identity (email).
    document.body.innerHTML = '<input id="e2" name="user_email" type="email">';
    const e2 = document.getElementById('e2') as HTMLInputElement;
    e2.focus();
    await tick();
    expect(document.querySelector('[data-form-filler]')).not.toBeNull();

    key(e2, 'ArrowDown');
    key(e2, 'Enter');
    expect(e2.value).toBe('me@home.com');
    expect(document.querySelector('[data-form-filler]')).toBeNull(); // dropdown closed after pick
  });

  it('captures SPA-style fields (no <form>, button click) and counts a submit+click once', async () => {
    document.body.innerHTML = '<input id="a" name="company"><button id="b" type="button">Save</button>';
    (document.getElementById('a') as HTMLInputElement).value = 'Acme Inc';
    document.getElementById('b')!.click();
    await tick();
    const fields = mem.fields as Record<string, { values: { value: string; count: number }[] }>;
    const rec = fields['g:organization']!;
    expect(rec.values.find((v) => v.value === 'Acme Inc')!.count).toBe(1);
  });

  it('shows nothing for sensitive fields and hides on blur', async () => {
    document.body.innerHTML = '<input id="pw" type="password"><input id="e3" name="email" type="email">';
    (document.getElementById('pw') as HTMLInputElement).focus();
    await tick();
    expect(document.querySelector('[data-form-filler]')).toBeNull();

    const e3 = document.getElementById('e3') as HTMLInputElement;
    e3.focus();
    await tick();
    expect(document.querySelector('[data-form-filler]')).not.toBeNull();
    // Moving focus away closes it. (Typing-to-filter is covered by rankSuggestions tests:
    // jsdom can't dispatch trusted input events, which the content script requires.)
    e3.blur();
    await tick(20);
    expect(document.querySelector('[data-form-filler]')).toBeNull();
  });

  it('radios: saved on change, then offered (only) while the group is unanswered', async () => {
    const html = `
      <fieldset><legend>Preferred contact</legend>
        <label><input type="radio" name="pc" id="a"> Email</label>
        <label><input type="radio" name="pc" id="b"> Phone</label>
      </fieldset>`;
    document.body.innerHTML = html;
    const b = document.getElementById('b') as HTMLInputElement;
    b.click(); // user picks "Phone": native click fires change
    await tick();
    expect(JSON.stringify(mem.fields)).toContain('Phone');

    document.body.innerHTML = html; // next visit, nothing chosen
    const a = document.getElementById('a') as HTMLInputElement;
    a.focus();
    await tick();
    expect(document.querySelector('[data-form-filler]')).not.toBeNull();
    a.click(); // user answers manually -> dropdown goes away
    await tick(20);
    expect(document.querySelector('[data-form-filler]')).toBeNull();
    a.blur();

    document.body.innerHTML = html.replace('name="pc" id="b"', 'name="pc" id="b" checked');
    (document.getElementById('a') as HTMLInputElement).focus();
    await tick();
    expect(document.querySelector('[data-form-filler]')).toBeNull(); // already answered: no nagging
  });

  it('keyboard: Alt+ArrowDown opens and highlights, Alt+1 / Enter pick (works on radios)', async () => {
    const html = `
      <fieldset><legend>Newsletter</legend>
        <label><input type="radio" name="nl" id="y"> Weekly</label>
        <label><input type="radio" name="nl" id="n"> Never</label>
      </fieldset>`;
    document.body.innerHTML = html;
    (document.getElementById('n') as HTMLInputElement).click();
    await tick();

    document.body.innerHTML = html;
    const y = document.getElementById('y') as HTMLInputElement;
    y.focus();
    await tick();
    const altKey = (k: string, code = '') =>
      y.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, altKey: true, bubbles: true, composed: true, cancelable: true }));
    key(y, 'ArrowDown'); // plain arrows are left to the radio group
    expect((document.getElementById('n') as HTMLInputElement).checked).toBe(false);
    altKey('ArrowDown'); // Alt+Down highlights the first suggestion
    key(y, 'Enter');
    expect((document.getElementById('n') as HTMLInputElement).checked).toBe(true);

    // Alt+1 picks directly
    document.body.innerHTML = html;
    const y2 = document.getElementById('y') as HTMLInputElement;
    y2.focus();
    await tick();
    y2.dispatchEvent(new KeyboardEvent('keydown', { key: '¡', code: 'Digit1', altKey: true, bubbles: true, composed: true, cancelable: true }));
    expect((document.getElementById('n') as HTMLInputElement).checked).toBe(true);
  });
});
