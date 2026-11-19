// ML training: state and every operation behind the docked ML Training window
// and its part of the top bar (slide, login).
// Data lives on the data server (dataserver_client.module.js); this module
// connects it with what the local application knows: the camera frame, the
// stage position, the calibration and the current slide.

import { reactive } from './lib/vue.esm-browser.js';
import {
    o_state,
    f_save_setting__debounced,
    f_save_library_current,
    f_send_wsmsg_with_response,
    f_n_motor__axis,
    f_send_esp,
    f_send_esp_move_step,
    f_send_esp_stop,
    f_register_esp_handler,
} from './index.js';
import { f_o_toast, f_o_wsmsg, o_sfunexposed__f_v_crud__indb } from './constructors.module.js';
import { f_o_capture__frame } from './o_capture.module.js';
import { f_b_camera_geometry_matches } from './camera_frame.module.js';
import { f_v_response__dataserver, f_s_url__dataserver, f_s_token, f_set_token, f_set_on_session_lost } from './dataserver_client.module.js';
import { f_set_view_hold, f_v_command__own } from './view_hold.module.js';

let N_MS__SAVE_DELAY = 300;
let N_MS__STATUS_INTERVAL = 10000;
let N_MS__JOB_INTERVAL = 1500;
let N_BYTE__FREE_WARN = 5 * 1024 * 1024 * 1024;
let N_BYTE__FREE_MIN = 1024 * 1024 * 1024;
let N_PX__THUMBNAIL = 320;
// focus points: the focus motor moves gently and the image settles before it is taken
let N_CNT__FOCUS_MAX = 9;
let N_RPM__FOCUS = 6;
let N_MS__FOCUS_TIMEOUT = 30000;
let N_MS__FOCUS_SETTLE = 350;
let N_MS__REST_TIMEOUT = 3000;

let o_ml = reactive({
    // counts the changes of the size of the camera image: the video element is not reactive
    n_rev__camera: 0,
    // data server. b_probed: it was asked once, so b_reachable and the session are known
    b_probed: false,
    b_reachable: false,
    n_byte__free: null,
    // session
    o_person: null,
    o_organisation: null,
    // data of the organisation
    a_o_dataset: [],
    a_o_class: [],
    a_o_image: [],
    a_o_model: [],
    a_o_microscope: [],
    // the slides the data server knows, each with o_image__last (see f_refresh_slide_list)
    a_o_slide__server: [],
    n_id__class__active: 0,
    // the still image on the stage: a stored image (o_image). without one the
    // stage shows the live image.
    b_still: false,
    s_url__still: '',
    n_scl_x__still: 0,
    n_scl_y__still: 0,
    o_image: null,
    // the boxes on the stage. with o_image they belong to that stored image and
    // are saved as they change. without it they are drawn on what the camera
    // shows and wait for "capture".
    a_o_bbox: [],
    // the boxes of the camera image, set aside while a stored image is on the stage
    a_o_bbox__parked: [],
    // the box in edit mode, -1 for none
    n_idx__bbox__selected: -1,
    // the question whether the field of view may be left is open
    b_ask__leave: false,
    // focus points: z positions in motor steps, null while a point is not set.
    // with one point the image is taken where the focus is.
    n_cnt__focus: 1,
    a_n_step__focus: [null],
    // a capture that takes several images and is running: { n_idx, n_cnt, b_return, b_cancel },
    // null otherwise. n_idx: the focus point whose image is being taken. b_return: the
    // focus goes back to where it was. b_cancel: it was asked to stop.
    o_progress__capture: null,
    s_status__save: '',          // '' | 'saving' | 'saved' | 'error'
    // what the model found on what the stage shows: on the stored image, or on the
    // camera image as it was when "detect objects" was clicked. on the camera image it
    // goes as soon as X or Y moves.
    a_o_prediction: [],
    b_prediction: true,
    // what is running right now: '' | 'login' | 'capture' | 'export' | 'detect' | ...
    s_activity: '',
    s_error: '',
    o_job: null,
    b_library: false,
    // n_id of an image -> object url of its thumbnail
    o_s_url__thumbnail: {},
});

// the bytes of the still image
let o_blob__still = null;

let f_v_api = f_v_response__dataserver;

// ─── Errors and activity ────────────────────────────────────────────

// say what happened and which action is affected; the message of the error says what to do
let f_fail = function(s_action, o_error){
    let s_message = s_action + ' failed. ' + (o_error && o_error.message ? o_error.message : String(o_error));
    o_ml.s_error = s_message;
    o_state.a_o_toast.push(f_o_toast(s_message, 'error', Date.now(), 8000));
};

// run one operation: the dock shows it as running, an error is reported, never thrown on
let f_b_run = async function(s_activity, s_action, f_operation){
    o_ml.s_activity = s_activity;
    o_ml.s_error = '';
    try {
        await f_operation();
        return true;
    } catch (o_error) {
        if(o_error && o_error.s_error === 'not_reachable') o_ml.b_reachable = false;
        f_fail(s_action, o_error);
        return false;
    } finally {
        o_ml.s_activity = '';
    }
};

// ─── Settings kept by the local application ─────────────────────────

let f_save_config = function(){
    f_save_setting__debounced('o_ml_config', o_state.o_ml_config);
};

// ─── What the local application knows ───────────────────────────────

// call when the camera image has got its size or has changed it
let f_camera_changed = function(){
    o_ml.n_rev__camera++;
};

// { n_um_per_px, n_px_per_step_x, n_px_per_step_y }, 0 where a value is not calibrated
let f_o_calibration__local = function(){
    // read, so that what is shown from this result follows the size of the camera image
    o_ml.n_rev__camera;
    let n_um_per_px = Number(o_state.o_calibration.n_um__per_px) || 0;
    // µm per px belongs to the camera image it was measured on. a camera that
    // has just started has no image size yet: then there is nothing to compare.
    let o_snapshot = o_state.o_calibration.o_camera__scale;
    let el_video = document.getElementById('webcamVideo');
    let b_size = !!el_video && el_video.videoWidth > 0;
    if(n_um_per_px > 0 && o_snapshot && o_state.b_streaming__webcam && b_size && !f_b_camera_geometry_matches(o_snapshot)) n_um_per_px = 0;
    let f_n_px_per_step = function(s_axis){
        let n_motor = f_n_motor__axis(s_axis, true);
        // the local application stores steps per pixel
        let n_step__per_px = n_motor === null ? 0 : (Number(o_state.a_n_step__per_px[n_motor]) || 0);
        return n_step__per_px > 0 ? 1 / n_step__per_px : 0;
    };
    return {
        n_um_per_px: n_um_per_px > 0 ? n_um_per_px : 0,
        n_px_per_step_x: f_n_px_per_step('x'),
        n_px_per_step_y: f_n_px_per_step('y'),
    };
};

// the slide on the stage: chosen in the top bar or in the slide library
let f_o_slide__current = function(){
    return (o_state.a_o_slide || []).find(function(o){ return o.n_id === o_state.n_id__slide__current; }) || null;
};

