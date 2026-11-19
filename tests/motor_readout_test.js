// Read-out of the motors in the top bar: when a key counts as pressed, what its cap shows, how a position is shown.
import assert from 'node:assert/strict';
import { f_b_chord__held, f_s_cap, f_s_step } from '../webserved_dir/motor_readout.module.js';

Deno.test('a key is pressed while its chord is down and no other modifier is', () => {
    assert.equal(f_b_chord__held(['W'], new Set(['W'])), true);
    assert.equal(f_b_chord__held(['W'], new Set(['W', 'A'])), true);
    assert.equal(f_b_chord__held(['W'], new Set(['A'])), false);
    assert.equal(f_b_chord__held(['W'], new Set()), false);
    // Ctrl+W is another command, not the jog key
    assert.equal(f_b_chord__held(['W'], new Set(['W', 'Ctrl'])), false);
    assert.equal(f_b_chord__held(['Shift', 'W'], new Set(['W', 'Shift'])), true);
    assert.equal(f_b_chord__held(['Shift', 'W'], new Set(['W'])), false);
    // an action without a key is never pressed
    assert.equal(f_b_chord__held([], new Set(['W'])), false);
});

Deno.test('the cap shows the key: a letter as it is, an arrow key as an arrow', () => {
    assert.equal(f_s_cap(['W']), 'W');
    assert.equal(f_s_cap(['ArrowLeft']), '←');
    assert.equal(f_s_cap(['Shift', 'ArrowUp']), 'Shift+↑');
    assert.equal(f_s_cap(['Space']), '␣');
});

Deno.test('a position is shown in whole steps, an unknown one as a dash', () => {
    assert.equal(f_s_step(722), '722');
    assert.equal(f_s_step(-1740.4), '-1740');
    assert.equal(f_s_step(0), '0');
    assert.equal(f_s_step(null), '—');
    assert.equal(f_s_step(undefined), '—');
    assert.equal(f_s_step(NaN), '—');
});
