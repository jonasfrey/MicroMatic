import { o_component__icon } from './o_component__icon.js';
import { f_s_text__short, f_a_o_object__sorted } from './smart_selector.module.js';

// Smart selector, after the drawing 2026-11-19-pda_ui_smart_selector: a small
// create / read / update / delete for the objects of one kind, in one line.
//
//   [pictogram] value   [edit] [v] [+]
//
// value   the chosen object. a long value shows its beginning and its ending.
// edit    popup with the fields of the chosen object and "update"
// v       popup with all objects: thumbnail, pictogram or nothing, the full
//         value, below it a line with details where the kind has some, and
//         delete. a click chooses.
// +       popup with empty fields and "create". a kind that is not made of
//         fields (a file) says itself what "+" does.
//
// Each popup has a title line that says what it is for and a button to close
// it: without it a popup was not recognised as one (user test 2026-11-19).
//
// The element knows nothing about what the objects are: the objects, their
// fields and what create, update, delete and choose do are handed to it.

let N_PX__POPUP = 300;
let N_PX__POPUP__MAX = 700;
// with less room than this below the element the popup opens above it
let N_PX__POPUP__ROOM = 240;
let N_PX__GAP = 4;

// every element needs ids of its own for its fields
let n_cnt__selector = 0;

let o_component__smart_selector = {
    name: 'component-smart-selector',
    components: { ui_icon: o_component__icon },
    props: {
        // 'slide', 'dataset': names the buttons and the popups
        s_name__kind: { type: String, required: true },
        s_icon: { type: String, default: '' },
        // the objects to choose from, each with n_id. n_id: the chosen one, 0 for none
        a_o_object: { type: Array, required: true },
        n_id: { type: Number, default: 0 },
        // what an object is made of: [{ s_key, s_label, s_type, n_len__max, n_min, n_max, n_step }]
        // s_type 'text' (default) or 'number'. the first field is the value the element shows.
        a_o_field: { type: Array, required: true },
        // characters of the value the element shows
        n_len__max: { type: Number, default: 16 },
        // the tooltip below its first line
        s_tooltip: { type: String, default: '' },
        // no chosen object is something to act on
        b_warning: { type: Boolean, default: false },
        // (o_object) => address of its thumbnail, '' while there is none.
        // without it a row shows s_icon__option, without that nothing.
        f_s_url__thumbnail: { type: Function, default: null },
        s_icon__option: { type: String, default: '' },
        // (o_object) => what a row says below the value, '' for nothing
        f_s_detail: { type: Function, default: null },
        // (o_object): it was chosen from the list
        f_select: { type: Function, required: true },
        // async (o_value) => true when the object is created; o_value: { [s_key]: value }
        f_b_create: { type: Function, default: null },
        // (): what "+" does instead of opening the popup with empty fields. one of the two is needed.
        f_create: { type: Function, default: null },
        // the tooltip of "+" below its first line
        s_tooltip__create: { type: String, default: '' },
        // async (o_object, o_value) => true when the object is changed
        f_b_update: { type: Function, required: true },
        // (o_object); without it the rows have no delete
        f_delete: { type: Function, default: null },
        // called when the list opens
        f_refresh: { type: Function, default: null },
    },
    template: `
        <div ref="el_root" class="smart-selector" :class="{ warning: b_warning && !o_object, open: s_popup !== '' }" :data-tooltip="s_tooltip__value">
            <ui_icon v-if="s_icon" :s_name="s_icon" />
            <span class="smart-selector-value" :class="{ empty: !o_object }">{{ o_object ? s_value__short : 'no ' + s_name__kind }}</span>
            <button ref="el_button__update" type="button" class="smart-selector-button" data-control-skip @click="f_toggle('update')" :disabled="!o_object"
                :aria-label="'Edit ' + s_name__kind" aria-haspopup="dialog" :aria-expanded="s_popup === 'update'"
                :data-tooltip="'Edit this ' + s_name__kind"><ui_icon s_name="edit" /></button>
            <button ref="el_button__option" type="button" class="smart-selector-button" data-control-skip @click="f_toggle('option')" :disabled="!a_o_object.length"
                :aria-label="s_name__kind__capital + ' list'" aria-haspopup="listbox" :aria-expanded="s_popup === 'option'"
                :data-tooltip="'Choose another ' + s_name__kind"><ui_icon s_name="chevron" /></button>
            <button ref="el_button__create" type="button" class="smart-selector-button" data-control-skip @click="f_on_create"
                :aria-label="'New ' + s_name__kind" :aria-haspopup="f_create ? null : 'dialog'" :aria-expanded="f_create ? null : s_popup === 'create'"
                :data-tooltip="'New ' + s_name__kind + (s_tooltip__create ? '\\n' + s_tooltip__create : '')"><ui_icon s_name="plus" /></button>
            <teleport to="body">
                <div ref="el_popup" class="smart-selector-popup smart-selector-list" v-if="s_popup === 'option'" :style="o_style__popup">
                    <div class="smart-selector-title">
                        <ui_icon s_name="list" /><span>{{ s_title__popup }}</span>
                        <button type="button" class="smart-selector-close" data-control-skip @click="f_close_popup" aria-label="Close" data-tooltip="Close · Esc">&times;</button>
                    </div>
                    <div role="listbox" :aria-label="s_name__kind__capital + ' list'">
                    <div class="smart-selector-option" v-for="o_option in a_o_option" :key="o_option.o_object.n_id" role="option" tabindex="0"
                        :class="{ active: o_option.o_object.n_id === n_id }" :aria-selected="o_option.o_object.n_id === n_id"
                        @click="f_choose(o_option.o_object)" @keydown.enter.prevent="f_choose(o_option.o_object)" @keydown.space.prevent="f_choose(o_option.o_object)">
                        <span class="smart-selector-thumbnail" v-if="f_s_url__thumbnail">
                            <img v-if="o_option.s_url" :src="o_option.s_url" alt="" draggable="false" />
                        </span>
                        <span class="smart-selector-option-icon" v-else-if="s_icon__option"><ui_icon :s_name="s_icon__option" /></span>
                        <span class="smart-selector-option-text">
                            <span class="smart-selector-option-value">{{ o_option.s_value }}</span>
                            <span class="smart-selector-option-detail" v-if="o_option.s_detail">{{ o_option.s_detail }}</span>
                        </span>
                        <button type="button" class="cockpit-icon-button danger" v-if="f_delete" data-control-skip
                            @click.stop="f_delete(o_option.o_object)" @keydown.enter.stop @keydown.space.stop
                            :aria-label="'Delete ' + s_name__kind + ' ' + o_option.s_value" :data-tooltip="'Delete this ' + s_name__kind"><ui_icon s_name="trash" /></button>
                    </div>
                    </div>
                </div>
                <form ref="el_popup" class="smart-selector-popup smart-selector-form" v-else-if="s_popup !== ''" role="dialog"
                    :aria-label="s_title__popup" :style="o_style__popup" @submit.prevent="f_submit">
                    <div class="smart-selector-title">
                        <ui_icon :s_name="s_popup === 'create' ? 'plus' : 'edit'" /><span>{{ s_title__popup }}</span>
                        <button type="button" class="smart-selector-close" data-control-skip @click="f_close_popup" aria-label="Close" data-tooltip="Close · Esc">&times;</button>
                    </div>
                    <div class="cockpit-field" v-for="o_field in a_o_field" :key="o_field.s_key">
                        <label :for="s_id + o_field.s_key">{{ o_field.s_label }}</label>
                        <div class="smart-selector-number" v-if="o_field.s_type === 'number'">
                            <span class="cockpit-readout">{{ o_value[o_field.s_key] }}</span>
                            <input :id="s_id + o_field.s_key" type="range" data-control-skip :min="o_field.n_min" :max="o_field.n_max" :step="o_field.n_step"
                                v-model.number="o_value[o_field.s_key]" />
                        </div>
                        <input v-else :id="s_id + o_field.s_key" type="text" data-control-skip autocomplete="off" spellcheck="false"
                            :maxlength="o_field.n_len__max || 100" v-model="o_value[o_field.s_key]" />
                    </div>
                    <button class="btn-small" type="submit" data-control-skip :disabled="b_busy || !b_valid">{{ s_popup }}</button>
                </form>
            </teleport>
        </div>
    `,
    data: function() {
        return {
            // '' | 'option' | 'update' | 'create': the popup that is open
            s_popup: '',
            o_style__popup: {},
            // what the fields of the open popup hold
            o_value: {},
            b_busy: false,
            s_id: 'smart-selector-' + (++n_cnt__selector) + '-',
        };
    },
    computed: {
        s_name__kind__capital: function() {
            return this.s_name__kind.charAt(0).toUpperCase() + this.s_name__kind.slice(1);
        },
        o_object: function() {
            let n_id = this.n_id;
            return this.a_o_object.find(function(o_object){ return o_object.n_id === n_id; }) || null;
        },
        // the first field names an object
        s_key: function() {
            return this.a_o_field[0].s_key;
        },
        s_value: function() {
            return this.o_object ? String(this.o_object[this.s_key]) : '';
        },
        s_value__short: function() {
            return f_s_text__short(this.s_value, this.n_len__max);
        },
        s_tooltip__value: function() {
            let s_title = this.s_name__kind__capital + (this.o_object ? ' · ' + this.s_value : '');
            return this.s_tooltip ? s_title + '\n' + this.s_tooltip : s_title;
        },
        // only read while the list is open: that is when the thumbnails are asked for
        a_o_option: function() {
            let o_self = this;
            return f_a_o_object__sorted(o_self.a_o_object, o_self.s_key).map(function(o_object) {
                return {
                    o_object,
                    s_value: String(o_object[o_self.s_key]),
                    s_detail: o_self.f_s_detail ? o_self.f_s_detail(o_object) : '',
                    s_url: o_self.f_s_url__thumbnail ? o_self.f_s_url__thumbnail(o_object) : '',
                };
            });
        },
        b_valid: function() {
            return String(this.o_value[this.s_key] ?? '').trim() !== '';
        },
        // what the open popup is for, as its title line says it
        s_title__popup: function() {
            if(this.s_popup === 'option') return this.s_name__kind__capital + ' list';
            return (this.s_popup === 'create' ? 'New ' : 'Edit ') + this.s_name__kind;
        },
    },
    methods: {
        f_toggle: function(s_popup) {
            if(this.s_popup === s_popup) this.f_close();
            else this.f_open(s_popup);
        },
        f_on_create: function() {
            if(!this.f_create){
                this.f_toggle('create');
                return;
            }
            this.f_close();
            this.f_create();
        },
        f_open: function(s_popup) {
            let o_self = this;
            o_self.f_close();
            let o_rect = o_self.$refs['el_button__' + s_popup].getBoundingClientRect();
            let o_rect__root = o_self.$refs.el_root.getBoundingClientRect();
            let n_px__below = window.innerHeight - o_rect__root.bottom - 3 * N_PX__GAP;
            let n_px__above = o_rect__root.top - 3 * N_PX__GAP;
            // below the element, starting under its button as far as the window allows.
            // an element at the lower edge of the window opens its popup upwards.
            let b_above = n_px__below < N_PX__POPUP__ROOM && n_px__above > n_px__below;
            o_self.o_style__popup = {
                left: Math.max(N_PX__GAP, Math.min(o_rect.left, window.innerWidth - N_PX__POPUP - N_PX__GAP)) + 'px',
                width: N_PX__POPUP + 'px',
                maxHeight: Math.max(120, Math.min(N_PX__POPUP__MAX, b_above ? n_px__above : n_px__below)) + 'px',
            };
            if(b_above) o_self.o_style__popup.bottom = (window.innerHeight - o_rect__root.top + N_PX__GAP) + 'px';
            else o_self.o_style__popup.top = (o_rect__root.bottom + N_PX__GAP) + 'px';
            if(s_popup !== 'option'){
                let o_value = {};
                for(let o_field of o_self.a_o_field){
                    if(s_popup === 'update') o_value[o_field.s_key] = o_self.o_object[o_field.s_key];
                    else o_value[o_field.s_key] = o_field.s_type === 'number' ? (o_field.n_min ?? 0) : '';
                }
                o_self.o_value = o_value;
            }
            o_self.s_popup = s_popup;
            if(s_popup === 'option' && o_self.f_refresh) o_self.f_refresh();
            document.addEventListener('pointerdown', o_self.f_on_pointer, true);
            document.addEventListener('keydown', o_self.f_on_key, true);
            window.addEventListener('resize', o_self.f_close);
            o_self.$nextTick(function() {
                let el_popup = o_self.$refs.el_popup;
                if(!el_popup) return;
                if(s_popup === 'option'){
                    let el_active = el_popup.querySelector('.active');
                    if(el_active) el_active.scrollIntoView({ block: 'nearest' });
                    return;
                }
                let el_field = el_popup.querySelector('input');
                if(!el_field) return;
                el_field.focus();
                if(el_field.type === 'text') el_field.select();
            });
        },
        f_close: function() {
            if(this.s_popup === '') return;
            this.s_popup = '';
            document.removeEventListener('pointerdown', this.f_on_pointer, true);
            document.removeEventListener('keydown', this.f_on_key, true);
            window.removeEventListener('resize', this.f_close);
        },
        f_choose: function(o_object) {
            this.f_select(o_object);
            this.f_close();
            this.$refs.el_button__option.focus();
        },
        f_submit: async function() {
            let o_self = this;
            if(o_self.b_busy || !o_self.b_valid) return;
            let s_popup = o_self.s_popup;
            let o_value = {};
            let b_changed = false;
            for(let o_field of o_self.a_o_field){
                let v = o_self.o_value[o_field.s_key];
                o_value[o_field.s_key] = o_field.s_type === 'number' ? Number(v) : String(v).trim();
                if(s_popup === 'update' && o_value[o_field.s_key] !== o_self.o_object[o_field.s_key]) b_changed = true;
            }
            let b_done = true;
            if(s_popup === 'create' || b_changed){
                o_self.b_busy = true;
                try {
                    b_done = s_popup === 'create' ? await o_self.f_b_create(o_value) : await o_self.f_b_update(o_self.o_object, o_value);
                } finally {
                    o_self.b_busy = false;
                }
            }
            // a refused value keeps the popup open, so it can be corrected
            if(!b_done || o_self.s_popup !== s_popup) return;
            o_self.f_close();
            o_self.$refs['el_button__' + s_popup].focus();
        },
        // the close button of the title line: like Escape, the focus goes back to where the popup came from
        f_close_popup: function() {
            let s_popup = this.s_popup;
            this.f_close();
            if(s_popup !== '') this.$refs['el_button__' + s_popup].focus();
        },
        // a press anywhere else closes the popup
        f_on_pointer: function(o_evt) {
            let el_popup = this.$refs.el_popup;
            if(el_popup && el_popup.contains(o_evt.target)) return;
            if(this.$refs.el_root.contains(o_evt.target)) return;
            this.f_close();
        },
        // Escape closes the popup (and still reaches "stop all motors"); the arrow keys walk through the list
        f_on_key: function(o_evt) {
            if(o_evt.key === 'Escape'){
                let s_popup = this.s_popup;
                this.f_close();
                this.$refs['el_button__' + s_popup].focus();
                return;
            }
            if(this.s_popup !== 'option' || (o_evt.key !== 'ArrowDown' && o_evt.key !== 'ArrowUp')) return;
            let a_el = [...this.$refs.el_popup.querySelectorAll('.smart-selector-option')];
            if(!a_el.length) return;
            let n_idx = a_el.findIndex(function(el){ return el.contains(document.activeElement); });
            if(n_idx === -1) n_idx = Math.max(0, a_el.findIndex(function(el){ return el.classList.contains('active'); }));
            else n_idx += o_evt.key === 'ArrowDown' ? 1 : -1;
            a_el[Math.min(Math.max(n_idx, 0), a_el.length - 1)].focus();
            o_evt.preventDefault();
            o_evt.stopPropagation();
        },
    },
    watch: {
        // the last object was deleted from the open list
        'a_o_object.length': function(n_len) {
            if(n_len === 0 && this.s_popup === 'option') this.f_close();
        },
        // the chosen object went away while its popup was open
        o_object: function(o_object) {
            if(!o_object && this.s_popup === 'update') this.f_close();
        },
    },
    beforeUnmount: function() {
        this.f_close();
    },
};

export { o_component__smart_selector };