let f_s_name__slide = function(){
    let o_slide = f_o_slide__current();
    return o_slide ? o_slide.s_name : '';
};

let f_o_dataset__current = function(){
    return o_ml.a_o_dataset.find(function(o_dataset){ return o_dataset.n_id === o_state.o_ml_config.n_id__dataset; }) || null;
};

// what the microscope reports at this moment, stored with an image
let f_o_metadata__now = function(){
    let f_n_step = function(s_axis){
        let n_motor = f_n_motor__axis(s_axis, true);
        let o_motor = n_motor === null ? null : o_state.a_o_motor[n_motor];
        return o_state.b_connected__esp && o_motor && Number.isFinite(o_motor.n_position) ? Math.round(o_motor.n_position) : null;
    };
    let o_device = o_state.a_o_device__webcam.find(function(o){ return o.deviceId === o_state.s_id__webcam_device; });
    let o_control__gain = (o_state.o_camera.a_o_control || []).find(function(o){ return o.s_name === 'gain'; });
    // the camera reports its exposure time in units of 100 µs
    let n_time__exposure = Number(o_state.o_camera.n_time__exposure) || 0;
    return {
        s_camera: (o_device && o_device.label) || '',
        n_iso: o_control__gain ? o_control__gain.n_val : null,
        n_ms__exposure: n_time__exposure > 0 ? n_time__exposure / 10 : null,
        n_steps_x_rel: f_n_step('x'),
        n_steps_y_rel: f_n_step('y'),
        n_steps_z_rel: f_n_step('z'),
    };
};

// why an image cannot be taken right now; empty when it can
let f_a_s_reason__capture = function(){
    let a_s_reason = [];
    let o_calibration = f_o_calibration__local();
    if(o_ml.o_image) a_s_reason.push('A stored image is shown. Go back to the live image first.');
    if(!o_ml.o_person) a_s_reason.push('Log in first.');
    if(!f_o_dataset__current()) a_s_reason.push('Select or create a dataset.');
    if(!o_state.b_streaming__webcam) a_s_reason.push('Select a camera in the top bar.');
    if(f_s_name__slide() === '') a_s_reason.push('Name the slide on the stage (top bar).');
    if(o_state.o_ml_config.s_name__microscope.trim() === '') a_s_reason.push('Enter the microscope.');
    if(o_state.o_ml_config.s_name__calibration.trim() === '') a_s_reason.push('Enter the objective.');
    if(!(o_calibration.n_um_per_px > 0)) a_s_reason.push('Calibrate µm per px for this camera image (Size window).');
    if(!(o_calibration.n_px_per_step_x > 0 && o_calibration.n_px_per_step_y > 0)) a_s_reason.push('Calibrate steps per px for X and Y (Setup window).');
    if(o_ml.n_byte__free !== null && o_ml.n_byte__free < N_BYTE__FREE_MIN) a_s_reason.push('The disk of the data server is full.');
    if(o_ml.n_cnt__focus > 1){
        if(f_n_step__focus() === null) a_s_reason.push('Focus points need the Z motor. Connect the microcontroller.');
        let n_idx = o_ml.a_n_step__focus.slice(0, o_ml.n_cnt__focus).indexOf(null);
        if(n_idx !== -1) a_s_reason.push('Set focus point ' + (n_idx + 1) + '.');
    }
    return a_s_reason;
};

// ─── Status and session ─────────────────────────────────────────────

let f_refresh_status = async function(){
    let s_token = f_s_token();
    try {
        let o_status = await f_v_api('GET', '/api/status');
        o_ml.b_reachable = true;
        o_ml.n_byte__free = o_status.n_byte__free;
        // the server was restarted or the session ran out: the top bar must not go on showing a login
        if(o_ml.o_person && o_status.b_session === false && s_token === f_s_token()){
            f_set_token('');
            f_clear_session();
            o_state.a_o_toast.push(f_o_toast('The session of the data server has ended. Log in again.', 'error', Date.now(), 8000));
        }
    } catch {
        o_ml.b_reachable = false;
    }
};

let f_clear_session = function(){
    o_ml.o_person = null;
    o_ml.o_organisation = null;
    o_ml.a_o_dataset = [];
    o_ml.a_o_class = [];
    o_ml.a_o_image = [];
    o_ml.a_o_model = [];
    o_ml.a_o_microscope = [];
    o_ml.a_o_slide__server = [];
    o_ml.o_job = null;
    o_ml.b_library = false;
    f_clear_stage();
    f_clear_thumbnail();
};

f_set_on_session_lost(f_clear_session);

let f_load_organisation = async function(){
    let [o_dataset, o_model, o_microscope, o_train] = await Promise.all([
        f_v_api('GET', '/api/dataset'),
        f_v_api('GET', '/api/model'),
        f_v_api('GET', '/api/microscope'),
        f_v_api('GET', '/api/train'),
    ]);
    o_ml.a_o_dataset = o_dataset.a_o_dataset;
    o_ml.a_o_model = o_model.a_o_model;
    o_ml.a_o_microscope = o_microscope.a_o_microscope;
    o_ml.o_job = o_train.o_job;
    if(!o_ml.a_o_model.some(function(o){ return o.n_id === o_state.o_ml_config.n_id__model; })){
        o_state.o_ml_config.n_id__model = o_ml.a_o_model.length ? o_ml.a_o_model[0].n_id : 0;
    }
    // the dataset chosen last time, when it still exists in this organisation
    let o_dataset__current = f_o_dataset__current() || o_ml.a_o_dataset[0] || null;
    await f_select_dataset__now(o_dataset__current ? o_dataset__current.n_id : 0);
    f_watch_job();
};

// called every N_MS__STATUS_INTERVAL: is the server there, and is the stored
// session still valid. a server that comes back later is picked up without a
// reload.
let f_refresh_session = async function(){
    await f_refresh_status();
    if(o_ml.b_reachable && !o_ml.o_person && f_s_token() && o_ml.s_activity === ''){
        await f_b_run('login', 'Restoring the session', async function(){
            let o_session;
            try {
                o_session = await f_v_api('GET', '/api/session');
            } catch (o_error) {
                // an ended session is no error: the login appears
                if(o_error.n_status === 401) return;
                throw o_error;
            }
            o_ml.o_person = o_session.o_person;
            o_ml.o_organisation = o_session.o_organisation;
            await f_load_organisation();
        });
    }
    o_ml.b_probed = true;
};

let f_login = async function(s_name__person, s_name__organisation){
    return await f_b_run('login', 'Login', async function(){
        let o_login = await f_v_api('POST', '/api/login', { v_json: { s_name__person, s_name__organisation } });
        f_set_token(o_login.s_token);
        o_ml.b_reachable = true;
        o_ml.o_person = o_login.o_person;
        o_ml.o_organisation = o_login.o_organisation;
        await f_load_organisation();
    });
};

let f_logout = async function(){
    await f_save_bbox__now();
    try { await f_v_api('POST', '/api/logout'); } catch { /* the session is forgotten here in any case */ }
    f_set_token('');
    f_clear_session();
};

