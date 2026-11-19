import { o_state } from './index.js';
import { o_component__smart_selector } from './o_component__smart_selector.js';
import {
    f_refresh_slide_list,
    f_o_image__of_slide,
    f_s_url__thumbnail,
    f_select_slide,
    f_create_slide,
    f_rename_slide,
    f_delete_slide,
} from './o_ml.module.js';

// The slide on the stage, in the top bar: a smart selector over the slides of
// the slide library. A row of its list shows the image taken last from the
// slide, as the data server knows it.

let o_component__ml_slide = {
    name: 'component-ml-slide',
    components: { smart_selector: o_component__smart_selector },
    template: `
        <smart_selector class="ml-slide" s_name__kind="slide" s_icon="slide" b_warning
            :a_o_object="o_state.a_o_slide || []" :n_id="o_state.n_id__slide__current" :a_o_field="a_o_field"
            s_tooltip="The slide on the stage. Every image is stored with it."
            :f_s_url__thumbnail="f_s_url__thumbnail" :f_select="f_select" :f_b_create="f_b_create" :f_b_update="f_b_update"
            :f_delete="f_delete" :f_refresh="f_refresh_slide_list" />
    `,
    data: function() {
        return {
            o_state: o_state,
            a_o_field: [{ s_key: 's_name', s_label: 'name', n_len__max: 100 }],
        };
    },
    methods: {
        f_refresh_slide_list,
        f_s_url__thumbnail: function(o_slide) {
            return f_s_url__thumbnail(f_o_image__of_slide(o_slide.s_name));
        },
        f_select: function(o_slide) {
            f_select_slide(o_slide.n_id);
        },
        // a name that exists already is not created twice: that slide is chosen
        f_b_create: function(o_value) {
            return f_create_slide(o_value.s_name);
        },
        f_b_update: function(o_slide, o_value) {
            return f_rename_slide(o_slide, o_value.s_name);
        },
        f_delete: function(o_slide) {
            if(confirm('Delete the slide "' + o_slide.s_name + '"? Images taken from it stay in their datasets.')) f_delete_slide(o_slide);
        },
    },
};

export { o_component__ml_slide };
