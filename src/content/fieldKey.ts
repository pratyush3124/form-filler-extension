import { describeGroup, isChoice } from './choice';
import { nearbyQuestionText, usable } from './labels';
import { splitTokens, type FormControl } from './sensitive';

export interface FieldDescriptor {
  /** Site-specific key first, then the shared (cross-site) key when we can derive one. */
  keys: string[];
  label: string;
}

/** Canonical (autocomplete-style) tokens for common field identities. */
const NAME_MAP: Record<string, string> = {
  email: 'email', emailaddress: 'email', mail: 'email', emailid: 'email',
  firstname: 'given-name', fname: 'given-name', givenname: 'given-name', forename: 'given-name',
  lastname: 'family-name', lname: 'family-name', surname: 'family-name', familyname: 'family-name',
  middlename: 'additional-name',
  fullname: 'name',
  phone: 'tel', telephone: 'tel', tel: 'tel', mobile: 'tel', mobilenumber: 'tel', phonenumber: 'tel',
  contactnumber: 'tel', cell: 'tel', cellphone: 'tel',
  address: 'address-line1', address1: 'address-line1', addressline1: 'address-line1',
  streetaddress: 'address-line1', street: 'address-line1', addr1: 'address-line1',
  address2: 'address-line2', addressline2: 'address-line2', apartment: 'address-line2',
  apt: 'address-line2', suite: 'address-line2', landmark: 'address-line2',
  city: 'address-level2', town: 'address-level2',
  state: 'address-level1', province: 'address-level1',
  zip: 'postal-code', zipcode: 'postal-code', postalcode: 'postal-code', postcode: 'postal-code',
  pincode: 'postal-code',
  country: 'country-name', countryname: 'country-name',
  company: 'organization', companyname: 'organization', organization: 'organization',
  organisation: 'organization', org: 'organization', employer: 'organization',
  username: 'username', userid: 'username',
  jobtitle: 'organization-title', designation: 'organization-title',
  gender: 'sex', sex: 'sex',
  birthday: 'bday', birthdate: 'bday', dob: 'bday', dateofbirth: 'bday',
};

const AUTOCOMPLETE_IGNORED = new Set(['on', 'off', 'shipping', 'billing', 'home', 'work', 'mobile', 'fax', 'pager']);

/** Words that only decorate a field's identity ("billing_first_name", "email_input"). */
const LEADING_NOISE = new Set([
  'billing', 'shipping', 'delivery', 'home', 'work', 'user', 'your', 'my', 'customer', 'contact', 'primary',
  'input', 'field', 'form', 'txt', 'text',
]);
const TRAILING_NOISE = new Set(['input', 'field', 'box', 'txt', 'text']);

/**
 * Exact match only (after stripping decoration). Looser matching, such as "any label ending in
 * 'name'", would put unrelated fields ("Company name", "Pet name") into the same bucket.
 */
function lookup(source: string): string | undefined {
  const tokens = splitTokens(source);
  while (tokens.length > 1 && LEADING_NOISE.has(tokens[0]!)) tokens.shift();
  while (tokens.length > 1 && TRAILING_NOISE.has(tokens[tokens.length - 1]!)) tokens.pop();
  return NAME_MAP[tokens.join('')];
}

/** True when an attribute carries no meaning ("", "f_17", "a", a hash, a generated id), so something else must identify the field. */
function isOpaque(source: string | null | undefined): boolean {
  const raw = (source ?? '').trim();
  if (/^(?=[a-z0-9_-]*\d)(?=[a-z0-9_-]*[a-z])[a-z0-9_-]{16,}$/i.test(raw)) return true; // long generated ids
  const tokens = splitTokens(raw).filter((t) => !/^\d+$/.test(t) && !LEADING_NOISE.has(t));
  if (!tokens.length) return true;
  return tokens.length === 1 && (tokens[0]!.length <= 2 || /^[a-f0-9]{8,}$/.test(tokens[0]!));
}

/**
 * The human-readable name of the field: its <label>, else aria-labelledby, else aria-label, else the
 * placeholder, else the question heading above it. Generic type descriptions are skipped. For radio
 * buttons and checkboxes this is the *question* the group answers, not the option's own text.
 */
export function getLabel(el: FormControl): string {
  if (isChoice(el)) return describeGroup(el).label;
  const labelledBy = (el.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
    .join(' ');
  return (
    usable(el.labels?.[0]?.textContent) ||
    usable(labelledBy) ||
    usable(el.getAttribute('aria-label')) ||
    usable(el.getAttribute('placeholder')) ||
    nearbyQuestionText(el)
  ).slice(0, 60);
}

/**
 * The cross-site identity of a field, or undefined when we aren't sure. Being unsure is fine: the
 * field then keeps only its per-site key, which can never mix in another field's values.
 */
function globalToken(el: FormControl, label: string): string | undefined {
  const ac = (el.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const acToken = ac.filter((t) => !AUTOCOMPLETE_IGNORED.has(t) && !t.startsWith('section-')).pop();
  if (acToken) return acToken;

  const name = el.getAttribute('name');
  const idOpaque = isChoice(el) || isOpaque(el.id); // each radio/checkbox option has its own id
  const fromAttrs = lookup(name ?? '') ?? (idOpaque ? undefined : lookup(el.id));
  const fromLabel = lookup(label);
  if (fromAttrs) return fromLabel && fromLabel !== fromAttrs ? undefined : fromAttrs; // conflict: don't guess
  if (fromLabel && isOpaque(name) && idOpaque) return fromLabel;

  // A bare type=email/tel with no meaningful name is still unambiguous.
  if (el instanceof HTMLInputElement && (el.type === 'email' || el.type === 'tel') && isOpaque(name) && idOpaque) {
    return el.type;
  }
  return undefined;
}

/** Derive storage keys for a control, or null if it has no usable identity. */
export function describeField(el: FormControl, origin: string = location.origin): FieldDescriptor | null {
  const label = getLabel(el);
  const name = el.getAttribute('name');
  const keys: string[] = [];

  // Site identity: a meaningful name/id, else what the user sees (label / question text).
  const ident =
    (!isOpaque(name) && splitTokens(name!).join('')) ||
    (!isChoice(el) && !isOpaque(el.id) && splitTokens(el.id).join('')) ||
    splitTokens(label).join('');
  if (ident) keys.push(`s:${origin}|${ident}`);

  const g = globalToken(el, label);
  if (g) keys.push(`g:${g}`);

  if (!keys.length) return null; // no trustworthy identity: neither save nor suggest
  return { keys, label: label || (!isOpaque(name) ? name! : '') || g || '' };
}