// ─── Slide ──────────────────────────────────────────────────────────
// The slide library of the local application holds the slides. The data
// server knows a slide by its name, from the first image taken from it.

// names are compared without regard to case, like on the data server
let f_o_slide__named = function(s_name){
    let s_name__lower = s_name.toLowerCase();
    return (o_state.a_o_slide || []).find(function(o){ return o.s_name.toLowerCase() === s_name__lower; }) || null;
};

// what the data server knows about the slides: asked when the list of the top
// bar opens. without a session, or with a server that is away, the list works
// all the same, only without images.
let f_refresh_slide_list = async function(){
    if(!o_ml.o_person) return;
    try {
        o_ml.a_o_slide__server = (await f_v_api('GET', '/api/slide')).a_o_slide;
    } catch { /* the list stays as it was */ }
};

// { n_id, n_o_dataset_n_id } of the image taken last from the slide with this name, or null
let f_o_image__of_slide = function(s_name){
    let s_name__lower = s_name.toLowerCase();
    let o_slide = o_ml.a_o_slide__server.find(function(o){ return o.s_name.toLowerCase() === s_name__lower; });
    return (o_slide && o_slide.o_image__last) || null;
};

// one write to the database of the local application; a_v_arg as its crud function takes it
let f_o_row__local = async function(a_v_arg){
    let o_response = await f_send_wsmsg_with_response(f_o_wsmsg(o_sfunexposed__f_v_crud__indb.s_name, a_v_arg));
    if(!o_response.v_result) throw new Error(o_response.error || 'The local application did not save it.');
    return o_response.v_result;
};

// n_id__slide 0: no slide on the stage
let f_select_slide = function(n_id__slide){
    let o_slide = (o_state.a_o_slide || []).find(function(o){ return o.n_id === n_id__slide; }) || null;
    o_state.n_id__slide__current = o_slide ? o_slide.n_id : 0;
    // the slide library shows the slides of one project
    if(o_slide) o_state.n_id__project__current = o_slide.n_o_project_n_id;
    f_save_library_current();
};

// a slide of the slide library belongs to a project: the one chosen there,
// else the first one, else a new one
let f_o_project__ensured = async function(){
    let o_project = o_state.a_o_project.find(function(o){ return o.n_id === o_state.n_id__project__current; }) || o_state.a_o_project[0];
    if(!o_project){
        o_project = await f_o_row__local(['create', 'a_o_project', { s_name: 'default', s_note: '' }]);
        o_state.a_o_project.push(o_project);
    }
    return o_project;
};

// the slide with this name becomes the slide on the stage; it is created when there is none yet
let f_create_slide = async function(s_name){
    return await f_b_run('save', 'Creating the slide', async function(){
        let o_slide = f_o_slide__named(s_name);
        if(o_slide){
            o_state.a_o_toast.push(f_o_toast('Slide "' + o_slide.s_name + '" exists already. It is selected now.', 'success', Date.now(), 6000));
        } else {
            let o_project = await f_o_project__ensured();
            o_slide = await f_o_row__local(['create', 'a_o_slide', { n_o_project_n_id: o_project.n_id, s_name, s_note: '' }]);
            o_state.a_o_slide.push(o_slide);
            o_state.a_o_toast.push(f_o_toast('New slide "' + o_slide.s_name + '".', 'success', Date.now(), 4000));
        }
        f_select_slide(o_slide.n_id);
    });
};

// rename a slide. the images taken from it keep it: with a session the slide
// of the data server is renamed too.
let f_rename_slide = async function(o_slide, s_name){
    return await f_b_run('save', 'Renaming the slide', async function(){
        let o_slide__named = f_o_slide__named(s_name);
        if(o_slide__named && o_slide__named.n_id !== o_slide.n_id) throw new Error('A slide with this name exists already. Choose it from the list.');
        if(o_ml.o_person){
            let s_name__lower = o_slide.s_name.toLowerCase();
            let o_slide__server = (await f_v_api('GET', '/api/slide')).a_o_slide
                .find(function(o){ return o.s_name.toLowerCase() === s_name__lower; });
            if(o_slide__server) await f_v_api('PUT', `/api/slide/${o_slide__server.n_id}`, { v_json: { s_name } });
        }
        let o_slide__saved = await f_o_row__local(['update', 'a_o_slide', o_slide, { s_name }]);
        let n_idx = o_state.a_o_slide.findIndex(function(o){ return o.n_id === o_slide.n_id; });
        if(n_idx !== -1) o_state.a_o_slide[n_idx] = o_slide__saved;
        o_state.a_o_toast.push(f_o_toast('Slide "' + o_slide.s_name + '" renamed to "' + o_slide__saved.s_name + '".', 'success', Date.now(), 6000));
    });
};

// delete a slide from the slide library. the data server keeps a slide that
// images were taken from: every image keeps its slide.
let f_delete_slide = async function(o_slide){
    return await f_b_run('save', 'Deleting the slide', async function(){
        await f_o_row__local(['delete', 'a_o_slide', o_slide]);
        o_state.a_o_slide = o_state.a_o_slide.filter(function(o){ return o.n_id !== o_slide.n_id; });
        if(o_state.n_id__slide__current === o_slide.n_id){
            o_state.n_id__slide__current = 0;
            f_save_library_current();
        }
        if(!o_ml.o_person) return;
        let s_name__lower = o_slide.s_name.toLowerCase();
        try {
            let o_slide__server = (await f_v_api('GET', '/api/slide')).a_o_slide
                .find(function(o){ return o.s_name.toLowerCase() === s_name__lower; });
            if(o_slide__server) await f_v_api('DELETE', `/api/slide/${o_slide__server.n_id}`);
        } catch (o_error) {
            if(o_error.s_error !== 'slide_in_use') throw o_error;
        }
    });
};

// ─── Dataset ────────────────────────────────────────────────────────

let f_select_dataset__now = async function(n_id__dataset){
    await f_save_bbox__now();
    // boxes name classes of the dataset they were drawn for
    f_clear_stage();
    f_clear_thumbnail();
    o_state.o_ml_config.n_id__dataset = n_id__dataset;
    f_save_config();
    o_ml.a_o_class = [];
    o_ml.a_o_image = [];
    o_ml.n_id__class__active = 0;
    if(!n_id__dataset) return;
    let [o_dataset, o_image] = await Promise.all([
        f_v_api('GET', `/api/dataset/${n_id__dataset}`),
        f_v_api('GET', `/api/dataset/${n_id__dataset}/image`),
    ]);
    o_ml.a_o_class = o_dataset.a_o_class;
    o_ml.a_o_image = o_image.a_o_image;
    o_ml.n_id__class__active = o_ml.a_o_class.length ? o_ml.a_o_class[0].n_id : 0;
};

let f_select_dataset = async function(n_id__dataset){
    await f_b_run('load', 'Loading the dataset', function(){ return f_select_dataset__now(n_id__dataset); });
};

let f_refresh_dataset_list = async function(){
    o_ml.a_o_dataset = (await f_v_api('GET', '/api/dataset')).a_o_dataset;
};

