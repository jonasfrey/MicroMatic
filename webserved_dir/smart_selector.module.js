// Smart selector: the parts that need no application around them.

// A long text keeps its beginning and its ending, the middle becomes "…".
// Names are often alike and differ at the end (Engstelsee 1, Engstelsee 2).
let f_s_text__short = function(s_text, n_len__max){
    // by characters, not by code units: an emoji or an accent must not be cut in half
    let a_s_char = Array.from(s_text);
    if(a_s_char.length <= n_len__max) return s_text;
    let n_len__end = Math.max(1, Math.floor((n_len__max - 1) / 3));
    let n_len__start = Math.max(1, n_len__max - 1 - n_len__end);
    return a_s_char.slice(0, n_len__start).join('').trimEnd() + '…' + a_s_char.slice(-n_len__end).join('').trimStart();
};

// by the text under s_key, a number inside it by its value: slide 2 comes before slide 10
let f_a_o_object__sorted = function(a_o_object, s_key){
    return a_o_object.slice().sort(function(o_object__a, o_object__b){
        return String(o_object__a[s_key]).localeCompare(String(o_object__b[s_key]), 'en', { numeric: true, sensitivity: 'base' })
            || o_object__a.n_id - o_object__b.n_id;
    });
};

// the list with one entry moved to another place; the given list stays as it is
let f_a_v__moved = function(a_v, n_idx__from, n_idx__to){
    let a_v__moved = a_v.slice();
    if(n_idx__from < 0 || n_idx__from >= a_v.length) return a_v__moved;
    let [v] = a_v__moved.splice(n_idx__from, 1);
    a_v__moved.splice(Math.min(Math.max(n_idx__to, 0), a_v__moved.length), 0, v);
    return a_v__moved;
};

// for the second line of a row: 2026-11-19 14:32, in the time of whoever reads it
let f_s_date_time = function(n_ts_ms){
    let o_date = new Date(n_ts_ms);
    let f_s_pad = function(n){ return String(n).padStart(2, '0'); };
    return o_date.getFullYear() + '-' + f_s_pad(o_date.getMonth() + 1) + '-' + f_s_pad(o_date.getDate())
        + ' ' + f_s_pad(o_date.getHours()) + ':' + f_s_pad(o_date.getMinutes());
};

export { f_s_text__short, f_a_o_object__sorted, f_a_v__moved, f_s_date_time };
