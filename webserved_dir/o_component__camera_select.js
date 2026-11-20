import { o_state, f_save_setting__debounced } from './index.js';
import { o_component__icon } from './o_component__icon.js';

// The list of the cameras for the windows where a camera is looked for: Camera
// and Microcontroller. The top bar has the same list in its compact form.
// All of them choose o_state.s_id__webcam_device; o_component__webcam starts it.
let o_component__camera_select = {
    name: 'component-camera-select',
    components: { ui_icon: o_component__icon },
    data: function() {
        return { o_state: o_state };
    },
    computed: {
        s_tooltip: function() {
            if(o_state.o_error__webcam) return o_state.o_error__webcam.s_title + '\n' + o_state.o_error__webcam.s_detail;
            return 'Camera\nThe USB camera whose image is shown. A camera that is plugged in later appears in this list by itself.';
        },
    },
    methods: {
        f_on_change: function(o_evt) {
            f_save_setting__debounced('s_id__webcam_device', o_state.s_id__webcam_device);
            // a list that keeps the focus keeps the keys W A S D Q E for itself
            o_evt.target.blur();
        },
    },
    template: `
        <label class="cam-setting-row camera-select" :class="{ error: !!o_state.o_error__webcam }" :data-tooltip="s_tooltip">
            <ui_icon class="cam-setting-icon" s_name="camera" />
            <select class="camera-select-list" v-model="o_state.s_id__webcam_device" @change="f_on_change" aria-label="Camera">
                <option value="">Select camera</option>
                <option v-for="o_dev in o_state.a_o_device__webcam" :key="o_dev.deviceId" :value="o_dev.deviceId">{{ o_dev.label || o_dev.deviceId }}</option>
            </select>
        </label>
    `,
};

export { o_component__camera_select };