// asked when the list of datasets opens: the image captured last of each
// dataset, and what others of the organisation changed meanwhile.
// with a server that is away the list works all the same.
let f_refresh_dataset_list__quiet = async function(){
    if(!o_ml.o_person) return;
    try {
        await f_refresh_dataset_list();
    } catch { /* the list stays as it was */ }
};

let f_create_dataset = async function(s_name){
    return await f_b_run('save', 'Creating the dataset', async function(){
        let o_dataset = await f_v_api('POST', '/api/dataset', { v_json: { s_name } });
        await f_refresh_dataset_list();
        await f_select_dataset__now(o_dataset.n_id);
    });
};

let f_rename_dataset = async function(o_dataset, s_name){
    return await f_b_run('save', 'Renaming the dataset', async function(){
        await f_v_api('PUT', `/api/dataset/${o_dataset.n_id}`, { v_json: { s_name } });
        await f_refresh_dataset_list();
    });
};

let f_delete_dataset = async function(o_dataset){
    return await f_b_run('save', 'Deleting the dataset', async function(){
        let b_current = o_dataset.n_id === o_state.o_ml_config.n_id__dataset;
        if(b_current) await f_save_bbox__now();
        await f_v_api('DELETE', `/api/dataset/${o_dataset.n_id}`);
        await f_refresh_dataset_list();
        // a model of this dataset stays and loses its reference
        o_ml.a_o_model = (await f_v_api('GET', '/api/model')).a_o_model;
        if(b_current) await f_select_dataset__now(o_ml.a_o_dataset.length ? o_ml.a_o_dataset[0].n_id : 0);
    });
};

// ─── Class ──────────────────────────────────────────────────────────

let f_o_class = function(n_id__class){
    return o_ml.a_o_class.find(function(o_class){ return o_class.n_id === n_id__class; }) || null;
};

let f_create_class = async function(s_name){
    let o_dataset = f_o_dataset__current();
    if(!o_dataset) return false;
    return await f_b_run('save', 'Creating the class', async function(){
        let o_class = await f_v_api('POST', `/api/dataset/${o_dataset.n_id}/class`, { v_json: { s_name } });
        o_ml.a_o_class.push(o_class);
        o_ml.n_id__class__active = o_class.n_id;
    });
};

// o_change: { s_name } or { s_color_hex }
let f_update_class = async function(o_class, o_change){
    let o_dataset = f_o_dataset__current();
    if(!o_dataset) return false;
    return await f_b_run('save', 'Changing the class', async function(){
        let o_class__saved = await f_v_api('PUT', `/api/dataset/${o_dataset.n_id}/class/${o_class.n_id}`, { v_json: o_change });
        Object.assign(o_class, o_class__saved);
    });
};

// f_b_confirm(n_cnt__bbox): asks whether a class with boxes may go, with its boxes
let f_delete_class = async function(o_class, f_b_confirm){
    let o_dataset = f_o_dataset__current();
    if(!o_dataset) return;
    await f_b_run('save', 'Deleting the class', async function(){
        await f_save_bbox__now();
        let s_path = `/api/dataset/${o_dataset.n_id}/class/${o_class.n_id}`;
        try {
            await f_v_api('DELETE', s_path);
        } catch (o_error) {
            if(o_error.s_error !== 'class_in_use') throw o_error;
            if(!f_b_confirm(o_error.o_body.n_cnt__bbox)) return;
            await f_v_api('DELETE', s_path + '?b_confirm=true');
        }
        o_ml.a_o_class = o_ml.a_o_class.filter(function(o){ return o.n_id !== o_class.n_id; });
        if(o_ml.n_id__class__active === o_class.n_id){
            o_ml.n_id__class__active = o_ml.a_o_class.length ? o_ml.a_o_class[0].n_id : 0;
        }
        // its boxes went with it
        for(let o_image of o_ml.a_o_image){
            o_image.a_o_bbox = o_image.a_o_bbox.filter(function(o_bbox){ return o_bbox.n_o_class_n_id !== o_class.n_id; });
        }
        o_ml.a_o_bbox = o_ml.a_o_bbox.filter(function(o_bbox){ return o_bbox.n_o_class_n_id !== o_class.n_id; });
        o_ml.a_o_bbox__parked = o_ml.a_o_bbox__parked.filter(function(o_bbox){ return o_bbox.n_o_class_n_id !== o_class.n_id; });
        o_ml.n_idx__bbox__selected = -1;
    });
};

// a_o_class: the classes of the dataset in their new order. the keys 1 to 9 follow it.
let f_reorder_class = async function(a_o_class){
    let o_dataset = f_o_dataset__current();
    if(!o_dataset) return false;
    let a_o_class__before = o_ml.a_o_class;
    o_ml.a_o_class = a_o_class;
    let b_done = await f_b_run('save', 'Changing the order of the classes', async function(){
        let a_n_id = a_o_class.map(function(o_class){ return o_class.n_id; });
        o_ml.a_o_class = (await f_v_api('PUT', `/api/dataset/${o_dataset.n_id}/class`, { v_json: { a_n_id } })).a_o_class;
    });
    if(!b_done) o_ml.a_o_class = a_o_class__before;
    return b_done;
};

// ─── Field of view ──────────────────────────────────────────────────
// Boxes drawn on the camera image belong to what the camera shows right now.
// They hold the field of view: X and Y stay where they are until "capture"
// has stored the boxes or they are given up.

let f_a_o_bbox__camera = function(){
    return o_ml.o_image ? o_ml.a_o_bbox__parked : o_ml.a_o_bbox;
};

let f_b_view__held = function(){
    return f_a_o_bbox__camera().length > 0;
};

// counts every time X or Y is sent on its way
let n_rev__view = 0;

// X or Y moves: what the model found on the camera image is no longer where it is shown
let f_leave_view = function(){
    n_rev__view++;
    if(!o_ml.o_image) o_ml.a_o_prediction = [];
};

// X or Y is moving right now, as far as the microcontroller has said
let f_b_view__moving = function(){
    if(!o_state.b_connected__esp) return false;
    return ['x', 'y'].some(function(s_axis){
        let n_motor = f_n_motor__axis(s_axis, true);
        let o_motor = n_motor === null ? null : o_state.a_o_motor[n_motor];
        return !!o_motor && !!o_motor.b_running;
    });
};

f_set_view_hold({
    f_b_active: f_b_view__held,
    f_on_leave: f_leave_view,
    // while one image after the other is taken no motor is moved by hand
    f_b_busy: function(){ return o_ml.o_progress__capture !== null; },
    // a move of X or Y was refused: ask whether the boxes may go
    f_on_refused: function(){ o_ml.b_ask__leave = true; },
});

// give up the boxes on the camera image; X and Y are free again
let f_discard_bbox__camera = function(){
    if(o_ml.o_image){
        o_ml.a_o_bbox__parked = [];
    } else {
        o_ml.a_o_bbox = [];
        o_ml.n_idx__bbox__selected = -1;
    }
    o_ml.b_ask__leave = false;
};

// ─── Still image on the stage ───────────────────────────────────────

