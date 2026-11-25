import { describe, expect, it } from 'vitest';
import { collectEntries } from '../src/content/capture';
import { applyChoice, canApply, choiceValue, describeGroup, type Choice } from '../src/content/choice';
import { describeField } from '../src/content/fieldKey';
import { fillControl } from '../src/content/fill';
import { CHOICE_SEP, displayValue } from '../src/shared/records';

const $ = (id: string) => document.getElementById(id) as Choice;
const ORIGIN = 'https://a.example';

const RADIOS = `
  <fieldset><legend>Gender</legend>
    <label><input type="radio" name="g" id="m" value="m"> Male</label>
    <label><input type="radio" name="g" id="f" value="f"> Female</label>
    <label><input type="radio" name="g" id="o" value="o"> Other</label>
  </fieldset>`;

const CHECKS = `
  <fieldset><legend>Hobbies</legend>
    <label><input type="checkbox" name="h" id="r" value="1"> Reading</label>
    <label><input type="checkbox" name="h" id="s" value="2"> Sports</label>
    <label><input type="checkbox" name="h" id="mu" value="3"> Music</label>
  </fieldset>`;

describe('radio groups', () => {
  it('are one field named after the question, valued by the chosen option label', () => {
    document.body.innerHTML = RADIOS;
    expect(describeGroup($('m')).label).toBe('Gender');
    expect(describeGroup($('m')).members).toHaveLength(3);
    expect(choiceValue($('m'))).toBeNull(); // nothing chosen yet
    $('f').checked = true;
    expect(choiceValue($('m'))).toBe('Female'); // same answer from any member
    expect(choiceValue($('o'))).toBe('Female');
  });

  it('use the same keys for every option (not one per option id)', () => {
    document.body.innerHTML = RADIOS;
    const a = describeField($('m'), ORIGIN)!;
    const b = describeField($('o'), ORIGIN)!;
    expect(a.keys).toEqual(b.keys);
    expect(a.keys).toContain(`s:${ORIGIN}|gender`); // name "g" is too short to mean anything, so the question text is used
    expect(a.keys).toContain('g:sex');
    expect(a.label).toBe('Gender');
  });

  it('applyChoice checks the remembered option and fires real events', () => {
    document.body.innerHTML = RADIOS;
    let changes = 0;
    document.body.addEventListener('change', () => changes++);
    expect(applyChoice($('m'), 'Other')).toBe(true);
    expect($('o').checked).toBe(true);
    expect(changes).toBe(1);
    expect(fillControl($('m'), 'male')).toBe(true); // case-insensitive, via fillControl
    expect($('m').checked).toBe(true);
    expect($('o').checked).toBe(false);
  });

  it('canApply is false for options this group does not have', () => {
    document.body.innerHTML = RADIOS;
    expect(canApply($('m'), 'Female')).toBe(true);
    expect(canApply($('m'), 'Prefer not to say')).toBe(false);
    expect(applyChoice($('m'), 'Prefer not to say')).toBe(false);
  });

  it('two groups on one page stay separate', () => {
    document.body.innerHTML = `
      <fieldset><legend>Size</legend><label><input type="radio" name="size" id="s1"> Small</label><label><input type="radio" name="size" id="s2"> Large</label></fieldset>
      <fieldset><legend>Colour</legend><label><input type="radio" name="col" id="c1"> Small</label><label><input type="radio" name="col" id="c2"> Red</label></fieldset>`;
    expect(describeGroup($('s1')).members.map((m) => m.id)).toEqual(['s1', 's2']);
    expect(describeField($('s1'), ORIGIN)!.keys).not.toEqual(describeField($('c1'), ORIGIN)!.keys);
  });
});

describe('checkbox groups', () => {
  it('store every checked option; applyChoice sets exactly that selection', () => {
    document.body.innerHTML = CHECKS;
    $('r').checked = true;
    $('mu').checked = true;
    expect(choiceValue($('s'))).toBe(['Reading', 'Music'].join(CHOICE_SEP));
    expect(displayValue(choiceValue($('s'))!)).toBe('Reading, Music');

    // a later visit: Sports + Music remembered, Reading is currently (wrongly) checked
    expect(applyChoice($('r'), ['Sports', 'Music'].join(CHOICE_SEP))).toBe(true);
    expect([$('r').checked, $('s').checked, $('mu').checked]).toEqual([false, true, true]);
  });

  it('a lone checkbox with no question is "Checked", named after its own label', () => {
    document.body.innerHTML = '<label><input type="checkbox" id="t" name="terms"> I agree to the terms</label>';
    expect(choiceValue($('t'))).toBeNull();
    $('t').checked = true;
    expect(choiceValue($('t'))).toBe('Checked');
    expect(describeField($('t'), ORIGIN)!.label).toBe('I agree to the terms');
    $('t').checked = false;
    applyChoice($('t'), 'Checked');
    expect($('t').checked).toBe(true);
  });

  it('works with aria groups and nameless inputs (custom form builders)', () => {
    document.body.innerHTML = `
      <div role="group" aria-labelledby="q">
        <span id="q">Which languages do you speak?</span>
        <label><input type="checkbox" id="en"> English</label>
        <label><input type="checkbox" id="hi"> Hindi</label>
      </div>`;
    const g = describeGroup($('en'));
    expect(g.label).toBe('Which languages do you speak?');
    expect(g.members).toHaveLength(2);
  });

  it('finds the question from a heading when there is no fieldset/aria group', () => {
    document.body.innerHTML = `
      <div><h3>Pick a plan</h3>
        <label><input type="radio" name="plan" id="p1"> Free</label>
        <label><input type="radio" name="plan" id="p2"> Pro</label>
      </div>`;
    expect(describeGroup($('p1')).label).toBe('Pick a plan');
  });
});

describe('capture', () => {
  it('collectEntries emits one entry per group, and skips unanswered ones', () => {
    document.body.innerHTML = `<form>${RADIOS}${CHECKS}<input type="date" name="dob" value="1999-04-02"><input type="time" name="meeting_time" value="09:30"></form>`;
    $('f').checked = true;
    $('r').checked = true;
    $('s').checked = true;
    const entries = collectEntries(document.querySelector('form')!, ORIGIN);
    expect(entries.map((e) => e.value).sort()).toEqual(
      ['09:30', '1999-04-02', 'Female', ['Reading', 'Sports'].join(CHOICE_SEP)].sort(),
    );
  });
});
