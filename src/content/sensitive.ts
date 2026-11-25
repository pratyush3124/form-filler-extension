export type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const TRACKED_INPUT_TYPES = new Set([
  'text', 'email', 'tel', 'url', 'number',
  'radio', 'checkbox',
  'date', 'time', 'datetime-local', 'month', 'week',
]);

const SENSITIVE_AUTOCOMPLETE = /(^|\s)(cc-[a-z-]+|one-time-code|current-password|new-password)(\s|$)/;

/** Whole tokens that mark a field as secret. Token-based so "pincode" (postal code) is not caught by "pin". */
const SENSITIVE_TOKENS = new Set([
  'password', 'passwd', 'pwd', 'passcode', 'passphrase', 'secret',
  'cvv', 'cvc', 'csc', 'cvn', 'otp', 'ssn', 'pin', 'mpin', 'iban',
  'aadhaar', 'aadhar', 'captcha', 'expiry', 'expiration',
]);

/** Substrings (checked on the tokens joined together) that mark a field as secret. */
const SENSITIVE_JOINED = [
  'cardnumber', 'cardno', 'cardnum', 'creditcard', 'debitcard', 'ccnum', 'ccnumber',
  'securitycode', 'socialsecurity', 'accountnumber', 'routingnumber', 'verificationcode',
  'authcode', 'twofactor', 'sortcode',
];

export function splitTokens(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !/^\d{3,}$/.test(t)); // drop long numeric noise from generated ids
}

/** Is this a control kind we ever read or fill (text-like inputs, textarea, select)? */
export function isSupportedControl(el: Element): el is FormControl {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return TRACKED_INPUT_TYPES.has(el.type);
  return false;
}

export function controlHints(el: FormControl, label: string): string[] {
  return [el.getAttribute('name'), el.id, label, el.getAttribute('placeholder'), el.getAttribute('aria-label')]
    .filter((x): x is string => !!x);
}

export function isSensitiveField(el: FormControl, label: string): boolean {
  if (el instanceof HTMLInputElement && el.type === 'password') return true;
  if (SENSITIVE_AUTOCOMPLETE.test((el.getAttribute('autocomplete') ?? '').toLowerCase())) return true;
  if (el.getAttribute('inputmode') === 'none') return false;
  for (const hint of controlHints(el, label)) {
    const tokens = splitTokens(hint);
    if (tokens.some((t) => SENSITIVE_TOKENS.has(t))) return true;
    const joined = tokens.join('');
    if (SENSITIVE_JOINED.some((s) => joined.includes(s))) return true;
  }
  return false;
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Defense in depth: never store a value that looks like a payment card number. */
export function looksLikeCardNumber(value: string): boolean {
  const digits = value.replace(/[\s-]/g, '');
  return /^\d{13,19}$/.test(digits) && luhnValid(digits);
}