let f_o_bbox__for_server = function(o_bbox){
    return {
        n_id: o_bbox.n_id,
        n_o_class_n_id: o_bbox.n_o_class_n_id,
        n_trn_x_center_nor: o_bbox.n_trn_x_center_nor,
        n_trn_y_center_nor: o_bbox.n_trn_y_center_nor,
        n_scl_x_nor: o_bbox.n_scl_x_nor,
        n_scl_y_nor: o_bbox.n_scl_y_nor,
    };
};

let f_replace_image__in_list = function(o_image){
    let n_idx = o_ml.a_o_image.findIndex(function(o){ return o.n_id === o_image.n_id; });
    if(n_idx === -1) o_ml.a_o_image.push(o_image);
    else o_ml.a_o_image[n_idx] = o_image;
    let o_dataset = f_o_dataset__current();
    if(o_dataset){
        o_dataset.n_cnt__image = o_ml.a_o_image.length;
        o_dataset.n_cnt__image__done = o_ml.a_o_image.filter(function(o){ return o.b_done; }).length;
    }
};

// o_image: row of the data server, o_blob: its image file
let f_show_still = function(o_image, o_blob){
    if(o_ml.s_url__still) URL.revokeObjectURL(o_ml.s_url__still);
    // the boxes of the camera image wait while a stored image is looked at
    let a_o_bbox__camera = f_a_o_bbox__camera();
    o_blob__still = o_blob;
    o_ml.s_url__still = URL.createObjectURL(o_blob);
    o_ml.n_scl_x__still = o_image.n_scl_x;
    o_ml.n_scl_y__still = o_image.n_scl_y;
    o_ml.o_image = o_image;
    o_ml.a_o_bbox = o_image.a_o_bbox.map(function(o_bbox){ return { ...o_bbox }; });
    o_ml.a_o_bbox__parked = a_o_bbox__camera;
    o_ml.n_idx__bbox__selected = -1;
    o_ml.s_status__save = '';
    o_ml.b_still = true;
};

// back to the live image, with the boxes that were drawn on the camera image
let f_close_still__now = function(){
    clearTimeout(n_id__timeout__save);
    b_dirty__bbox = false;
    let a_o_bbox__camera = f_a_o_bbox__camera();
    if(o_ml.s_url__still) URL.revokeObjectURL(o_ml.s_url__still);
    o_blob__still = null;
    o_ml.b_still = false;
    o_ml.s_url__still = '';
    o_ml.o_image = null;
    o_ml.a_o_bbox = a_o_bbox__camera;
    o_ml.a_o_bbox__parked = [];
    o_ml.a_o_prediction = [];
    o_ml.n_idx__bbox__selected = -1;
    o_ml.s_status__save = '';
};

// nothing on the stage but the live image, and no box on it
let f_clear_stage = function(){
    f_close_still__now();
    f_discard_bbox__camera();
};

// back to the live image; boxes that are not saved yet are saved first
let f_close_still = async function(){
    await f_save_bbox__now();
    f_close_still__now();
};

// ─── Saving boxes ───────────────────────────────────────────────────
// after every finished change the whole list of the image is sent, once the
// hand has rested for N_MS__SAVE_DELAY

let n_id__timeout__save = 0;
let b_dirty__bbox = false;
let n_rev__bbox = 0;
let o_promise__save = Promise.resolve();

let f_save_bbox = function(){
    // one save after the other, so an older list never overwrites a newer one
    o_promise__save = o_promise__save.then(async function(){
        let o_image = o_ml.o_image;
        let o_dataset = f_o_dataset__current();
        if(!o_image || !o_dataset || !b_dirty__bbox) return;
        let n_rev = n_rev__bbox;
        let a_o_bbox__sent = o_ml.a_o_bbox.map(f_o_bbox__for_server);
        o_ml.s_status__save = 'saving';
        try {
            let o_image__saved = await f_v_api('PUT', `/api/dataset/${o_dataset.n_id}/image/${o_image.n_id}`, { v_json: { a_o_bbox: a_o_bbox__sent } });
            f_replace_image__in_list(o_image__saved);
            if(!o_ml.o_image || o_ml.o_image.n_id !== o_image.n_id) return;
            if(n_rev !== n_rev__bbox){
                // changed again while saving: the timer of that change saves the newer list
                return;
            }
            // new boxes received their ids in the order they were sent
            let a_n_id__sent = a_o_bbox__sent.map(function(o){ return o.n_id; });
            let a_n_id__new = o_image__saved.a_o_bbox.map(function(o){ return o.n_id; })
                .filter(function(n_id){ return !a_n_id__sent.includes(n_id); });
            for(let o_bbox of o_ml.a_o_bbox){
                if(o_bbox.n_id === undefined || o_bbox.n_id === null) o_bbox.n_id = a_n_id__new.shift();
            }
            b_dirty__bbox = false;
            o_ml.s_status__save = 'saved';
        } catch (o_error) {
            // the boxes stay on the stage; "retry" sends them again
            if(o_ml.o_image && o_ml.o_image.n_id === o_image.n_id) o_ml.s_status__save = 'error';
            if(o_error && o_error.s_error === 'not_reachable') o_ml.b_reachable = false;
            f_fail('Saving the boxes', o_error);
        }
    });
    return o_promise__save;
};

// call after every finished change of o_ml.a_o_bbox
let f_bbox_changed = function(){
    if(!o_ml.o_image) return;
    b_dirty__bbox = true;
    n_rev__bbox++;
    o_ml.s_status__save = 'saving';
    clearTimeout(n_id__timeout__save);
    n_id__timeout__save = setTimeout(f_save_bbox, N_MS__SAVE_DELAY);
};

// save right now what is waiting to be saved
let f_save_bbox__now = async function(){
    clearTimeout(n_id__timeout__save);
    await f_save_bbox();
};

// ─── Images ─────────────────────────────────────────────────────────

let f_o_blob__thumbnail = async function(o_blob){
    try {
        let o_bitmap = await createImageBitmap(o_blob);
        let n_scl = Math.min(1, N_PX__THUMBNAIL / Math.max(o_bitmap.width, o_bitmap.height));
        let el_canvas = document.createElement('canvas');
        el_canvas.width = Math.max(1, Math.round(o_bitmap.width * n_scl));
        el_canvas.height = Math.max(1, Math.round(o_bitmap.height * n_scl));
        el_canvas.getContext('2d').drawImage(o_bitmap, 0, 0, el_canvas.width, el_canvas.height);
        o_bitmap.close();
        return await new Promise(function(f_resolve){ el_canvas.toBlob(f_resolve, 'image/jpeg', 0.8); });
    } catch {
        // an image without a thumbnail is still a complete image
        return null;
    }
};

