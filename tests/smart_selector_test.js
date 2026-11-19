// Smart selector: shortening of long values, the order of its list, moving an entry of a list, date and time of a row.
import assert from 'node:assert/strict';
import { f_s_text__short, f_a_o_object__sorted, f_a_v__moved, f_s_date_time } from '../webserved_dir/smart_selector.module.js';

Deno.test('a value that fits is shown as it is', () => {
    assert.equal(f_s_text__short('Engstelsee1', 16), 'Engstelsee1');
    assert.equal(f_s_text__short('exactly 16 chars', 16), 'exactly 16 chars');
    assert.equal(f_s_text__short('', 16), '');
});

Deno.test('a long value keeps its beginning and its ending', () => {
    let s_text = f_s_text__short('A very very very long name, why', 16);
    assert.equal(s_text, 'A very ver…, why');
    assert.equal(Array.from(s_text).length, 16);
    // the ending tells objects with the same beginning apart
    assert.notEqual(f_s_text__short('Engstelsee 2026-11-19 a', 16), f_s_text__short('Engstelsee 2026-11-19 b', 16));
    assert.equal(f_s_text__short('Engstelsee 2026-11-19 a', 16), 'Engstelsee…-19 a');
});

Deno.test('no space is left next to the dots, and no character is cut in half', () => {
    // the cut falls on spaces on both sides
    assert.equal(f_s_text__short('abcdefghi klmnopqrst uvwx', 16), 'abcdefghi…uvwx');
    let s_text = f_s_text__short('🔬🔬🔬🔬🔬🔬🔬🔬🔬🔬🔬🔬🔬🔬🔬🔬🔬🔬🔬🔬', 7);
    assert.deepEqual(Array.from(s_text), ['🔬', '🔬', '🔬', '🔬', '…', '🔬', '🔬']);
    // even a very short field shows a beginning and an ending
    assert.equal(f_s_text__short('ceratium', 3), 'c…m');
});

Deno.test('the list is ordered by the value, numbers by what they count', () => {
    let a_o_slide = [
        { n_id: 1, s_name: 'ceratium10' },
        { n_id: 2, s_name: 'Engstelsee1' },
        { n_id: 3, s_name: 'ceratium2' },
        { n_id: 4, s_name: 'Ceratium1' },
        { n_id: 6, s_name: 'ceratium2' },
        { n_id: 5, s_name: 'a slide' },
    ];
    assert.deepEqual(f_a_o_object__sorted(a_o_slide, 's_name').map(o => o.n_id), [5, 4, 3, 6, 1, 2]);
    // the given list stays as it is
    assert.equal(a_o_slide[0].n_id, 1);
    // a value that is no text is ordered all the same
    assert.deepEqual(f_a_o_object__sorted([{ n_id: 1, n: 10 }, { n_id: 2, n: 9 }], 'n').map(o => o.n_id), [2, 1]);
});

Deno.test('an entry of a list moves to another place, the others keep their order', () => {
    let a_s = ['a', 'b', 'c', 'd'];
    assert.deepEqual(f_a_v__moved(a_s, 0, 2), ['b', 'c', 'a', 'd']);
    assert.deepEqual(f_a_v__moved(a_s, 3, 0), ['d', 'a', 'b', 'c']);
    assert.deepEqual(f_a_v__moved(a_s, 1, 1), a_s);
    // a place beyond the list is its end; an entry that is not there moves nothing
    assert.deepEqual(f_a_v__moved(a_s, 0, 99), ['b', 'c', 'd', 'a']);
    assert.deepEqual(f_a_v__moved(a_s, -1, 2), a_s);
    assert.deepEqual(a_s, ['a', 'b', 'c', 'd']);
});

Deno.test('date and time of a row: short, with leading zeros, in the time of whoever reads it', () => {
    assert.equal(f_s_date_time(new Date(2026, 10, 19, 14, 32, 59).getTime()), '2026-11-19 14:32');
    assert.equal(f_s_date_time(new Date(2027, 0, 5, 7, 3, 0).getTime()), '2027-01-05 07:03');
});
