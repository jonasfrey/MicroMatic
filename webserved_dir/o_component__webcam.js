import { o_state, f_save_setting__debounced } from './index.js';
import { f_apply_camera__saved, f_camera_stopped } from './o_camera.module.js';
import { f_o_camera_geometry, f_el_camera_frame, f_b_camera_crop_active } from './camera_frame.module.js';
import { f_o_error__camera, f_o_error__camera_lost } from './camera_access.module.js';

let o_component__webcam = {
    name: 'component-webcam',
    template: `
        <video
            ref="el_video"
            id="webcamVideo"
            autoplay
            playsinline
            muted
            :style="{ display: b_streaming ? 'block' : 'none', visibility: b_cropped ? 'hidden' : 'visible' }"
        ></video>
        <canvas id="webcamFrame" ref="el_frame" v-show="b_streaming && b_cropped"></canvas>
        <div id="webcamPlaceholder" v-if="!b_streaming" :class="{ error: !!o_state.o_error__webcam }" :role="o_state.o_error__webcam ? 'alert' : null">
            <span>{{ o_state.o_error__webcam ? o_state.o_error__webcam.s_title : 'No camera active' }}</span>
            <span style="font-size:0.75rem;">{{ o_state.o_error__webcam ? o_state.o_error__webcam.s_detail : 'select a camera in the toolbar above' }}</span>
        </div>
        <div class="capture-flash" :class="{ flash: b_flash }"></div>
    `,
    data: function() {
        return {
            o_state: o_state,
            b_streaming: false,
            o_stream: null,
            b_flash: false,
            b_cropped: false,
            n_id__flash_timeout: 0,
            n_id__camera_apply: 0,
            // the browser has handed out a camera once: from then on it lists the cameras by name
            b_permission: false,
            // counts the starts: a start that was overtaken by a newer one gives its camera back
            n_rev__start: 0,
        };
    },
    mounted: function() {
        let o_self = this;
        o_self.f_enumerate_webcam();
        o_self.f_draw_frame();
        // a camera that is plugged in later is found without reloading the page
        o_self._f_on_devicechange = function(){ o_self.f_on_devicechange(); };
        navigator.mediaDevices?.addEventListener?.('devicechange', o_self._f_on_devicechange);
    },
    watch: {
        'o_state.s_id__webcam_device': function(s_id__new) {
            if(s_id__new){
                this.f_start_webcam(s_id__new);
            } else {
                this.f_stop_webcam();
                // no camera is asked for: nothing is wrong
                if(this.b_permission) o_state.o_error__webcam = null;
            }
        },
        'o_state.n_cnt__capture_flash': function() {
            let o_self = this;
            o_self.b_flash = true;
            clearTimeout(o_self.n_id__flash_timeout);
            o_self.n_id__flash_timeout = setTimeout(function() {
                o_self.b_flash = false;
            }, 160);
        }
    },
    methods: {
        f_draw_frame: function() {
            let el_video = this.$refs.el_video;
            this.b_cropped = f_b_camera_crop_active(el_video);
            let s_geometry = JSON.stringify([o_state.s_id__webcam_device, f_o_camera_geometry(el_video)]);
            if (this._s_geometry && this._s_geometry !== s_geometry) {
                if (o_state.o_zoom) Object.assign(o_state.o_zoom, { n_scl_x__roi: 0, n_scl_y__roi: 0, b_selecting: false });
            }
            this._s_geometry = s_geometry;
            if (this.b_streaming && this.b_cropped && el_video.readyState >= 2) {
                let el_frame = this.$refs.el_frame;
                let o_geometry = f_o_camera_geometry(el_video);
                if (el_frame.width !== o_geometry.n_scl_x) el_frame.width = o_geometry.n_scl_x;
                if (el_frame.height !== o_geometry.n_scl_y) el_frame.height = o_geometry.n_scl_y;
                el_frame.getContext('2d').drawImage(f_el_camera_frame(el_video), 0, 0);
            }
            this._n_id__frame = requestAnimationFrame(() => this.f_draw_frame());
        },
        f_enumerate_webcam: async function() {
            let o_self = this;
            try {
                // need temporary stream to get device labels
                let o_temp_stream = await navigator.mediaDevices.getUserMedia({ video: true });
                o_temp_stream.getTracks().forEach(function(o_track){ o_track.stop(); });
                o_self.b_permission = true;
                if(!o_self.b_streaming) o_state.o_error__webcam = null;
                await o_self.f_list_webcam();
            } catch(e) {
                console.warn('Webcam enumeration failed:', e);
                // said on the stage: an empty camera list alone does not tell why it is empty
                o_state.o_error__webcam = f_o_error__camera(e);
            }
        },
        // reads the list of the cameras and starts the saved one when it is there and not showing yet
        f_list_webcam: async function() {
            let o_self = this;
            let a_o_device = await navigator.mediaDevices.enumerateDevices();
            o_state.a_o_device__webcam = a_o_device.filter(function(o_dev){
                return o_dev.kind === 'videoinput';
            });

            // auto-start saved device
            if(o_state.s_id__webcam_device && !o_self.b_streaming){
                let b_found = o_state.a_o_device__webcam.some(function(o_dev){
                    return o_dev.deviceId === o_state.s_id__webcam_device;
                });
                if(b_found){
                    o_self.f_start_webcam(o_state.s_id__webcam_device);
                }
            }
        },
        // a camera was plugged in or pulled out
        f_on_devicechange: async function() {
            // before a camera was handed out there are no names to list: ask again, there may be a camera now
            if(!this.b_permission) return await this.f_enumerate_webcam();
            try {
                await this.f_list_webcam();
            } catch(e) {
                console.warn('Webcam enumeration failed:', e);
            }
        },
        f_start_webcam: async function(s_device_id) {
            let o_self = this;
            o_self.f_stop_webcam();
            let n_rev = ++o_self.n_rev__start;
            try {
                let o_stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        deviceId: { exact: s_device_id },
                        width: { ideal: 3840 },
                        height: { ideal: 2160 },
                    }
                });
                // another camera was asked for in the meantime, or none: this one is not shown
                if(n_rev !== o_self.n_rev__start){
                    o_stream.getTracks().forEach(function(o_track){ o_track.stop(); });
                    return;
                }
                o_self.o_stream = o_stream;
                // the cable of the camera is pulled: the image must not stand still as if it were live
                o_stream.getVideoTracks().forEach(function(o_track){
                    o_track.addEventListener('ended', function(){
                        if(o_self.o_stream !== o_stream) return;
                        o_self.f_stop_webcam();
                        o_state.o_error__webcam = f_o_error__camera_lost();
                    });
                });
                o_self.$refs.el_video.srcObject = o_self.o_stream;
                o_self.b_streaming = true;
                o_state.b_streaming__webcam = true;
                o_state.o_error__webcam = null;
                // give the UVC controls a moment to appear, then push the
                // saved hardware setting onto the fresh track
                clearTimeout(o_self.n_id__camera_apply);
                o_self.n_id__camera_apply = setTimeout(function(){ f_apply_camera__saved(); }, 500);
            } catch(e) {
                if(n_rev !== o_self.n_rev__start) return;
                console.error('Webcam start failed:', e);
                o_self.b_streaming = false;
                o_state.b_streaming__webcam = false;
                o_state.o_error__webcam = f_o_error__camera(e);
            }
        },
        f_stop_webcam: function() {
            let o_self = this;
            // a start that is still waiting for its camera is given up
            o_self.n_rev__start++;
            clearTimeout(o_self.n_id__camera_apply);
            if(o_self.o_stream){
                o_self.o_stream.getTracks().forEach(function(o_track){ o_track.stop(); });
                o_self.o_stream = null;
            }
            o_self.b_streaming = false;
            o_state.b_streaming__webcam = false;
            if (o_self.$refs.el_video) o_self.$refs.el_video.srcObject = null;
            f_camera_stopped();
        },
    },
    beforeUnmount: function() {
        clearTimeout(this.n_id__flash_timeout);
        cancelAnimationFrame(this._n_id__frame);
        navigator.mediaDevices?.removeEventListener?.('devicechange', this._f_on_devicechange);
        this.f_stop_webcam();
    },
};

export { o_component__webcam };