// slide, microscope and calibration of the data server for what is on the stage now
let f_o_origin__ensured = async function(){
    let o_config = o_state.o_ml_config;
    let o_calibration__local = f_o_calibration__local();
    let o_slide = await f_v_api('POST', '/api/slide', { v_json: { s_name: f_s_name__slide() } });
    let o_microscope = await f_v_api('POST', '/api/microscope', { v_json: { s_name: o_config.s_name__microscope.trim() } });
    let o_calibration = await f_v_api('POST', `/api/microscope/${o_microscope.n_id}/calibration`, {
        v_json: { s_name: o_config.s_name__calibration.trim(), ...o_calibration__local },
    });
    // keep the suggestions of the two name fields up to date
    o_ml.a_o_microscope = (await f_v_api('GET', '/api/microscope')).a_o_microscope;
    return { o_slide, o_calibration };
};

// ─── Focus points ───────────────────────────────────────────────────
// Several focus points on one field of view: "capture" then takes one image
// at each of them, all with the same boxes.

// position of the focus motor in steps, null while it is not known
let f_n_step__focus = function(){
    let n_motor = f_n_motor__axis('z');
    let o_motor = n_motor === null ? null : o_state.a_o_motor[n_motor];
    return o_state.b_connected__esp && o_motor && Number.isSafeInteger(o_motor.n_position) ? o_motor.n_position : null;
};

let f_set_cnt__focus = function(n_cnt){
    n_cnt = Math.min(Math.max(Math.round(Number(n_cnt)) || 1, 1), N_CNT__FOCUS_MAX);
    o_ml.n_cnt__focus = n_cnt;
    o_ml.a_n_step__focus = Array.from({ length: n_cnt }, function(_v, n_idx){ return o_ml.a_n_step__focus[n_idx] ?? null; });
};

// the focus as it is now becomes focus point n_idx
let f_set_focus = function(n_idx){
    o_ml.a_n_step__focus[n_idx] = f_n_step__focus();
};

// the focus points belong to one field of view: call when X or Y has moved
let f_reset_focus = function(){
    o_ml.a_n_step__focus = o_ml.a_n_step__focus.map(function(){ return null; });
};

let f_move_focus = async function(n_step__target){
    let n_motor = f_n_motor__axis('z');
    let n_step__now = f_n_step__focus();
    if(n_motor === null || n_step__now === null) throw new Error('The focus motor is not available. Connect the microcontroller.');
    let n_step = n_step__target - n_step__now;
    if(n_step === 0) return;
    let n_id__timeout = 0;
    try {
        let n_step__reached = await Promise.race([
            // the only move that is let through while the images are taken
            f_v_command__own(function(){ return f_send_esp_move_step(n_motor, n_step, N_RPM__FOCUS); }),
            new Promise(function(_f_resolve, f_reject){
                n_id__timeout = setTimeout(function(){
                    f_send_esp_stop(n_motor);
                    f_reject(new Error('The focus motor did not reach the focus point in time.'));
                }, N_MS__FOCUS_TIMEOUT);
            }),
        ]);
        if(n_step__reached !== n_step__target) throw new Error('The focus motor stopped before it reached the focus point.');
        o_state.a_o_motor[n_motor].n_position = n_step__reached;
    } finally {
        clearTimeout(n_id__timeout);
    }
};

// every motor at rest and its position known: what still runs is stopped. the
// microcontroller answers "stopAll" and "status" with one report each. the
// second one is waited for: the first may still answer an older question.
let f_rest_motor = function(){
    return new Promise(function(f_resolve, f_reject){
        let n_cnt__report = 0;
        let f_unregister = function(){};
        let n_id__timeout = setTimeout(function(){
            f_unregister();
            f_reject(new Error('The motors did not come to rest. Check the microcontroller.'));
        }, N_MS__REST_TIMEOUT);
        f_unregister = f_register_esp_handler(function(o_data){
            if(o_data.type !== 'status' || !o_data.a_o_motor) return;
            n_cnt__report++;
            if(n_cnt__report < 2 || o_data.a_o_motor.some(function(o_motor){ return o_motor.b_running; })) return;
            f_unregister();
            clearTimeout(n_id__timeout);
            f_resolve();
        });
        f_send_esp({ command: 'stopAll' });
        f_send_esp({ command: 'status' });
    });
};

// ─── Capture ────────────────────────────────────────────────────────

// one image with its boxes goes to the dataset, finished. an image without
// its boxes would be a wrong example: when the boxes fail, the image goes too.
let f_o_image__stored = async function(o_dataset, o_origin, o_blob, o_metadata, a_o_bbox){
    let o_form = new FormData();
    o_form.set('image', o_blob, 'image.png');
    let o_blob__thumbnail = await f_o_blob__thumbnail(o_blob);
    if(o_blob__thumbnail) o_form.set('thumbnail', o_blob__thumbnail, 'thumbnail.jpg');
    o_form.set('metadata', JSON.stringify({
        n_o_slide_n_id: o_origin.o_slide.n_id,
        n_o_calibration_n_id: o_origin.o_calibration.n_id,
        ...o_metadata,
    }));
    let s_path = `/api/dataset/${o_dataset.n_id}/image`;
    let o_image = await f_v_api('POST', s_path, { o_form });
    try {
        return await f_v_api('PUT', `${s_path}/${o_image.n_id}`, { v_json: { a_o_bbox, b_done: true } });
    } catch (o_error) {
        try { await f_v_api('DELETE', `${s_path}/${o_image.n_id}`); } catch { /* reported with the error below */ }
        throw o_error;
    }
};

// a capture that takes several images was asked to stop: it does not go on
let f_check_cancel = function(){
    if(o_ml.o_progress__capture && o_ml.o_progress__capture.b_cancel) throw new Error('The capture was cancelled.');
};

// stop a capture that takes several images. nothing of it is kept, the boxes stay on the stage.
let f_cancel_capture = function(){
    let o_progress = o_ml.o_progress__capture;
    if(!o_progress || o_progress.b_cancel || o_progress.b_return) return;
    o_progress.b_cancel = true;
    // the focus motor may be on its way to the next focus point
    let n_motor = f_n_motor__axis('z');
    if(n_motor !== null) f_send_esp_stop(n_motor);
};

