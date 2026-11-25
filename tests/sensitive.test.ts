import { describe, expect, it } from 'vitest';
import { isSensitiveField, looksLikeCardNumber, splitTokens, type FormControl } from '../src/content/sensitive';

function field(html: string): FormControl {
  document.body.innerHTML = html;
  return document.body.firstElementChild as FormControl;
}

describe('isSensitiveField', () => {
  it.each([
    '<input type="password" name="x">',
    '<input name="cardNumber">',
    '<input name="card_number">',
    '<input name="cvv">',
    '<input name="otp">',
    '<input autocomplete="cc-number" name="n">',
    '<input autocomplete="one-time-code" name="n">',
    '<input placeholder="Social Security Number" name="x">',
    '<input name="pin">',
    '<input name="user_pwd">',
  ])('flags %s', (html) => {
    expect(isSensitiveField(field(html), '')).toBe(true);
  });

  it.each([
    '<input name="email" type="email">',
    '<input name="firstName">',
    '<input name="pincode">', // Indian postal code, not a PIN
    '<input name="cc" placeholder="CC recipients">',
    '<input name="passport_country">',
    '<input name="address1">',
  ])('allows %s', (html) => {
    expect(isSensitiveField(field(html), '')).toBe(false);
  });

  it('uses the label text too', () => {
    expect(isSensitiveField(field('<input name="f1">'), 'Card number')).toBe(true);
  });
});

describe('looksLikeCardNumber', () => {
  it('detects Luhn-valid numbers', () => {
    expect(looksLikeCardNumber('4111 1111 1111 1111')).toBe(true);
    expect(looksLikeCardNumber('4111-1111-1111-1111')).toBe(true);
  });
  it('ignores other numbers', () => {
    expect(looksLikeCardNumber('4111 1111 1111 1112')).toBe(false);
    expect(looksLikeCardNumber('9876543210')).toBe(false);
  });
});

describe('splitTokens', () => {
  it('splits camel, snake and kebab case and drops long numeric noise', () => {
    expect(splitTokens('billingFirst_name-2')).toEqual(['billing', 'first', 'name', '2']);
    expect(splitTokens('input_48291_email')).toEqual(['input', 'email']);
  });
});
