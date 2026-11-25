import { describe, expect, it } from 'vitest';
import { describeField } from '../src/content/fieldKey';
import type { FormControl } from '../src/content/sensitive';

const ORIGIN = 'https://a.example';
function d(html: string) {
  document.body.innerHTML = html;
  return describeField(document.body.querySelector('input, textarea, select') as FormControl, ORIGIN);
}

describe('describeField', () => {
  it('treats firstName / first_name / billing_first_name as the same global key', () => {
    const keys = ['firstName', 'first_name', 'billing_first_name'].map((n) => d(`<input name="${n}">`)!.keys);
    for (const k of keys) expect(k).toContain('g:given-name');
  });

  it('prefers the autocomplete attribute and ignores shipping/billing prefixes', () => {
    expect(d('<input name="x1" autocomplete="shipping postal-code">')!.keys).toContain('g:postal-code');
  });

  it('maps email by type even with an opaque name', () => {
    expect(d('<input type="email" name="f_17">')!.keys).toContain('g:email');
  });

  it('uses label text when attributes are opaque', () => {
    const r = d('<label for="a">Phone number *</label><input id="a">')!;
    expect(r.keys).toContain('g:tel');
    expect(r.label).toBe('Phone number');
  });

  it('gives unknown fields only a site-scoped key', () => {
    const r = d('<input name="favorite_color">')!;
    expect(r.keys).toEqual([`s:${ORIGIN}|favoritecolor`]);
  });

  it('does not mistake "company name" for a person name', () => {
    expect(d('<input name="company_name">')!.keys).toContain('g:organization');
  });

  it('returns null with no identity at all', () => {
    expect(d('<input>')).toBeNull();
  });

  describe('never groups different fields together', () => {
    const globals = (html: string) => d(html)!.keys.filter((k) => k.startsWith('g:'));

    it.each([
      ['<input name="name">', 'a bare "name" is ambiguous'],
      ['<label for="a">Pet name</label><input id="a" name="pet_name">', 'unrelated "...name" label'],
      ['<label for="a">Recipient name</label><input id="a" name="recipient">', 'label that only ends in name'],
      ['<label for="a">Email</label><input id="a" name="alt_email">', 'label says email, attribute says alt_email'],
      ['<input type="email" name="alt_email">', 'meaningful but unknown name beats the type'],
      ['<input name="login">', 'login is not a username'],
      ['<input name="favorite_color">', 'unknown field'],
    ])('%s -> no shared key (%s)', (html) => {
      expect(globals(html)).toEqual([]);
    });

    it('still shares clear matches across naming styles', () => {
      for (const html of [
        '<input name="email">',
        '<input name="user_email">',
        '<input name="emailAddress">',
        '<input id="email_input">',
        '<label for="a">Email address</label><input id="a">',
      ]) {
        expect(globals(html)).toEqual(['g:email']);
      }
    });

    it('does not share when label and attribute disagree', () => {
      expect(globals('<label for="a">Last name</label><input id="a" name="firstName">')).toEqual([]);
    });
  });

  describe('generic labels (form builders such as Microsoft Forms)', () => {
    it('ignores "Single line text" / "Enter your answer" so questions are not merged', () => {
      const a = d('<div><h3>Your favourite colour</h3><input aria-label="Single line text" placeholder="Enter your answer" id="r8f3a91c20d4b7e65"></div>')!;
      const b = d('<div><h3>Your pet\'s name</h3><input aria-label="Single line text" placeholder="Enter your answer" id="r1c0de77aa93b2f48"></div>')!;
      expect(a.label).toBe('Your favourite colour');
      expect(b.label).toBe('Your pet\'s name');
      expect(a.keys).not.toEqual(b.keys);
      expect(a.keys.join()).not.toContain('singlelinetext');
    });

    it('prefers the real question (aria-labelledby) over a generic aria-label', () => {
      const r = d('<span id="q1">Employee ID</span><input aria-label="Single line text" aria-labelledby="q1" id="x">')!;
      expect(r.label).toBe('Employee ID');
    });

    it('does not borrow a heading from a block that holds several fields', () => {
      document.body.innerHTML = '<section><h2>Survey</h2><input id="a" aria-label="Single line text"><input id="b" aria-label="Single line text"></section>';
      expect(describeField(document.getElementById('a') as FormControl, ORIGIN)).toBeNull();
    });

    it('gives up (no keys) when nothing identifies the field', () => {
      expect(d('<input aria-label="Single line text" placeholder="Enter your answer">')).toBeNull();
    });
  });
});