// finish the annotation of what the camera shows: the camera image goes to
// the dataset with the boxes drawn on it, one image for every focus point.
// an image without a box is an example without objects.
// with several focus points this takes a while: o_ml.o_progress__capture says
// how far it is, no motor is moved by hand, and f_cancel_capture stops it.
let f_capture = async function(){
    let b_cancel = false;
    let b_done = await f_b_run('capture', 'Taking the image', async function(){
        let a_s_reason = f_a_s_reason__capture();
        if(a_s_reason.length) throw new Error(a_s_reason[0]);
        let o_dataset = f_o_dataset__current();
        let a_o_bbox = o_ml.a_o_bbox.map(f_o_bbox__for_server);
        let a_n_step__focus = o_ml.n_cnt__focus > 1 ? o_ml.a_n_step__focus.slice(0, o_ml.n_cnt__focus) : [null];
        if(a_n_step__focus.length > 1) o_ml.o_progress__capture = { n_idx: 0, n_cnt: a_n_step__focus.length, b_return: false, b_cancel: false };
        let o_progress = o_ml.o_progress__capture;
        let n_step__start = null;
        let s_path = `/api/dataset/${o_dataset.n_id}/image`;
        let a_o_image = [];
        try {
            if(o_progress){
                // a motor that is still running would blur the images and take the focus points with it
                await f_rest_motor();
                n_step__start = f_n_step__focus();
            }
            let o_origin = await f_o_origin__ensured();
            for(let n_idx = 0; n_idx < a_n_step__focus.length; n_idx++){
                f_check_cancel();
                if(o_progress) o_progress.n_idx = n_idx;
                if(a_n_step__focus[n_idx] !== null){
                    await f_move_focus(a_n_step__focus[n_idx]);
                    await new Promise(function(f_resolve){ setTimeout(f_resolve, N_MS__FOCUS_SETTLE); });
                    f_check_cancel();
                }
                let o_metadata = f_o_metadata__now();
                let o_blob = (await f_o_capture__frame({})).o_blob;
                f_check_cancel();
                a_o_image.push(await f_o_image__stored(o_dataset, o_origin, o_blob, o_metadata, a_o_bbox));
            }
            f_check_cancel();
        } catch (o_error) {
            // all or nothing: the next try must not take the first focus points a second time
            let n_cnt__left = 0;
            for(let o_image of a_o_image){
                try {
                    await f_v_api('DELETE', `${s_path}/${o_image.n_id}`);
                } catch {
                    // the image stays in the dataset: the list shows it
                    f_replace_image__in_list(o_image);
                    n_cnt__left++;
                }
            }
            // a focus move that was stopped by "cancel" ends with an error of its own
            b_cancel = !!o_progress && o_progress.b_cancel;
            if(!b_cancel) throw o_error;
            if(n_cnt__left > 0) throw new Error('The capture was cancelled, but ' + n_cnt__left + ' of its images could not be removed from the dataset. Delete them in the image list.');
        } finally {
            if(o_progress){
                o_progress.b_return = true;
                // the focus goes back to where it was, from where the motor stands now
                if(n_step__start !== null) await f_rest_motor().then(function(){ return f_move_focus(n_step__start); }).catch(function(){});
                o_ml.o_progress__capture = null;
            }
        }
        if(b_cancel){
            o_state.a_o_toast.push(f_o_toast('Capture cancelled. No image was stored.', 'info', Date.now(), 5000));
            return;
        }
        for(let o_image of a_o_image) f_replace_image__in_list(o_image);
        // the boxes are stored: the field of view is free again
        f_clear_stage();
    });
    return b_done && !b_cancel;
};

let f_open_image = async function(o_image){
    let o_dataset = f_o_dataset__current();
    if(!o_dataset) return;
    await f_b_run('load', 'Opening the image', async function(){
        await f_save_bbox__now();
        let { o_blob } = await f_v_api('GET', `/api/dataset/${o_dataset.n_id}/image/${o_image.n_id}/image.png`, { b_blob: true });
        o_ml.a_o_prediction = [];
        f_show_still(o_image, o_blob);
        o_ml.b_library = false;
    });
};

// b_done true: the annotation of the image on the stage is finished, back to the live image
let f_set_done = async function(b_done){
    let o_image = o_ml.o_image;
    let o_dataset = f_o_dataset__current();
    if(!o_image || !o_dataset) return;
    await f_b_run('save', 'Marking the image', async function(){
        await f_save_bbox__now();
        if(o_ml.s_status__save === 'error') throw new Error('The boxes are not saved yet. Use retry first.');
        let o_image__saved = await f_v_api('PUT', `/api/dataset/${o_dataset.n_id}/image/${o_image.n_id}`, { v_json: { b_done } });
        f_replace_image__in_list(o_image__saved);
        if(b_done) f_close_still__now();
        else o_ml.o_image = o_image__saved;
    });
};

let f_delete_image = async function(o_image){
    let o_dataset = f_o_dataset__current();
    if(!o_dataset) return;
    await f_b_run('save', 'Deleting the image', async function(){
        if(o_ml.o_image && o_ml.o_image.n_id === o_image.n_id) f_close_still__now();
        await f_v_api('DELETE', `/api/dataset/${o_dataset.n_id}/image/${o_image.n_id}`);
        o_ml.a_o_image = o_ml.a_o_image.filter(function(o){ return o.n_id !== o_image.n_id; });
        o_dataset.n_cnt__image = o_ml.a_o_image.length;
        o_dataset.n_cnt__image__done = o_ml.a_o_image.filter(function(o){ return o.b_done; }).length;
    });
};

// ─── Thumbnails ─────────────────────────────────────────────────────

let o_b_loading__thumbnail = {};

let f_clear_thumbnail = function(){
    for(let s_url of Object.values(o_ml.o_s_url__thumbnail)) URL.revokeObjectURL(s_url);
    o_ml.o_s_url__thumbnail = {};
    o_b_loading__thumbnail = {};
};

// fills o_ml.o_s_url__thumbnail[n_id]; an image without a thumbnail shows itself.
// o_image: an image of any dataset of the organisation, { n_id, n_o_dataset_n_id } is enough
let f_load_thumbnail = async function(o_image){
    if(!o_ml.o_person || o_ml.o_s_url__thumbnail[o_image.n_id] || o_b_loading__thumbnail[o_image.n_id]) return;
    o_b_loading__thumbnail[o_image.n_id] = true;
    let s_path = `/api/dataset/${o_image.n_o_dataset_n_id}/image/${o_image.n_id}`;
    try {
        let o_result;
        try {
            o_result = await f_v_api('GET', s_path + '/thumbnail.jpg', { b_blob: true });
        } catch (o_error) {
            if(o_error.n_status !== 404) throw o_error;
            o_result = await f_v_api('GET', s_path + '/image.png', { b_blob: true });
        }
        // the thumbnails may have been cleared while this one was on its way
        if(o_b_loading__thumbnail[o_image.n_id]) o_ml.o_s_url__thumbnail[o_image.n_id] = URL.createObjectURL(o_result.o_blob);
    } catch {
        delete o_b_loading__thumbnail[o_image.n_id];
    }
};

// address of the thumbnail of an image, '' while it is not loaded. asking loads it.
// o_image may be null: an object without an image has no thumbnail.
let f_s_url__thumbnail = function(o_image){
    if(!o_image) return '';
    f_load_thumbnail(o_image);
    return o_ml.o_s_url__thumbnail[o_image.n_id] || '';
};

// ─── Export ─────────────────────────────────────────────────────────

// the archive can be many GB, so it is not loaded into the page: the data
// server hands out a ticket and the browser downloads it straight to the disk
let f_export = async function(){
    let o_dataset = f_o_dataset__current();
    if(!o_dataset) return false;
    return await f_b_run('export', 'The export', async function(){
        await f_save_bbox__now();
        let o_ticket = await f_v_api('POST', `/api/dataset/${o_dataset.n_id}/export`);
        let el_a = document.createElement('a');
        el_a.href = f_s_url__dataserver() + o_ticket.s_path;
        // the data server names the file
        el_a.download = '';
        el_a.click();
        o_state.a_o_toast.push(f_o_toast('Export of ' + o_dataset.n_cnt__image__done + ' images started. It appears in the downloads of the browser.', 'success', Date.now(), 6000));
    });
};

