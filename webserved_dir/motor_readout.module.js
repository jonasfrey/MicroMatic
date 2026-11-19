// Read-out of the motors in the top bar: the parts that need no application around them.

let A_S_KEY__MODIFIER = ['Ctrl', 'Alt', 'Shift', 'Meta'];

// true while every key of the chord is down and no modifier is down that is not part of it:
// the rule of the action system (actions.module.js), which names the keys the same way.
// a_s_key: the keys of the chord. o_key: Set of the keys that are down.
let f_b_chord__held = function(a_s_key, o_key){
    return a_s_key.length > 0
        && a_s_key.every(function(s_key){ return o_key.has(s_key); })
        && A_S_KEY__MODIFIER.every(function(s_key){ return !o_key.has(s_key) || a_s_key.includes(s_key); });
};

let O_S_CAP = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: '␣' };

// what the cap of a key shows for a chord: a letter as it is, an arrow key as an arrow
let f_s_cap = function(a_s_key){
    return a_s_key.map(function(s_key){ return O_S_CAP[s_key] || s_key; }).join('+');
};

// the position of an axis as the read-out shows it; "—" while it is not known
let f_s_step = function(n_position){
    return Number.isFinite(n_position) ? String(Math.round(n_position)) : '—';
};

export { f_b_chord__held, f_s_cap, f_s_step };
