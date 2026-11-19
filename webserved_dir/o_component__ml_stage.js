import { o_state } from './index.js';
import { o_component__icon } from './o_component__icon.js';
import { o_ml, f_o_class, f_o_dataset__current, f_bbox_changed } from './o_ml.module.js';
import { f_o_camera_geometry, f_o_video_rect } from './camera_frame.module.js';
import {
    f_n_clamp,
    f_o_bbox__from_corner,
    f_o_edge,
    f_o_bbox__moved,
    f_o_bbox__resized,
    f_s_hit,
    f_b_bbox__large_enough,
} from './ml_bbox.module.js';

// The image with its bounding boxes, after the drawing
// 2026-11-19-pda_ui_ml_training_box_edit. While the ML Training window is
// docked it lies exactly on the live image: boxes are drawn on what the camera
// shows, and "capture" stores them with the camera image. A stored image opened
// from the image list is shown in the same place.
//
// drag on the image        draw a box in the active class; it may begin inside another box
// click on the label       the box goes into edit mode: drag inside moves it, a corner resizes it.
//                          dashed lines continue its four edges across the whole stage, so an
//                          edge can be laid against what it has to touch.
// click outside the box    its edit mode ends
// trash next to the label  delete the box
// 1-9                      the active class, and the class of the box in edit mode
// Delete / Backspace       delete the box in edit mode
// Escape                   abort the drag, end the edit mode
//
// Two dashed lines follow the cursor in the colour of the active class, with
// its key and name next to them: what the next box will be.
// The label of a box is see-through writing while the box is left alone, so it
// hides nothing of the image; under the pointer and in edit mode it is solid.

// how close to a corner a press still grabs the corner, in screen pixels
let N_PX__HANDLE = 9;
let N_PX__FONT = 13;

