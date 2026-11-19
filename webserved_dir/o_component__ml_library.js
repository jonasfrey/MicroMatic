import { o_state } from './index.js';
import { o_ml, f_o_class, f_open_image, f_delete_image, f_load_thumbnail } from './o_ml.module.js';
import { o_component__icon } from './o_component__icon.js';
import { f_o_edge } from './ml_bbox.module.js';

// Images of the current dataset, newest first. Opened by a click on the
// thumbnail in the ML Training window; a click on an image puts it on the stage.
// Every thumbnail shows the boxes of its image, in the colours of their classes.

// a thumbnail is fetched when its tile scrolls into view, not for the whole dataset at once
let o_observer = null;
let f_o_observer = function() {
    if(!o_observer){
        o_observer = new IntersectionObserver(function(a_o_entry) {
            for(let o_entry of a_o_entry){
                if(!o_entry.isIntersecting) continue;
                o_observer.unobserve(o_entry.target);
                if(o_entry.target.o_image__thumbnail) f_load_thumbnail(o_entry.target.o_image__thumbnail);
            }
        });
    }
    return o_observer;
};

// v-visible="o_image": loads the thumbnail of the image once the element is seen
let o_directive__visible = {
    mounted: function(el, o_binding) {
        el.o_image__thumbnail = o_binding.value;
        f_o_observer().observe(el);
    },
    updated: function(el, o_binding) {
        let n_id = o_binding.value ? o_binding.value.n_id : 0;
        let n_id__old = o_binding.oldValue ? o_binding.oldValue.n_id : 0;
        if(n_id === n_id__old) return;
        el.o_image__thumbnail = o_binding.value;
        // observing again reports at once whether the element is seen
        f_o_observer().unobserve(el);
        f_o_observer().observe(el);
    },
    unmounted: function(el) {
        f_o_observer().unobserve(el);
    },
};

let o_component__ml_library = {
    name: 'component-ml-library',
    components: { ui_icon: o_component__icon },
    directives: { visible: o_directive__visible },
    template: `
        <section class="overlay-panel ml-library" :class="{ visible: o_state.o_panel_visibility.ml_training && o_ml.b_library }" aria-label="Images">
            <div class="panel-header">
                <h2><ui_icon s_name="image" /> Images</h2>
                <span class="panel-state">{{ n_cnt__done }}/{{ o_ml.a_o_image.length }}</span>
                <button class="panel-close" @click="o_ml.b_library = false" aria-label="Close images">&times;</button>
            </div>
            <div class="panel-body">
                <div class="ml-library-grid cockpit-list">
                    <div class="ml-library-item" v-for="o_image in a_o_image" :key="o_image.n_id"
                        :class="{ active: o_ml.o_image && o_ml.o_image.n_id === o_image.n_id, done: o_image.b_done }"
                        v-visible="o_image">
                        <button class="ml-library-open" data-control-skip @click="f_open_image(o_image)" :aria-label="'Open image ' + o_image.n_id"
                            :data-tooltip="f_s_tooltip(o_image)">
                            <img v-if="o_ml.o_s_url__thumbnail[o_image.n_id]" :src="o_ml.o_s_url__thumbnail[o_image.n_id]" alt="" draggable="false" />
                            <ui_icon v-else s_name="image" />
                        </button>
                        <svg class="ml-library-bbox" v-if="o_ml.o_s_url__thumbnail[o_image.n_id] && o_image.a_o_bbox.length"
                            :viewBox="'0 0 ' + o_image.n_scl_x + ' ' + o_image.n_scl_y" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                            <rect v-for="(o_bbox, n_idx) in o_image.a_o_bbox" :key="n_idx" v-bind="f_o_rect(o_image, o_bbox)" :style="{ color: f_s_color(o_bbox) }" />
                        </svg>
                        <span class="ml-library-count">{{ o_image.a_o_bbox.length }}</span>
                        <span class="ml-library-done" v-if="o_image.b_done"><ui_icon s_name="check" /></span>
                        <button class="cockpit-icon-button danger ml-library-delete" data-control-skip @click="f_delete(o_image)"
                            :aria-label="'Delete image ' + o_image.n_id" data-tooltip="Delete this image and its boxes"><ui_icon s_name="trash" /></button>
                    </div>
                </div>
            </div>
        </section>
    `,
    data: function() {
        return {
            o_state: o_state,
            o_ml: o_ml,
        };
    },
    computed: {
        a_o_image: function() {
            return o_ml.a_o_image.slice().reverse();
        },
        n_cnt__done: function() {
            return o_ml.a_o_image.filter(function(o_image){ return o_image.b_done; }).length;
        },
    },
    methods: {
        f_open_image,
        // svg attributes of a box, in the pixels of its image
        f_o_rect: function(o_image, o_bbox) {
            let o_edge = f_o_edge(o_bbox);
            return {
                x: o_edge.n_x__min * o_image.n_scl_x,
                y: o_edge.n_y__min * o_image.n_scl_y,
                width: o_bbox.n_scl_x_nor * o_image.n_scl_x,
                height: o_bbox.n_scl_y_nor * o_image.n_scl_y,
            };
        },
        f_s_color: function(o_bbox) {
            let o_class = f_o_class(o_bbox.n_o_class_n_id);
            return o_class ? o_class.s_color_hex : '#ffffff';
        },
        f_s_tooltip: function(o_image) {
            return new Date(o_image.n_ts_ms__created).toLocaleString() + '\n'
                + o_image.a_o_bbox.length + ' boxes · ' + (o_image.b_done ? 'done' : 'not done') + '\n'
                + o_image.n_scl_x + ' × ' + o_image.n_scl_y + ' px';
        },
        f_delete: function(o_image) {
            if(!confirm('Delete this image and its ' + o_image.a_o_bbox.length + ' boxes?')) return;
            f_delete_image(o_image);
        },
    },
};

export { o_component__ml_library };