// ─── Training ───────────────────────────────────────────────────────

let n_id__timeout__job = 0;

let f_b_job__active = function(){
    return !!o_ml.o_job && (o_ml.o_job.s_status === 'preparing' || o_ml.o_job.s_status === 'running');
};

// ask for the progress while a training runs
let f_watch_job = function(){
    clearTimeout(n_id__timeout__job);
    if(!f_b_job__active()) return;
    n_id__timeout__job = setTimeout(async function(){
        try {
            let o_job = (await f_v_api('GET', '/api/train')).o_job;
            o_ml.o_job = o_job;
            if(o_job && o_job.s_status === 'done'){
                o_ml.a_o_model = (await f_v_api('GET', '/api/model')).a_o_model;
                o_state.o_ml_config.n_id__model = o_job.n_o_model_n_id;
                f_save_config();
                o_state.a_o_toast.push(f_o_toast('Training finished: model "' + o_job.s_name + '"', 'success', Date.now(), 8000));
            }
            if(o_job && o_job.s_status === 'error') f_fail('The training', new Error(o_job.s_message));
        } catch { /* the next round tries again */ }
        f_watch_job();
    }, N_MS__JOB_INTERVAL);
};

let f_train = async function(){
    let o_dataset = f_o_dataset__current();
    if(!o_dataset) return false;
    return await f_b_run('train', 'Starting the training', async function(){
        await f_save_bbox__now();
        let o_result = await f_v_api('POST', `/api/dataset/${o_dataset.n_id}/train`, { v_json: { n_epoch: o_state.o_ml_config.n_epoch } });
        o_ml.o_job = o_result.o_job;
        f_watch_job();
    });
};

let f_cancel_train = async function(){
    await f_b_run('train', 'Cancelling the training', async function(){
        await f_v_api('DELETE', '/api/train');
        o_ml.o_job = (await f_v_api('GET', '/api/train')).o_job;
        f_watch_job();
    });
};

// ─── Model, prediction ──────────────────────────────────────────────

let f_upload_model = async function(o_file){
    return await f_b_run('save', 'Uploading the model', async function(){
        let o_form = new FormData();
        o_form.set('model', o_file, o_file.name);
        o_form.set('s_name', o_file.name.replace(/\.pt$/i, ''));
        if(o_state.o_ml_config.n_id__dataset) o_form.set('n_o_dataset_n_id', String(o_state.o_ml_config.n_id__dataset));
        let o_model = await f_v_api('POST', '/api/model', { o_form });
        o_ml.a_o_model.unshift(o_model);
        o_state.o_ml_config.n_id__model = o_model.n_id;
        f_save_config();
    });
};

let f_select_model = function(n_id__model){
    o_state.o_ml_config.n_id__model = n_id__model;
    f_save_config();
};

let f_rename_model = async function(o_model, s_name){
    return await f_b_run('save', 'Renaming the model', async function(){
        let o_model__saved = await f_v_api('PUT', `/api/model/${o_model.n_id}`, { v_json: { s_name } });
        let n_idx = o_ml.a_o_model.findIndex(function(o){ return o.n_id === o_model.n_id; });
        if(n_idx !== -1) o_ml.a_o_model[n_idx] = o_model__saved;
    });
};

let f_delete_model = async function(o_model){
    await f_b_run('save', 'Deleting the model', async function(){
        await f_v_api('DELETE', `/api/model/${o_model.n_id}`);
        o_ml.a_o_model = o_ml.a_o_model.filter(function(o){ return o.n_id !== o_model.n_id; });
        // the chosen model went: the newest one takes its place
        if(o_state.o_ml_config.n_id__model === o_model.n_id) f_select_model(o_ml.a_o_model.length ? o_ml.a_o_model[0].n_id : 0);
    });
};

// apply the chosen model to what the stage shows: the stored image, or the
// camera image as it is right now. predictions are shown, never stored. on the
// camera image they stay until X or Y moves (f_leave_view).
let f_detect = async function(){
    let n_id__model = o_state.o_ml_config.n_id__model;
    return await f_b_run('detect', 'The detection', async function(){
        if(!n_id__model) throw new Error('Train or upload a model first.');
        let n_id__image = o_ml.o_image ? o_ml.o_image.n_id : 0;
        let n_rev = n_rev__view;
        let o_blob = o_blob__still;
        if(!n_id__image){
            if(!o_state.b_streaming__webcam) throw new Error('Select a camera in the top bar.');
            if(f_b_view__moving()) throw new Error('X or Y is moving. Wait until the stage stands still.');
            o_blob = (await f_o_capture__frame({ b_flash: false })).o_blob;
        }
        let o_result = await f_v_api('POST', `/api/model/${n_id__model}/inference`, { o_blob });
        // the stage shows something else by now: the answer belongs to what it showed before
        if((o_ml.o_image ? o_ml.o_image.n_id : 0) !== n_id__image || (!n_id__image && n_rev !== n_rev__view)) return;
        o_ml.a_o_prediction = o_result.a_o_prediction;
        o_ml.b_prediction = true;
        if(!o_result.a_o_prediction.length) o_state.a_o_toast.push(f_o_toast('The model found nothing on this image.', 'info', Date.now(), 5000));
    });
};

// ─── Watching the session ───────────────────────────────────────────
// the top bar shows the login whether the window is open or not

let n_id__interval__status = 0;

let f_watch_session = function(b_watch){
    clearInterval(n_id__interval__status);
    if(!b_watch) return;
    f_refresh_session();
    n_id__interval__status = setInterval(f_refresh_session, N_MS__STATUS_INTERVAL);
};

export {
    o_ml,
    N_BYTE__FREE_WARN,
    N_BYTE__FREE_MIN,
    f_save_config,
    f_camera_changed,
    f_o_calibration__local,
    f_o_slide__current,
    f_s_name__slide,
    f_o_dataset__current,
    f_a_s_reason__capture,
    f_refresh_status,
    f_login,
    f_logout,
    f_refresh_slide_list,
    f_o_image__of_slide,
    f_select_slide,
    f_create_slide,
    f_rename_slide,
    f_delete_slide,
    f_b_view__held,
    f_discard_bbox__camera,
    f_select_dataset,
    f_refresh_dataset_list__quiet,
    f_create_dataset,
    f_rename_dataset,
    f_delete_dataset,
    f_o_class,
    f_create_class,
    f_update_class,
    f_delete_class,
    f_reorder_class,
    f_close_still,
    f_bbox_changed,
    f_save_bbox__now,
    N_CNT__FOCUS_MAX,
    f_n_step__focus,
    f_set_cnt__focus,
    f_set_focus,
    f_reset_focus,
    f_capture,
    f_cancel_capture,
    f_open_image,
    f_set_done,
    f_delete_image,
    f_load_thumbnail,
    f_s_url__thumbnail,
    f_export,
    f_b_job__active,
    f_train,
    f_cancel_train,
    f_upload_model,
    f_select_model,
    f_rename_model,
    f_delete_model,
    f_detect,
    f_watch_session,
};
