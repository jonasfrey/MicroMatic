import { o_state, f_n_motor__axis } from './index.js';
import { o_actions, o_action_ui } from './o_actions.js';
import { f_s_key } from './actions.module.js';
import { f_b_chord__held, f_s_cap, f_s_step } from './motor_readout.module.js';

// Top bar: the keys that drive the motors, laid out as they lie on the
// keyboard and lit while they are pressed, and next to them where the three
// axes stand. For whoever sees the application for the first time.
// Draft: there is no drawing of it yet.
// The top bar only holds the place for it (#toolbar-motor), like for the part
// of the ML Training window.
//
//   Q W E      Q E   Z (focus)
//   A S D      W S   Y          A D   X          x 722  y 1740  z 659
//
// The caps show the keys the jog actions are bound to, so a changed keymap
// changes them too. A key lights up whenever it is pressed as a jog key; the
// caps are dimmed while the keys cannot move anything.

let A_S_KEY = ['q', 'w', 'e', 'a', 's', 'd'];
let A_S_AXIS = ['x', 'y', 'z'];

let o_component__motor_readout = {
    name: 'component-motor-readout',
    template: `
        <teleport to="#toolbar-motor" defer>
            <div class="motor-key-grid" :class="{ idle: s_reason__idle !== '' }" role="img" aria-label="Keys that drive the motors" :data-tooltip="s_tooltip__key">
                <span class="motor-key" v-for="s_key in a_s_key" :key="s_key" :class="{ pressed: o_b_pressed[s_key] }" :data-key="s_key">{{ o_s_cap[s_key] }}</span>
            </div>
            <div class="motor-position" role="group" aria-label="Position in steps"
                data-tooltip="Position · draft&#10;Steps of X, Y and Z relative to the last zero point. The motors have no homing.">
                <span v-for="o_axis in a_o_axis" :key="o_axis.s_axis" :data-axis="o_axis.s_axis"><b>{{ o_axis.s_axis }}</b>{{ o_axis.s_step }}</span>
            </div>
        </teleport>
    `,
    data: function() {
        return {
            o_action_ui: o_action_ui,
            a_s_key: A_S_KEY,
            // key of a jog action -> what its cap shows, and whether it is pressed
            o_s_cap: Object.fromEntries(A_S_KEY.map(function(s_key){ return [s_key, s_key.toUpperCase()]; })),
            o_b_pressed: Object.fromEntries(A_S_KEY.map(function(s_key){ return [s_key, false]; })),
        };
    },
    computed: {
        // why the keys move nothing right now; '' when they do
        s_reason__idle: function() {
            if(!o_state.b_connected__esp) return 'The microcontroller is not connected: the keys move nothing.';
            if(o_state.b_scanning) return 'A scan is running: the keys move nothing.';
            if(o_state.b_flashing) return 'The microcontroller is being flashed: the keys move nothing.';
            return '';
        },
        s_tooltip__key: function() {
            let o_s_cap = this.o_s_cap;
            let f_s_pair = function(s_key__a, s_key__b){ return [o_s_cap[s_key__a], o_s_cap[s_key__b]].filter(Boolean).join(' '); };
            return 'Keys that drive the motors · draft\n'
                + f_s_pair('a', 'd') + ': X · ' + f_s_pair('w', 's') + ': Y · ' + f_s_pair('q', 'e') + ': Z (focus). Hold a key to move, release it to stop.'
                + (this.s_reason__idle ? '\n' + this.s_reason__idle : '');
        },
        a_o_axis: function() {
            return A_S_AXIS.map(function(s_axis) {
                let n_motor = f_n_motor__axis(s_axis, true);
                let o_motor = n_motor === null ? null : o_state.a_o_motor[n_motor];
                return { s_axis, s_step: f_s_step(o_state.b_connected__esp && o_motor ? o_motor.n_position : null) };
            });
        },
    },
    methods: {
        // the chords of the keyboard a jog action is bound to
        f_a_a_s_key__chord: function(s_key) {
            let o_config = o_actions.f_config('motion.key.' + s_key);
            if(!o_config) return [[f_s_key(s_key)]];
            return o_config.bindings.filter(function(o_binding){ return o_binding.source === 'keyboard'; }).map(function(o_binding){ return o_binding.keys; });
        },
        f_refresh_cap: function() {
            for(let s_key of A_S_KEY){
                let a_a_s_key = this.f_a_a_s_key__chord(s_key);
                this.o_s_cap[s_key] = a_a_s_key.length ? f_s_cap(a_a_s_key[0]) : '';
            }
        },
        f_refresh_pressed: function() {
            for(let s_key of A_S_KEY){
                let o_key = this._o_key;
                this.o_b_pressed[s_key] = this.f_a_a_s_key__chord(s_key).some(function(a_s_key){ return f_b_chord__held(a_s_key, o_key); });
            }
        },
        // the same keys count as the action system counts them: not while a name is typed, not while its search is open
        f_on_key: function(o_evt) {
            if(o_evt.isComposing) return;
            let o_key = this._o_key;
            let s_key = f_s_key(o_evt.key);
            if(o_evt.type === 'keyup') o_key.delete(s_key);
            else o_key.add(s_key);
            for(let [s_key__modifier, b_down] of [['Ctrl', o_evt.ctrlKey], ['Alt', o_evt.altKey], ['Shift', o_evt.shiftKey], ['Meta', o_evt.metaKey]]){
                if(b_down) o_key.add(s_key__modifier);
                else o_key.delete(s_key__modifier);
            }
            let b_typing = o_evt.target instanceof Element && !!o_evt.target.closest('input, textarea, select, [contenteditable]');
            if(o_action_ui.open || (b_typing && !o_evt.ctrlKey && !o_evt.metaKey)) o_key.clear();
            this.f_refresh_pressed();
        },
        // a key released while the window was away never reports its release
        f_release: function() {
            this._o_key.clear();
            this.f_refresh_pressed();
        },
        f_on_visibility: function() {
            if(document.hidden) this.f_release();
        },
    },
    watch: {
        // the keymap is edited in the search of the action system
        'o_action_ui.open': function() {
            this.f_release();
            this.f_refresh_cap();
        },
    },
    created: function() {
        // the keys that are down, named as the action system names them
        this._o_key = new Set();
    },
    mounted: function() {
        // the jog actions and the stored keymap are there once every component is mounted
        this.$nextTick(this.f_refresh_cap);
        window.addEventListener('keydown', this.f_on_key, true);
        window.addEventListener('keyup', this.f_on_key, true);
        window.addEventListener('blur', this.f_release);
        document.addEventListener('visibilitychange', this.f_on_visibility);
    },
    beforeUnmount: function() {
        window.removeEventListener('keydown', this.f_on_key, true);
        window.removeEventListener('keyup', this.f_on_key, true);
        window.removeEventListener('blur', this.f_release);
        document.removeEventListener('visibilitychange', this.f_on_visibility);
    },
};

export { o_component__motor_readout };