let o_component__ml_stage = {
    name: 'component-ml-stage',
    components: { ui_icon: o_component__icon },
    template: `
        <teleport to="body">
            <div ref="el_stage" class="ml-stage" :class="{ 'ml-stage--live': !o_ml.b_still }" v-if="b_stage"
                @pointerdown="f_on_down" @pointermove="f_on_hover" @pointerleave="f_on_leave" @contextmenu.prevent>
                <img class="ml-still" v-if="o_ml.b_still" :src="o_ml.s_url__still" alt="" draggable="false" />
                <div ref="el_view" class="ml-view" :class="'ml-view--' + s_cursor" :style="o_style__view" role="group" aria-label="Image with bounding boxes">
                    <svg class="ml-svg" :viewBox="'0 0 ' + n_scl_x + ' ' + n_scl_y" preserveAspectRatio="none" aria-hidden="true">
                        <g v-if="o_ml.b_prediction">
                            <g v-for="(o_prediction, n_idx) in o_ml.a_o_prediction" :key="'prediction' + n_idx" class="ml-prediction" :style="{ color: f_s_color__prediction(o_prediction) }">
                                <rect v-bind="f_o_rect(o_prediction)" />
                                <text v-bind="f_o_label(o_prediction)">{{ o_prediction.s_name__class }} {{ Math.round(o_prediction.n_confidence * 100) }}%</text>
                            </g>
                        </g>
                        <g class="ml-guide" v-if="o_guide" :style="{ color: o_guide.s_color }">
                            <line v-for="(n_y, n_idx) in o_guide.a_n_y" :key="'y' + n_idx" :x1="-o_guide.n_far" :x2="n_scl_x + o_guide.n_far" :y1="n_y" :y2="n_y" />
                            <line v-for="(n_x, n_idx) in o_guide.a_n_x" :key="'x' + n_idx" :y1="-o_guide.n_far" :y2="n_scl_y + o_guide.n_far" :x1="n_x" :x2="n_x" />
                        </g>
                        <rect v-for="(o_bbox, n_idx) in o_ml.a_o_bbox" :key="'bbox' + n_idx" class="ml-bbox" :class="{ edit: n_idx === o_ml.n_idx__bbox__selected }"
                            :style="{ color: f_s_color(o_bbox) }" v-bind="f_o_rect(o_bbox)" />
                        <rect v-if="o_bbox__draft" class="ml-bbox-draft" v-bind="f_o_rect(o_bbox__draft)" :style="{ color: s_color__active }" />
                        <g class="ml-crosshair" v-if="o_point__cursor" :style="{ color: s_color__active }">
                            <line x1="0" :x2="n_scl_x" :y1="o_point__cursor.n_y * n_scl_y" :y2="o_point__cursor.n_y * n_scl_y" />
                            <line y1="0" :y2="n_scl_y" :x1="o_point__cursor.n_x * n_scl_x" :x2="o_point__cursor.n_x * n_scl_x" />
                        </g>
                        <rect v-for="o_handle in a_o_handle" :key="o_handle.s_corner" class="ml-handle" v-bind="o_handle.o_rect" />
                    </svg>
                    <div class="ml-bbox-tag" v-for="(o_bbox, n_idx) in o_ml.a_o_bbox" :key="'tag' + n_idx"
                        :class="{ edit: n_idx === o_ml.n_idx__bbox__selected }" :style="f_o_style__tag(o_bbox)">
                        <button type="button" class="ml-bbox-label" data-control-skip @pointerdown.stop @click="f_edit(n_idx)"
                            :aria-label="'Edit box ' + (n_idx + 1)" :aria-pressed="n_idx === o_ml.n_idx__bbox__selected"
                            data-tooltip="Edit this box&#10;Drag it to move it, drag a corner to resize it. A click outside the box ends the edit mode."
                            ><span class="ml-class-key" v-if="f_s_key(o_bbox.n_o_class_n_id)">{{ f_s_key(o_bbox.n_o_class_n_id) }}</span>{{ f_s_name(o_bbox) }}</button>
                        <button type="button" class="ml-bbox-delete" data-control-skip @pointerdown.stop @click="f_delete(n_idx)"
                            :aria-label="'Delete box ' + (n_idx + 1)" data-tooltip="Delete this box"><ui_icon s_name="trash" /></button>
                    </div>
                    <div class="ml-cursor-label" v-if="o_point__cursor && o_class__active" :style="o_style__cursor"
                        ><span class="ml-class-key" v-if="f_s_key(o_class__active.n_id)">{{ f_s_key(o_class__active.n_id) }}</span>{{ o_class__active.s_name }}</div>
                </div>
            </div>
        </teleport>
    `,
    data: function() {
        return {
            o_state: o_state,
            o_ml: o_ml,
            // pixels of the camera image, as far as the live image is concerned
            n_scl_x__camera: 0,
            n_scl_y__camera: 0,
            // where the image lies inside the stage: { n_x, n_y, n_scl_x, n_scl_y } in screen pixels
            o_rect__view: null,
            // { s_mode: 'draw' | 'move' | 'resize', n_idx, s_corner, o_point__start, o_bbox__start, b_changed }
            o_drag: null,
            o_bbox__draft: null,
            // 'draw' | 'move' | 'nwse' | 'nesw' | 'label': what a press would do
            s_cursor: 'draw',
            // where the two lines cross, normalised by the image; null while no box would be drawn
            o_point__cursor: null,
        };
    },
    computed: {
        // the stage is there for a still image, and for the live image as soon as boxes can be drawn on it
        b_stage: function() {
            if(!o_state.o_panel_visibility.ml_training) return false;
            return o_ml.b_still || (!!o_ml.o_person && !!f_o_dataset__current() && o_state.b_streaming__webcam);
        },
        n_scl_x: function() {
            return o_ml.b_still ? o_ml.n_scl_x__still : this.n_scl_x__camera;
        },
        n_scl_y: function() {
            return o_ml.b_still ? o_ml.n_scl_y__still : this.n_scl_y__camera;
        },
        o_style__view: function() {
            let o_rect = this.o_rect__view;
            if(!o_rect) return { display: 'none' };
            return { left: o_rect.n_x + 'px', top: o_rect.n_y + 'px', width: o_rect.n_scl_x + 'px', height: o_rect.n_scl_y + 'px' };
        },
        // image pixels per screen pixel: keeps labels and handles the same size on screen
        n_scl__px: function() {
            return this.o_rect__view ? this.n_scl_x / this.o_rect__view.n_scl_x : 1;
        },
        o_class__active: function() {
            return f_o_class(o_ml.n_id__class__active);
        },
        s_color__active: function() {
            return this.o_class__active ? this.o_class__active.s_color_hex : '#ffffff';
        },
        // next to the crossing of the two lines, on the side where there is room
        o_style__cursor: function() {
            let o_point = this.o_point__cursor;
            return {
                left: o_point.n_x * 100 + '%',
                top: o_point.n_y * 100 + '%',
                color: this.s_color__active,
                transform: 'translate(' + (o_point.n_x > 0.8 ? 'calc(-100% - 8px)' : '8px') + ', ' + (o_point.n_y > 0.92 ? 'calc(-100% - 6px)' : '6px') + ')',
            };
        },
        // the edges of the box in edit mode, continued across the stage: where they lie, in image
        // pixels, and how far beyond the image they run. the stage cuts them off at its border.
        o_guide: function() {
            let o_bbox = o_ml.a_o_bbox[o_ml.n_idx__bbox__selected];
            if(!o_bbox) return null;
            let o_edge = f_o_edge(o_bbox);
            return {
                s_color: this.f_s_color(o_bbox),
                a_n_x: [o_edge.n_x__min * this.n_scl_x, o_edge.n_x__max * this.n_scl_x],
                a_n_y: [o_edge.n_y__min * this.n_scl_y, o_edge.n_y__max * this.n_scl_y],
                n_far: 20 * Math.max(this.n_scl_x, this.n_scl_y, 1),
            };
        },
        // the four corner handles of the box in edit mode
        a_o_handle: function() {
            let o_bbox = o_ml.a_o_bbox[o_ml.n_idx__bbox__selected];
            if(!o_bbox) return [];
            let o_edge = f_o_edge(o_bbox);
            let n_scl = 8 * this.n_scl__px;
            let o_self = this;
            return [['nw', o_edge.n_x__min, o_edge.n_y__min], ['ne', o_edge.n_x__max, o_edge.n_y__min],
                ['sw', o_edge.n_x__min, o_edge.n_y__max], ['se', o_edge.n_x__max, o_edge.n_y__max]].map(function([s_corner, n_x, n_y]) {
                return { s_corner, o_rect: {
                    x: n_x * o_self.n_scl_x - n_scl / 2,
                    y: n_y * o_self.n_scl_y - n_scl / 2,
                    width: n_scl,
                    height: n_scl,
                } };
            });
        },
    },
    methods: {
        f_s_name: function(o_bbox) {
            let o_class = f_o_class(o_bbox.n_o_class_n_id);
            return o_class ? o_class.s_name : '';
        },
        f_s_color: function(o_bbox) {
            let o_class = f_o_class(o_bbox.n_o_class_n_id);
            return o_class ? o_class.s_color_hex : '#ffffff';
        },
        // the key that chooses the class, '' for a class beyond the ninth
        f_s_key: function(n_id__class) {
            let n_idx = o_ml.a_o_class.findIndex(function(o_class){ return o_class.n_id === n_id__class; });
            return n_idx >= 0 && n_idx < 9 ? String(n_idx + 1) : '';
        },
        // a prediction takes the colour of the class with the same name, grey without one
        f_s_color__prediction: function(o_prediction) {
            let o_class = o_ml.a_o_class.find(function(o){ return o.s_name.toLowerCase() === String(o_prediction.s_name__class).toLowerCase(); });
            return o_class ? o_class.s_color_hex : '#b8b8c2';
        },
        // svg attributes of a box, in image pixels
        f_o_rect: function(o_bbox) {
            let o_edge = f_o_edge(o_bbox);
            return {
                x: o_edge.n_x__min * this.n_scl_x,
                y: o_edge.n_y__min * this.n_scl_y,
                width: o_bbox.n_scl_x_nor * this.n_scl_x,
                height: o_bbox.n_scl_y_nor * this.n_scl_y,
            };
        },
        // key, name and delete of a box sit inside it, at its top left corner
        f_o_style__tag: function(o_bbox) {
            let o_edge = f_o_edge(o_bbox);
            return { left: o_edge.n_x__min * 100 + '%', top: o_edge.n_y__min * 100 + '%', '--ml-color': this.f_s_color(o_bbox) };
        },
        // the name of a prediction sits below its box, inside when there is no room
        f_o_label: function(o_prediction) {
            let o_edge = f_o_edge(o_prediction);
            let n_scl__font = N_PX__FONT * this.n_scl__px;
            let n_y = o_edge.n_y__max * this.n_scl_y + n_scl__font;
            if(n_y > this.n_scl_y - n_scl__font * 0.3) n_y = o_edge.n_y__max * this.n_scl_y - n_scl__font * 0.35;
            return {
                x: o_edge.n_x__min * this.n_scl_x + 2 * this.n_scl__px,
                y: n_y,
                'font-size': n_scl__font,
                'stroke-width': 2.5 * this.n_scl__px,
            };
        },
        // where the image lies: the live image has the size the camera delivers right now
        f_measure: function() {
            let el_stage = this.$refs.el_stage;
            if(!el_stage) return;
            if(!o_ml.b_still){
                let o_geometry = f_o_camera_geometry();
                this.n_scl_x__camera = o_geometry.n_scl_x;
                this.n_scl_y__camera = o_geometry.n_scl_y;
            }
            let o_rect = f_o_video_rect({ left: 0, top: 0, width: el_stage.clientWidth, height: el_stage.clientHeight }, this.n_scl_x, this.n_scl_y);
            let o_rect__old = this.o_rect__view;
            if(o_rect && o_rect__old && ['n_x', 'n_y', 'n_scl_x', 'n_scl_y'].every(function(s){ return o_rect[s] === o_rect__old[s]; })) return;
            this.o_rect__view = o_rect;
        },
        // pointer position normalised by the image; outside the image it lies outside 0..1
        f_o_point: function(o_evt) {
            let o_rect = this.o_rect__view;
            let el_stage = this.$refs.el_stage;
            if(!o_rect || !el_stage) return null;
            let o_rect__stage = el_stage.getBoundingClientRect();
            return {
                n_x: (o_evt.clientX - o_rect__stage.left - o_rect.n_x) / o_rect.n_scl_x,
                n_y: (o_evt.clientY - o_rect__stage.top - o_rect.n_y) / o_rect.n_scl_y,
            };
        },
        // what a press at the point takes hold of: a corner of the box in edit mode, its inside, or nothing
        f_s_hit: function(o_point) {
            let o_bbox = o_ml.a_o_bbox[o_ml.n_idx__bbox__selected];
            if(!o_bbox || !this.o_rect__view) return '';
            return f_s_hit(o_bbox, o_point.n_x, o_point.n_y, N_PX__HANDLE / this.o_rect__view.n_scl_x, N_PX__HANDLE / this.o_rect__view.n_scl_y);
        },
        // while an image is on its way to the data server its boxes stay as they are
        f_b_locked: function() {
            return o_ml.s_activity === 'capture';
        },
        f_edit: function(n_idx) {
            if(this.f_b_locked()) return;
            this.f_abort();
            o_ml.n_idx__bbox__selected = n_idx;
            this.o_point__cursor = null;
        },
        f_delete: function(n_idx) {
            if(this.f_b_locked() || !o_ml.a_o_bbox[n_idx]) return;
            this.f_abort();
            o_ml.a_o_bbox.splice(n_idx, 1);
            o_ml.n_idx__bbox__selected = -1;
            f_bbox_changed();
        },
        f_on_down: function(o_evt) {
            if(o_evt.button !== 0 || this.f_b_locked()) return;
            this.f_measure();
            let o_point = this.f_o_point(o_evt);
            if(!o_point) return;
            // the keys 1-9 belong to the image now, not to a field that still has the cursor
            if(document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
            let s_hit = this.f_s_hit(o_point);
            if(s_hit !== ''){
                let n_idx = o_ml.n_idx__bbox__selected;
                this.o_drag = {
                    s_mode: s_hit === 'inside' ? 'move' : 'resize',
                    n_idx,
                    s_corner: s_hit,
                    o_point__start: o_point,
                    o_bbox__start: { ...o_ml.a_o_bbox[n_idx] },
                    b_changed: false,
                };
            } else {
                // a press outside the box ends its edit mode; dragged on, it draws a new box
                o_ml.n_idx__bbox__selected = -1;
                let b_inside = o_point.n_x >= 0 && o_point.n_x <= 1 && o_point.n_y >= 0 && o_point.n_y <= 1;
                if(!b_inside || !this.o_class__active) return;
                this.o_drag = { s_mode: 'draw', n_idx: -1, s_corner: '', o_point__start: o_point, o_bbox__start: null, b_changed: false };
            }
            // the drag is followed on the window: it goes on when the pointer leaves the image
            window.addEventListener('pointermove', this.f_on_drag);
            window.addEventListener('pointerup', this.f_on_up);
            window.addEventListener('pointercancel', this.f_abort);
            o_evt.preventDefault();
        },
        // without a drag the cursor shows what a press would do
        f_on_hover: function(o_evt) {
            if(this.o_drag) return;
            this.f_measure();
            let o_point = this.f_o_point(o_evt);
            if(!o_point){
                this.o_point__cursor = null;
                return;
            }
            let b_tag = o_evt.target instanceof Element && !!o_evt.target.closest('.ml-bbox-tag');
            let s_hit = b_tag ? '' : this.f_s_hit(o_point);
            this.s_cursor = b_tag ? 'label' : (s_hit === '' ? 'draw' : (s_hit === 'inside' ? 'move' : (s_hit === 'nw' || s_hit === 'se' ? 'nwse' : 'nesw')));
            let b_inside = o_point.n_x >= 0 && o_point.n_x <= 1 && o_point.n_y >= 0 && o_point.n_y <= 1;
            this.o_point__cursor = !b_tag && s_hit === '' && b_inside && !!this.o_class__active && !this.f_b_locked() ? o_point : null;
        },
        f_on_leave: function() {
            if(!this.o_drag) this.o_point__cursor = null;
        },
        f_end_drag: function() {
            this.o_drag = null;
            window.removeEventListener('pointermove', this.f_on_drag);
            window.removeEventListener('pointerup', this.f_on_up);
            window.removeEventListener('pointercancel', this.f_abort);
        },
        f_on_drag: function(o_evt) {
            let o_drag = this.o_drag;
            let o_point = o_drag ? this.f_o_point(o_evt) : null;
            if(!o_point || this.f_b_locked() || (o_drag.s_mode !== 'draw' && !o_ml.a_o_bbox[o_drag.n_idx])){
                this.f_abort();
                return;
            }
            if(o_drag.s_mode === 'draw'){
                this.o_bbox__draft = f_o_bbox__from_corner(o_drag.o_point__start.n_x, o_drag.o_point__start.n_y, o_point.n_x, o_point.n_y);
                // the two lines stay on the corner that is dragged
                this.o_point__cursor = { n_x: f_n_clamp(o_point.n_x, 0, 1), n_y: f_n_clamp(o_point.n_y, 0, 1) };
                return;
            }
            let o_bbox__new = o_drag.s_mode === 'move'
                ? f_o_bbox__moved(o_drag.o_bbox__start, o_point.n_x - o_drag.o_point__start.n_x, o_point.n_y - o_drag.o_point__start.n_y)
                : f_o_bbox__resized(o_drag.o_bbox__start, o_drag.s_corner, o_point.n_x, o_point.n_y);
            Object.assign(o_ml.a_o_bbox[o_drag.n_idx], o_bbox__new);
            o_drag.b_changed = true;
        },
        f_on_up: function() {
            let o_drag = this.o_drag;
            if(!o_drag) return;
            this.f_end_drag();
            if(o_drag.s_mode === 'draw'){
                let o_bbox = this.o_bbox__draft;
                this.o_bbox__draft = null;
                if(!o_bbox || !this.o_class__active || !f_b_bbox__large_enough(o_bbox, this.n_scl_x, this.n_scl_y)) return;
                o_ml.a_o_bbox.push({ n_o_class_n_id: o_ml.n_id__class__active, ...o_bbox });
                f_bbox_changed();
                return;
            }
            if(!o_drag.b_changed || !o_ml.a_o_bbox[o_drag.n_idx]) return;
            // a box dragged down to nothing keeps its old shape
            if(!f_b_bbox__large_enough(o_ml.a_o_bbox[o_drag.n_idx], this.n_scl_x, this.n_scl_y)){
                Object.assign(o_ml.a_o_bbox[o_drag.n_idx], o_drag.o_bbox__start);
                return;
            }
            f_bbox_changed();
        },
        // give up the drag in progress; nothing of it is kept
        f_abort: function() {
            let o_drag = this.o_drag;
            this.f_end_drag();
            this.o_bbox__draft = null;
            if(o_drag && o_drag.o_bbox__start && o_ml.a_o_bbox[o_drag.n_idx]) Object.assign(o_ml.a_o_bbox[o_drag.n_idx], o_drag.o_bbox__start);
        },
        f_on_key: function(o_evt) {
            if(!o_state.o_panel_visibility.ml_training || o_state.b_input_suspended) return;
            if(o_evt.ctrlKey || o_evt.altKey || o_evt.metaKey) return;
            // typing a name is not a shortcut
            if(o_evt.target instanceof Element && o_evt.target.closest('input, textarea, select, [contenteditable]')) return;
            if(/^[1-9]$/.test(o_evt.key)){
                let o_class = o_ml.a_o_class[Number(o_evt.key) - 1];
                if(!o_class) return;
                o_ml.n_id__class__active = o_class.n_id;
                let o_bbox = o_ml.a_o_bbox[o_ml.n_idx__bbox__selected];
                if(o_bbox && this.b_stage && !this.f_b_locked() && o_bbox.n_o_class_n_id !== o_class.n_id){
                    o_bbox.n_o_class_n_id = o_class.n_id;
                    f_bbox_changed();
                }
                o_evt.preventDefault();
                return;
            }
            if(!this.b_stage) return;
            if(o_evt.key === 'Escape'){
                this.f_abort();
                o_ml.n_idx__bbox__selected = -1;
                return;
            }
            if((o_evt.key === 'Delete' || o_evt.key === 'Backspace') && o_ml.a_o_bbox[o_ml.n_idx__bbox__selected]){
                this.f_delete(o_ml.n_idx__bbox__selected);
                o_evt.preventDefault();
            }
        },
        f_measure__next: function() {
            this.$nextTick(this.f_measure);
        },
    },
    watch: {
        // the stage itself comes and goes, and every image has its own size
        b_stage: function(b_stage) {
            document.body.classList.toggle('ml-annotating', b_stage);
            if(!b_stage){
                this.f_abort();
                this.o_point__cursor = null;
            }
            this.f_measure__next();
        },
        'o_ml.s_url__still': function() {
            this.f_abort();
            this.o_point__cursor = null;
            this.f_measure__next();
        },
        'o_ml.n_rev__camera': function() {
            this.f_measure__next();
        },
    },
    mounted: function() {
        document.body.classList.toggle('ml-annotating', this.b_stage);
        this.f_measure__next();
        document.addEventListener('keydown', this.f_on_key);
        window.addEventListener('resize', this.f_measure);
        window.addEventListener('toolbar-resize', this.f_measure);
    },
    beforeUnmount: function() {
        this.f_end_drag();
        document.body.classList.remove('ml-annotating');
        document.removeEventListener('keydown', this.f_on_key);
        window.removeEventListener('resize', this.f_measure);
        window.removeEventListener('toolbar-resize', this.f_measure);
    },
};

export { o_component__ml_stage };
