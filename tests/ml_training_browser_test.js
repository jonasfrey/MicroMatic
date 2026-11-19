// The ML Training window and its part of the top bar in a real browser against
// a real data server: the smart selector on its own, login and slide in the top
// bar, dataset, classes and their order, boxes drawn on the live image with the
// mouse, the edit mode of a box, the held field of view, capture, focus points,
// image library, training, the model in its smart selector, prediction on the
// live image, export, logout.
// Camera, motors and the local application server are replaced by a small
// index.js; the YOLO worker by dataserver/test/fake_yolo_worker.py.
import assert from 'node:assert/strict';
import { f_o_dataserver__start, f_o_request, f_o_login } from '../dataserver/test/helper.js';
import { f_s_text__short } from '../webserved_dir/smart_selector.module.js';

let f_o_response__javascript = s_text => new Response(s_text, { headers: { 'content-type': 'text/javascript' } });

let s_index = `
    import { reactive } from './lib/vue.esm-browser.js';
    import { f_b_command__refused } from './view_hold.module.js';
    export const o_saved = {};
    export const o_state = reactive({
        b_applied__setting: true,
        o_panel_visibility: { ml_training: false, scale: false, setup: false, slide_library: false },
        o_ml_config: { n_id__dataset: 0, s_name__microscope: '', s_name__calibration: '', n_id__model: 0, n_epoch: 50 },
        o_calibration: { n_um__per_px: 0, o_camera__scale: null },
        a_n_step__per_px: [0, 0, 0],
        o_motor__axis: { x: 0, y: 1, z: 2 },
        a_o_motor: [{ n_position: 722 }, { n_position: 1740 }, { n_position: 659 }],
        b_connected__esp: true,
        b_streaming__webcam: false,
        s_id__webcam_device: 'test',
        a_o_device__webcam: [{ deviceId: 'test', label: 'HY-500B (0ac8:3420)' }],
        o_camera: { n_time__exposure: 157, a_o_control: [{ s_name: 'gain', n_val: 20 }] },
        a_o_project: [],
        a_o_slide: [],
        n_id__project__current: 0,
        n_id__slide__current: 0,
        a_o_toast: [],
        a_o_setting: [],
        b_input_suspended: false,
    });
    export function f_save_setting__debounced(s_key, v_value) { o_saved[s_key] = JSON.parse(JSON.stringify(v_value)); }
    export function f_n_motor__axis(s_axis) { return o_state.o_motor__axis[s_axis]; }
    export function f_save_library_current() { o_saved.o_library__current = { n_id__project: o_state.n_id__project__current, n_id__slide: o_state.n_id__slide__current }; }
    // the database of the local application: what the slide library needs of it
    let n_id__row = 0;
    export async function f_send_wsmsg_with_response(o_wsmsg) {
        let [s_operation, s_name_table, o_row, o_change] = o_wsmsg.v_data;
        if(s_operation === 'create') return { v_result: { n_id: ++n_id__row, ...o_row } };
        if(s_operation === 'update') return { v_result: { ...o_row, ...o_change } };
        if(s_operation === 'delete') return { v_result: true };
        return { error: 'the test does not know: ' + s_operation + ' ' + s_name_table };
    }
    // the "microcontroller": a move takes o_esp.n_ms__move and ends where it was sent to, unless the motor
    // is locked. stopped on the way the motor stands halfway, and the application
    // only learns where when the next status report arrives.
    export const o_esp = { n_ms__move: 10, a_s_command: [] };
    export const a_o_move = [];
    let a_f_handler = [];
    let o_move = null;
    let o_position__unreported = null;
    export function f_register_esp_handler(f_handler) {
        a_f_handler.push(f_handler);
        return () => { a_f_handler = a_f_handler.filter(f => f !== f_handler); };
    }
    let f_report = () => setTimeout(() => {
        if(o_position__unreported) o_state.a_o_motor[o_position__unreported.n_motor].n_position = o_position__unreported.n_position;
        o_position__unreported = null;
        let o_data = { type: 'status', a_o_motor: o_state.a_o_motor.map(o_motor => ({ b_running: false, n_position: o_motor.n_position })) };
        for(let f_handler of [...a_f_handler]) f_handler(o_data);
    }, 5);
    export function f_send_esp(o_msg) {
        if(f_b_command__refused(o_msg, o_state.o_motor__axis)) return;
        o_esp.a_s_command.push(o_msg.command);
        if(o_msg.command === 'stopAll' && o_move) o_move.f_stop();
        if(o_msg.command === 'stopAll' || o_msg.command === 'status') f_report();
    }
    export function f_send_esp_move_step(n_motor, n_step) {
        if(f_b_command__refused({ motor: n_motor, command: 'moveSteps' }, o_state.o_motor__axis)) return Promise.reject(new Error('This motor is locked while the field of view is held'));
        a_o_move.push({ n_motor, n_step });
        return new Promise(f_resolve => {
            let n_position = o_state.a_o_motor[n_motor].n_position;
            let n_id__timeout = setTimeout(() => { o_move = null; f_resolve(n_position + n_step); }, o_esp.n_ms__move);
            o_move = { n_motor, f_stop() {
                clearTimeout(n_id__timeout);
                o_move = null;
                o_position__unreported = { n_motor, n_position: n_position + Math.trunc(n_step / 2) };
                f_resolve(o_position__unreported.n_position);
            } };
        });
    }
    export function f_send_esp_stop(n_motor) {
        o_esp.a_s_command.push('stop');
        if(o_move && o_move.n_motor === n_motor) o_move.f_stop();
    }
`;

// the "camera": a 640 x 480 frame with two shapes, numbered so that every capture differs
let s_capture = `
    export let n_cnt__capture = 0;
    export async function f_o_capture__frame() {
        n_cnt__capture++;
        let el_canvas = document.createElement('canvas');
        el_canvas.width = 640; el_canvas.height = 480;
        let o_ctx = el_canvas.getContext('2d');
        o_ctx.fillStyle = '#d9d2c0'; o_ctx.fillRect(0, 0, 640, 480);
        o_ctx.fillStyle = '#6b4f2a'; o_ctx.beginPath(); o_ctx.ellipse(240, 180, 70, 40, 0.5, 0, 7); o_ctx.fill();
        o_ctx.fillStyle = '#8fa9c9'; o_ctx.beginPath(); o_ctx.arc(470, 330, 45, 0, 7); o_ctx.fill();
        o_ctx.fillStyle = '#000'; o_ctx.font = '20px sans-serif'; o_ctx.fillText('frame ' + n_cnt__capture, 12, 28);
        let o_blob = await new Promise(f_resolve => el_canvas.toBlob(f_resolve, 'image/png'));
        return { o_blob, n_scl_x: 640, n_scl_y: 480 };
    }
`;

let s_page = `<!doctype html><meta charset="utf-8"><title>ML Training test</title>
    <link rel="stylesheet" href="/index.css">
    <video id="webcamVideo"></video>
    <div class="toolbar"><div class="toolbar-row toolbar-row--primary"><div class="toolbar-group toolbar-group--ml" id="toolbar-ml"></div></div></div>
    <div id="app"></div>
    <div id="demo" style="position: fixed; left: 300px; top: 200px;"></div>
    <script type="module" src="/test.js"></script>`;

let s_test = `
    import { createApp, nextTick, reactive } from './lib/vue.esm-browser.js';
    import { o_component__ml_training } from './o_component__ml_training.js';
    import { o_component__smart_selector } from './o_component__smart_selector.js';
    import { f_install_control_catalog } from './control_catalog.module.js';
    import { f_install_tooltips } from './tooltips.module.js';
    import { o_state, o_saved, a_o_move, o_esp } from './index.js';
    import { o_ml } from './o_ml.module.js';
    document.documentElement.style.setProperty('--topbar-h', '54px');
    let a_s_error = [];
    let o_app = createApp({ components: { ml: o_component__ml_training }, template: '<ml />' });
    f_install_control_catalog(o_app, { components: { o_component__ml_training }, openPanel() {}, effects: [] });
    o_app.config.warnHandler = s_message => a_s_error.push('warn: ' + s_message);
    o_app.config.errorHandler = o_error => a_s_error.push('error: ' + (o_error.stack || o_error));
    window.addEventListener('unhandledrejection', o_evt => a_s_error.push('rejection: ' + (o_evt.reason?.stack || o_evt.reason)));
    o_app.mount('#app');
    f_install_tooltips();
    // dialogs answer by themselves and are recorded
    let a_s_dialog = [];
    window.confirm = s_message => { a_s_dialog.push(s_message); return true; };
    window.alert = s_message => { a_s_dialog.push(s_message); };
    window.prompt = (s_message, s_default) => { a_s_dialog.push(s_message); return window.s_answer__prompt ?? s_default; };
    let a_s_download = [];
    HTMLAnchorElement.prototype.click = function() { a_s_download.push(this.href); };

    // a smart selector on its own, over objects with a name and a number
    let o_demo = reactive({ a_o_object: [{ n_id: 1, s_name: 'value 1', n_number: 0.1 }, { n_id: 2, s_name: 'data value that is very very long', n_number: 0.5 }], n_id: 2 });
    let o_app__demo = null;
    let f_mount_demo = () => {
        o_app__demo = createApp({
            components: { smart_selector: o_component__smart_selector },
            data: () => ({ o_demo, a_o_field: [{ s_key: 's_name', s_label: 'name' }, { s_key: 'n_number', s_label: 'number', s_type: 'number', n_min: 0, n_max: 1, n_step: 0.1 }] }),
            methods: {
                f_select(o_object) { o_demo.n_id = o_object.n_id; },
                async f_b_create(o_value) {
                    if(o_value.s_name === 'refused') return false;
                    o_demo.a_o_object.push({ n_id: 10 + o_demo.a_o_object.length, ...o_value });
                    o_demo.n_id = o_demo.a_o_object.at(-1).n_id;
                    return true;
                },
                async f_b_update(o_object, o_value) { Object.assign(o_object, o_value); return true; },
                f_delete(o_object) {
                    o_demo.a_o_object = o_demo.a_o_object.filter(o => o.n_id !== o_object.n_id);
                    if(o_demo.n_id === o_object.n_id) o_demo.n_id = 0;
                },
                // only some rows have something to say below their value
                f_s_detail(o_object) { return o_object.n_number > 0.2 ? 'number ' + o_object.n_number : ''; },
            },
            template: '<smart_selector s_name__kind="thing" s_icon="tag" s_icon__option="tag" :a_o_object="o_demo.a_o_object" :n_id="o_demo.n_id" :a_o_field="a_o_field" :f_s_detail="f_s_detail" :f_select="f_select" :f_b_create="f_b_create" :f_b_update="f_b_update" :f_delete="f_delete" />',
        });
        o_app__demo.config.warnHandler = s_message => a_s_error.push('warn: ' + s_message);
        o_app__demo.config.errorHandler = o_error => a_s_error.push('error: ' + (o_error.stack || o_error));
        o_app__demo.mount('#demo');
    };

    let f_tick = async () => { await nextTick(); await new Promise(f_resolve => setTimeout(f_resolve, 30)); };
    let f_b_visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    let f_el = s_selector => [...document.querySelectorAll(s_selector)].find(f_b_visible);
    let f_el_button = s_label => [...document.querySelectorAll('button')].find(el => f_b_visible(el) && (el.getAttribute('aria-label') || el.textContent.trim()) === s_label);
    let s_selector__field = '.smart-selector-form input[type="text"]';
    window.o_test = {
        o_state, o_ml, o_saved, o_demo, a_o_move, o_esp, a_s_error, a_s_dialog, a_s_download, f_tick, f_el, f_el_button, f_mount_demo,
        f_unmount_demo() { o_app__demo.unmount(); },
        f_check() { if(a_s_error.length) throw new Error(a_s_error.join('\\n')); },
        async f_wait(f_b_done, s_what, n_ms = 8000) {
            let n_ts_ms__end = Date.now() + n_ms;
            while(Date.now() < n_ts_ms__end) { if(await f_b_done()) { await f_tick(); this.f_check(); return; } await new Promise(f_resolve => setTimeout(f_resolve, 25)); }
            this.f_check();
            throw new Error('Timed out waiting for: ' + s_what + ' (activity "' + o_ml.s_activity + '", error "' + o_ml.s_error + '")');
        },
        async f_click(s_label) {
            let el = f_el_button(s_label);
            if(!el) throw new Error('No visible button: ' + s_label);
            if(el.disabled) throw new Error('Button is disabled: ' + s_label + ' (' + (el.dataset.tooltip || '') + ')');
            el.click();
            await f_tick();
        },
        async f_type(s_selector, s_value, s_key = '') {
            let el = f_el(s_selector);
            if(!el) throw new Error('No visible field: ' + s_selector);
            el.focus();
            el.value = s_value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            if(s_key) { el.dispatchEvent(new KeyboardEvent('keydown', { key: s_key, bubbles: true })); el.dispatchEvent(new KeyboardEvent('keyup', { key: s_key, bubbles: true })); }
            el.blur();
            await f_tick();
        },
        // smart selector: "+" and a name, "edit" and another name
        async f_create(s_kind, s_name) {
            await this.f_click('New ' + s_kind);
            await this.f_type(s_selector__field, s_name);
            await this.f_click('create');
        },
        async f_update(s_kind, s_name) {
            await this.f_click('Edit ' + s_kind);
            await this.f_type(s_selector__field, s_name);
            await this.f_click('update');
        },
        // the open list of a smart selector, row by row: the value, and what stands in front of it
        f_a_o_option() {
            return [...document.querySelectorAll('.smart-selector-list .smart-selector-option')].map(el => ({
                s_name: el.querySelector('.smart-selector-option-value').textContent.trim(),
                b_active: el.classList.contains('active'),
                b_image: !!el.querySelector('img'),
            }));
        },
        async f_choose(s_name) {
            let el = [...document.querySelectorAll('.smart-selector-list .smart-selector-option')].find(el => el.querySelector('.smart-selector-option-value').textContent.trim() === s_name);
            if(!el) throw new Error('Not in the list: ' + s_name);
            el.click();
            await f_tick();
        },
        // what the top bar shows, piece by piece: a field as [its text], a smart selector as {its value}
        f_s_bar() {
            return [...document.querySelectorAll('#toolbar-ml .ml-chip, #toolbar-ml .smart-selector')].filter(f_b_visible).map(el => {
                if(el.classList.contains('smart-selector')) return '{' + el.querySelector('.smart-selector-value').textContent.trim() + '}';
                let el_input = el.querySelector('input');
                return el_input ? '[' + el_input.value + ']' : el.textContent.trim();
            }).join(' | ');
        },
        // a camera image of this size on the video element, as a started camera delivers it
        async f_show_camera(n_scl_x, n_scl_y) {
            let el_canvas = document.createElement('canvas');
            el_canvas.width = n_scl_x; el_canvas.height = n_scl_y;
            let o_ctx = el_canvas.getContext('2d');
            let el_video = document.querySelector('#webcamVideo');
            el_video.muted = true;
            el_video.srcObject = el_canvas.captureStream();
            el_video.play().catch(() => {});
            // frames only flow while the canvas is painted
            let n_cnt = 0;
            let n_id__interval = setInterval(() => { o_ctx.fillStyle = n_cnt++ % 2 ? '#888' : '#999'; o_ctx.fillRect(0, 0, n_scl_x, n_scl_y); }, 30);
            try { await this.f_wait(() => el_video.videoWidth === n_scl_x && el_video.videoHeight === n_scl_y, 'camera image ' + n_scl_x + ' x ' + n_scl_y); }
            finally { clearInterval(n_id__interval); }
        },
        async f_key(s_key, el = null) {
            if(!el) document.activeElement?.blur?.();
            (el || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: s_key, bubbles: true }));
            await f_tick();
        },
        // screen position of a point of the image on the stage, given normalised 0..1
        f_o_point(n_x, n_y) {
            let o_rect = document.querySelector('.ml-view').getBoundingClientRect();
            return { n_x: o_rect.left + n_x * o_rect.width, n_y: o_rect.top + n_y * o_rect.height };
        },
        // screen position of the middle of a button, by its label
        f_o_point__button(s_label) {
            let el = f_el_button(s_label);
            if(!el) throw new Error('No visible button: ' + s_label);
            let o_rect = el.getBoundingClientRect();
            return { n_x: o_rect.left + o_rect.width / 2, n_y: o_rect.top + o_rect.height / 2 };
        },
        // the boxes on the stage as their labels say it
        f_a_s_box() {
            return [...document.querySelectorAll('.ml-bbox-tag .ml-bbox-label')].map(el => el.textContent.trim());
        },
        f_s_status() {
            let el = f_el('.ml-image-action .cockpit-status');
            return el ? el.textContent.trim() : '';
        },
        // ask the "microcontroller" for a move the way a jog, a scan or the map does
        // the dashed lines that continue the edges of the box in edit mode: where they lie on the
        // screen, and whether each of them runs across the whole stage
        f_o_guide() {
            let o_stage = f_el('.ml-stage').getBoundingClientRect();
            let a_o_rect = [...document.querySelectorAll('.ml-guide line')].map(el => el.getBoundingClientRect());
            let a_o_rect__x = a_o_rect.filter(o => o.width < 1);
            let a_o_rect__y = a_o_rect.filter(o => o.height < 1);
            return {
                a_n_x: a_o_rect__x.map(o => o.left).sort((n_a, n_b) => n_a - n_b),
                a_n_y: a_o_rect__y.map(o => o.top).sort((n_a, n_b) => n_a - n_b),
                b_across: a_o_rect__x.every(o => o.top <= o_stage.top && o.bottom >= o_stage.bottom) && a_o_rect__y.every(o => o.left <= o_stage.left && o.right >= o_stage.right),
                s_dash: a_o_rect.length ? getComputedStyle(document.querySelector('.ml-guide line')).strokeDasharray : '',
            };
        },
        async f_s_move(n_motor, n_step) {
            let o_index = await import('./index.js');
            try { await o_index.f_send_esp_move_step(n_motor, n_step, 5); return 'moved'; }
            catch (o_error) { return o_error.message; }
        },
    };
    document.body.setAttribute('data-ready', 'yes');
`;

Deno.test('ML Training window: from login to a trained model', async () => {
    let o_server__static = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, async o_request => {
        let s_path = new URL(o_request.url).pathname;
        if(s_path === '/') return new Response(s_page, { headers: { 'content-type': 'text/html' } });
        if(s_path === '/index.js') return f_o_response__javascript(s_index);
        if(s_path === '/o_capture.module.js') return f_o_response__javascript(s_capture);
        if(s_path === '/test.js') return f_o_response__javascript(s_test);
        try {
            return new Response(await Deno.readFile(new URL('../webserved_dir' + s_path, import.meta.url)),
                { headers: { 'content-type': s_path.endsWith('.css') ? 'text/css' : 'text/javascript' } });
        } catch { return new Response('', { status: 404 }); }
    });
    let s_url__page = 'http://127.0.0.1:' + o_server__static.addr.port;
    let o_server = await f_o_dataserver__start({ DATASERVER_A_S_ORIGIN__ALLOWED: s_url__page });
    let s_path__profile = await Deno.makeTempDir();
    let o_chrome, o_socket;
    try {
        o_chrome = new Deno.Command('/usr/bin/google-chrome', { args: [
            '--headless', '--no-sandbox', '--disable-gpu', '--no-first-run', '--user-data-dir=' + s_path__profile,
            '--remote-debugging-port=0', 'about:blank',
        ], stdout: 'null', stderr: 'piped' }).spawn();
        let o_reader = o_chrome.stderr.getReader();
        let s_output = '', s_url__devtools;
        while(!s_url__devtools){
            let { value, done } = await o_reader.read();
            if(done) throw new Error('Chrome startup failed: ' + s_output);
            s_output += new TextDecoder().decode(value);
            s_url__devtools = s_output.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
        }
        // drain Chrome diagnostics while the process runs
        (async () => { while(!(await o_reader.read()).done){} })();
        let a_o_page = await (await fetch(s_url__devtools.replace(/^ws:/, 'http:').replace(/\/devtools\/.*/, '/json/list'))).json();
        o_socket = new WebSocket(a_o_page.find(o => o.type === 'page').webSocketDebuggerUrl);
        await new Promise(f_resolve => o_socket.addEventListener('open', f_resolve, { once: true }));
        let n_id__message = 0;
        let o_pending = new Map();
        o_socket.addEventListener('message', o_evt => {
            let o_message = JSON.parse(o_evt.data);
            if(!o_pending.has(o_message.id)) return;
            let { f_resolve, f_reject } = o_pending.get(o_message.id);
            o_pending.delete(o_message.id);
            o_message.error ? f_reject(new Error(JSON.stringify(o_message.error))) : f_resolve(o_message.result);
        });
        let f_send = (s_method, o_param = {}) => new Promise((f_resolve, f_reject) => {
            let n_id = ++n_id__message;
            o_pending.set(n_id, { f_resolve, f_reject });
            o_socket.send(JSON.stringify({ id: n_id, method: s_method, params: o_param }));
        });
        // run an expression in the page; a thrown error fails the test with its message
        let f_v_page = async s_expression => {
            let o_result = await f_send('Runtime.evaluate', { expression: `(async () => { ${s_expression} })()`, awaitPromise: true, returnByValue: true });
            if(o_result.exceptionDetails) throw new Error(o_result.exceptionDetails.exception?.description || JSON.stringify(o_result.exceptionDetails));
            return o_result.result.value;
        };
        let f_screenshot = async s_name => {
            let o_shot = await f_send('Page.captureScreenshot', { format: 'png' });
            await Deno.writeFile('/tmp/omm-ml-' + s_name + '.png', Uint8Array.from(atob(o_shot.data), s => s.charCodeAt(0)));
        };
        // a real mouse drag between two positions on the screen
        let f_drag__screen = async (o_from, o_to) => {
            await f_send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: o_from.n_x, y: o_from.n_y });
            await f_send('Input.dispatchMouseEvent', { type: 'mousePressed', x: o_from.n_x, y: o_from.n_y, button: 'left', buttons: 1, clickCount: 1 });
            for(let n_it = 1; n_it <= 4; n_it++){
                await f_send('Input.dispatchMouseEvent', { type: 'mouseMoved', buttons: 1,
                    x: o_from.n_x + (o_to.n_x - o_from.n_x) * n_it / 4, y: o_from.n_y + (o_to.n_y - o_from.n_y) * n_it / 4 });
            }
            await f_send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: o_to.n_x, y: o_to.n_y, button: 'left', clickCount: 1 });
            await f_v_page('await o_test.f_tick();');
        };
        // between two points of the image on the stage (normalised 0..1)
        let f_drag = async (n_x__from, n_y__from, n_x__to, n_y__to) => f_drag__screen(
            await f_v_page(`return o_test.f_o_point(${n_x__from}, ${n_y__from});`),
            await f_v_page(`return o_test.f_o_point(${n_x__to}, ${n_y__to});`));
        // a real mouse click on the middle of a button
        let f_click__mouse = async s_label => {
            let o_point = await f_v_page(`return o_test.f_o_point__button(${JSON.stringify(s_label)});`);
            await f_drag__screen(o_point, o_point);
        };
        let f_wait_saved = () => f_v_page(`await o_test.f_wait(() => o_test.o_ml.s_status__save === 'saved', 'boxes saved');`);
        let f_open_page = async () => {
            await f_send('Page.navigate', { url: s_url__page });
            for(let n_it = 0; n_it < 100; n_it++){
                await new Promise(f_resolve => setTimeout(f_resolve, 100));
                let o_result = await f_send('Runtime.evaluate', { expression: 'document.body?.getAttribute("data-ready")' });
                if(o_result.result.value === 'yes') return;
            }
            throw new Error('The test page did not load');
        };
        let f_near = (n_actual, n_expected, s_what) => assert.ok(Math.abs(n_actual - n_expected) < 0.01, `${s_what}: ${n_actual} is not near ${n_expected}`);

        await f_send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
        // a headless page has no focus, and without it no field would ever report focus or blur
        await f_send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await f_send('Page.navigate', { url: s_url__page });
        await new Promise(f_resolve => setTimeout(f_resolve, 300));
        await f_send('Runtime.evaluate', { expression: `localStorage.setItem('omm.dataserver.s_url', ${JSON.stringify(o_server.s_url)})` });
        await f_open_page();

        // ── the smart selector on its own: objects with a name and a number ──
        await f_v_page(`o_test.f_mount_demo(); await o_test.f_tick();`);
        let f_s_demo = () => f_v_page(`return o_test.f_el('#demo .smart-selector-value').textContent.trim();`);
        // a long value shows its beginning and its ending
        assert.equal(await f_s_demo(), 'data value…long');
        // the list shows every value in full, with its pictogram and a delete
        await f_v_page(`await o_test.f_click('Thing list');`);
        assert.deepEqual(await f_v_page(`return o_test.f_a_o_option();`), [
            { s_name: 'data value that is very very long', b_active: true, b_image: false },
            { s_name: 'value 1', b_active: false, b_image: false },
        ]);
        assert.deepEqual(await f_v_page(`return [document.querySelectorAll('.smart-selector-option-icon svg').length, document.querySelectorAll('.smart-selector-option button').length];`), [2, 2]);
        // a row may say more below its value
        assert.deepEqual(await f_v_page(`return [...document.querySelectorAll('.smart-selector-option')].map(el => el.querySelector('.smart-selector-option-detail')?.textContent.trim() ?? null);`), ['number 0.5', null]);
        await f_v_page(`await o_test.f_choose('value 1');`);
        assert.equal(await f_s_demo(), 'value 1');
        // edit: the fields hold what the object holds; "update" changes it
        await f_v_page(`await o_test.f_click('Edit thing');`);
        assert.deepEqual(await f_v_page(`let el = o_test.f_el('.smart-selector-form');
            return [el.querySelector('input[type="text"]').value, el.querySelector('input[type="range"]').value, el.querySelector('.cockpit-readout').textContent, document.activeElement === el.querySelector('input[type="text"]')];`),
            ['value 1', '0.1', '0.1', true]);
        await f_v_page(`let el = o_test.f_el('.smart-selector-form input[type="range"]'); el.value = '0.7'; el.dispatchEvent(new Event('input', { bubbles: true })); await o_test.f_tick();`);
        assert.equal(await f_v_page(`return o_test.f_el('.smart-selector-form .cockpit-readout').textContent;`), '0.7');
        await f_v_page(`await o_test.f_type('.smart-selector-form input[type="text"]', 'value one'); await o_test.f_click('update');`);
        assert.deepEqual(await f_v_page(`return [o_test.o_demo.a_o_object[0].s_name, o_test.o_demo.a_o_object[0].n_number, !!o_test.f_el('.smart-selector-popup')];`), ['value one', 0.7, false]);
        // create: empty fields. an empty name cannot be sent, a refused value keeps the popup open
        await f_v_page(`await o_test.f_click('New thing');`);
        assert.deepEqual(await f_v_page(`let el = o_test.f_el('.smart-selector-form');
            return [el.querySelector('input[type="text"]').value, el.querySelector('input[type="range"]').value, o_test.f_el_button('create').disabled];`), ['', '0', true]);
        await f_v_page(`await o_test.f_type('.smart-selector-form input[type="text"]', 'refused'); await o_test.f_click('create');`);
        assert.equal(await f_v_page(`return !!o_test.f_el('.smart-selector-form') && o_test.o_demo.a_o_object.length === 2;`), true);
        await f_v_page(`await o_test.f_type('.smart-selector-form input[type="text"]', '  third  '); await o_test.f_click('create');`);
        assert.deepEqual(await f_v_page(`return [o_test.o_demo.a_o_object.length, o_test.o_demo.a_o_object[2].s_name, o_test.o_demo.a_o_object[2].n_number, !!o_test.f_el('.smart-selector-popup')];`), [3, 'third', 0, false]);
        assert.equal(await f_s_demo(), 'third');
        // delete in the list: the list stays open; without a chosen object there is nothing to edit
        await f_v_page(`await o_test.f_click('Thing list'); await o_test.f_click('Delete thing third');`);
        assert.deepEqual(await f_v_page(`return o_test.f_a_o_option().map(o => o.s_name);`), ['data value that is very very long', 'value one']);
        assert.deepEqual(await f_v_page(`return [o_test.f_el('#demo .smart-selector-value').textContent.trim(), o_test.f_el_button('Edit thing').disabled];`), ['no thing', true]);
        await f_screenshot('0-smart-selector');
        await f_v_page(`await o_test.f_key('Escape'); o_test.f_unmount_demo(); await o_test.f_tick(); o_test.f_check();`);

        // ── closed: nothing docked; slide and login are in the top bar all the same ──
        await f_v_page(`await o_test.f_wait(() => o_test.o_ml.b_probed && o_test.f_el('#ml-login-person'), 'login in the top bar');`);
        assert.equal(await f_v_page(`return !!o_test.f_el('.ml-dock') || document.body.classList.contains('ml-docked');`), false);
        assert.equal(await f_v_page(`return o_test.f_s_bar();`), '{no slide} | [] | []');
        assert.equal(await f_v_page(`return o_test.f_el_button('log in').disabled;`), true);

        // ── login in the top bar, the window still closed ──
        await f_v_page(`await o_test.f_type('#ml-login-organisation', 'privat1'); await o_test.f_type('#ml-login-person', 'Jonas'); await o_test.f_click('log in');
            await o_test.f_wait(() => o_test.o_ml.o_person && !o_test.f_el('#ml-login-person'), 'logged in');`);
        assert.equal(await f_v_page(`return o_test.f_s_bar();`), '{no slide} | privat1 | jonas');
        assert.equal(await f_v_page(`return !!o_test.f_el('.ml-dock') || !!o_test.f_el_button('Log out') === false;`), false);

        // ── open: docked, the image keeps clear of top bar and dock ──
        await f_v_page(`o_test.o_state.o_panel_visibility.ml_training = true; await o_test.f_wait(() => o_test.f_el_button('New dataset'), 'dock');`);
        let o_layout = await f_v_page(`
            let o_dock = o_test.f_el('.ml-dock').getBoundingClientRect();
            let o_video = document.querySelector('#webcamVideo').getBoundingClientRect();
            return { n_x__dock: o_dock.left, n_y__dock: o_dock.top, n_scl_y__dock: o_dock.height, n_scl_x__video: o_video.width, n_y__video: o_video.top, n_scl_y__video: o_video.height, n_x__video: o_video.left };`);
        assert.equal(o_layout.n_x__dock, 1600 - 304);
        assert.equal(o_layout.n_y__dock, 54);
        assert.equal(o_layout.n_scl_y__dock, 900 - 54);
        assert.deepEqual([o_layout.n_x__video, o_layout.n_y__video, o_layout.n_scl_x__video, o_layout.n_scl_y__video], [0, 54, 1600 - 304, 900 - 54]);

        // ── dataset: a smart selector in the dock ──
        let f_s_dataset = () => f_v_page(`return o_test.f_el('.ml-dataset .smart-selector-value').textContent.trim();`);
        assert.equal(await f_s_dataset(), 'no dataset');
        await f_v_page(`await o_test.f_create('dataset', 'Ceratium');
            await o_test.f_wait(() => o_test.o_ml.a_o_dataset.length === 1 && o_test.f_el('[aria-label="New class name"]'), 'dataset created');`);
        assert.equal(await f_s_dataset(), 'Ceratium');
        await f_v_page(`await o_test.f_update('dataset', 'Ceratium Test'); await o_test.f_wait(() => o_test.o_ml.a_o_dataset[0].s_name === 'Ceratium Test' && o_test.o_ml.s_activity === '', 'dataset renamed');`);
        assert.equal(await f_s_dataset(), 'Ceratium Test');
        // the popups of the dock hang below the selector and stay inside the window
        await f_v_page(`await o_test.f_click('Dataset list');`);
        assert.deepEqual(await f_v_page(`let o_list = o_test.f_el('.smart-selector-list').getBoundingClientRect(); let o_selector = o_test.f_el('.ml-dataset').getBoundingClientRect();
            return [o_list.top === o_selector.bottom + 4, o_list.right <= 1600, o_list.width];`), [true, true, 300]);
        assert.deepEqual(await f_v_page(`return o_test.f_a_o_option();`), [{ s_name: 'Ceratium Test', b_active: true, b_image: false }]);
        await f_v_page(`await o_test.f_key('Escape');`);

        // ── classes ──
        for(let s_name of ['ceratium', 'Luftblase']){
            await f_v_page(`await o_test.f_type('[aria-label="New class name"]', ${JSON.stringify(s_name)}, 'Enter');
                await o_test.f_wait(() => o_test.o_ml.a_o_class.some(o => o.s_name === ${JSON.stringify(s_name)}), 'class created');`);
        }
        let f_a_s_class = () => f_v_page(`return [...document.querySelectorAll('.ml-class:not(.ml-class--new)')].map(el => el.querySelector('.ml-class-key').textContent.trim() + ' ' + el.querySelector('.ml-class-name').value);`);
        assert.deepEqual(await f_a_s_class(), ['1 ceratium', '2 Luftblase']);
        // the same name again is refused and nothing is added
        await f_v_page(`await o_test.f_type('[aria-label="New class name"]', 'CERATIUM', 'Enter'); await o_test.f_wait(() => o_test.o_ml.s_error.includes('exists already'), 'name refused');
            o_test.o_state.a_o_toast.length = 0; await o_test.f_type('[aria-label="New class name"]', '');`);
        assert.equal(await f_v_page(`return o_test.o_ml.a_o_class.length;`), 2);
        // key 1 makes the first class the active one
        await f_v_page(`await o_test.f_key('1');`);
        assert.equal(await f_v_page(`return document.querySelector('.ml-class.active .ml-class-name').value;`), 'ceratium');

        // ── the order of the classes: arrow keys on the handle, or dragging it. the keys 1-9 follow ──
        let { s_token } = await f_o_login(o_server, 'jonas', 'privat1');
        let f_a_s_class__server = async () => (await f_o_request(o_server, 'GET', '/api/dataset/1', { s_token })).v_body.a_o_class.map(o => o.s_name);
        await f_v_page(`let el = o_test.f_el_button('Change order of class Luftblase'); el.focus(); await o_test.f_key('ArrowUp', el);
            await o_test.f_wait(() => o_test.o_ml.a_o_class[0].s_name === 'Luftblase' && o_test.o_ml.s_activity === '', 'class moved up');`);
        assert.deepEqual(await f_a_s_class(), ['1 Luftblase', '2 ceratium']);
        assert.deepEqual(await f_a_s_class__server(), ['Luftblase', 'ceratium']);
        assert.equal(await f_v_page(`return document.activeElement === o_test.f_el_button('Change order of class Luftblase');`), true);
        // the first class cannot go further up
        await f_v_page(`let el = o_test.f_el_button('Change order of class Luftblase'); await o_test.f_key('ArrowUp', el); await o_test.f_tick();`);
        assert.deepEqual(await f_a_s_class(), ['1 Luftblase', '2 ceratium']);
        // dragged down with the mouse, below the other class
        await f_drag__screen(
            await f_v_page(`return o_test.f_o_point__button('Change order of class Luftblase');`),
            await f_v_page(`return o_test.f_o_point__button('Change order of class ceratium');`));
        await f_v_page(`await o_test.f_wait(() => o_test.o_ml.a_o_class[0].s_name === 'ceratium' && o_test.o_ml.s_activity === '', 'class dragged down');`);
        assert.deepEqual(await f_a_s_class(), ['1 ceratium', '2 Luftblase']);
        assert.deepEqual(await f_a_s_class__server(), ['ceratium', 'Luftblase']);
        // dragging is no click: the active class stays
        assert.equal(await f_v_page(`return document.querySelector('.ml-class.active .ml-class-name').value;`), 'ceratium');

        // ── capture is blocked until slide, microscope, objective and calibration are known ──
        assert.equal(await f_v_page(`return o_test.f_el_button('capture').disabled;`), true);
        let s_tooltip = await f_v_page(`return o_test.f_el_button('capture').dataset.tooltip;`);
        for(let s_reason of ['Select a camera', 'Name the slide', 'Enter the microscope', 'Enter the objective', 'Calibrate µm per px', 'Calibrate steps per px']){
            assert.ok(s_tooltip.includes(s_reason), 'tooltip names: ' + s_reason);
        }
        assert.equal(await f_v_page(`return o_test.f_s_bar();`), '— µm/px | — · — px/step | {no slide} | privat1 | jonas');
        // without a camera there is no image to draw on
        assert.equal(await f_v_page(`return !!o_test.f_el('.ml-stage');`), false);
        await f_screenshot('1-blocked');

        // ── slide in the top bar: the first slide gets a project of the slide library ──
        let f_o_library = () => f_v_page(`return { a_s_project: o_test.o_state.a_o_project.map(o => o.s_name), a_s_slide: o_test.o_state.a_o_slide.map(o => o.s_name),
            s_slide: o_test.o_state.a_o_slide.find(o => o.n_id === o_test.o_state.n_id__slide__current)?.s_name || '', s_value: o_test.f_el('.ml-slide .smart-selector-value').textContent.trim() };`);
        assert.deepEqual(await f_v_page(`return [o_test.f_el_button('Slide list').disabled, o_test.f_el_button('Edit slide').disabled, o_test.f_el('.ml-slide').classList.contains('warning')];`), [true, true, true]);
        await f_v_page(`await o_test.f_create('slide', 'ceratum1'); await o_test.f_wait(() => o_test.o_state.n_id__slide__current > 0 && o_test.o_ml.s_activity === '', 'slide created');`);
        assert.deepEqual(await f_o_library(), { a_s_project: ['default'], a_s_slide: ['ceratum1'], s_slide: 'ceratum1', s_value: 'ceratum1' });
        assert.deepEqual(await f_v_page(`return [o_test.o_saved.o_library__current.n_id__project, o_test.o_saved.o_library__current.n_id__slide];`),
            await f_v_page(`return [o_test.o_state.a_o_project[0].n_id, o_test.o_state.a_o_slide[0].n_id];`));
        // edit renames it
        await f_v_page(`await o_test.f_update('slide', 'ceratium1'); await o_test.f_wait(() => o_test.o_state.a_o_slide[0].s_name === 'ceratium1' && o_test.o_ml.s_activity === '', 'slide renamed');`);
        assert.deepEqual(await f_o_library(), { a_s_project: ['default'], a_s_slide: ['ceratium1'], s_slide: 'ceratium1', s_value: 'ceratium1' });
        // an empty name cannot be sent
        await f_v_page(`await o_test.f_click('Edit slide'); await o_test.f_type('.smart-selector-form input[type="text"]', '   ');`);
        assert.equal(await f_v_page(`return o_test.f_el_button('update').disabled;`), true);
        await f_v_page(`await o_test.f_key('Escape');`);
        assert.equal(await f_v_page(`return !!o_test.f_el('.smart-selector-popup');`), false);
        // "+" creates a second slide and puts it on the stage
        await f_v_page(`await o_test.f_create('slide', 'ceratium2'); await o_test.f_wait(() => o_test.o_state.a_o_slide.length === 2 && o_test.o_ml.s_activity === '', 'second slide');`);
        assert.deepEqual(await f_o_library(), { a_s_project: ['default'], a_s_slide: ['ceratium1', 'ceratium2'], s_slide: 'ceratium2', s_value: 'ceratium2' });
        // a name that exists is not created twice: that slide is chosen
        await f_v_page(`await o_test.f_create('slide', 'CERATIUM1');
            await o_test.f_wait(() => o_test.o_state.n_id__slide__current === o_test.o_state.a_o_slide[0].n_id && o_test.o_ml.s_activity === '', 'existing slide chosen');`);
        assert.deepEqual(await f_o_library(), { a_s_project: ['default'], a_s_slide: ['ceratium1', 'ceratium2'], s_slide: 'ceratium1', s_value: 'ceratium1' });
        // renaming to the name of another slide is refused: the popup stays open for another name
        await f_v_page(`await o_test.f_update('slide', 'ceratium2'); await o_test.f_wait(() => o_test.o_ml.s_error.includes('exists already') && o_test.o_ml.s_activity === '', 'rename refused');
            o_test.o_state.a_o_toast.length = 0;`);
        assert.equal(await f_v_page(`return !!o_test.f_el('.smart-selector-form');`), true);
        await f_v_page(`await o_test.f_key('Escape');`);
        assert.deepEqual(await f_o_library(), { a_s_project: ['default'], a_s_slide: ['ceratium1', 'ceratium2'], s_slide: 'ceratium1', s_value: 'ceratium1' });
        // the list switches between the slides
        await f_v_page(`await o_test.f_click('Slide list');`);
        assert.deepEqual(await f_v_page(`return o_test.f_a_o_option();`), [
            { s_name: 'ceratium1', b_active: true, b_image: false },
            { s_name: 'ceratium2', b_active: false, b_image: false },
        ]);
        // it hangs below the selector and is at most 700 px high
        assert.deepEqual(await f_v_page(`let el = o_test.f_el('.smart-selector-list'); let o_list = el.getBoundingClientRect(); let o_selector = o_test.f_el('.ml-slide').getBoundingClientRect(); let o_button = o_test.f_el_button('Slide list').getBoundingClientRect();
            return [o_list.top === o_selector.bottom + 4, o_list.left === o_button.left, el.style.maxHeight];`), [true, true, '700px']);
        await f_v_page(`await o_test.f_choose('ceratium2');`);
        assert.equal((await f_o_library()).s_value, 'ceratium2');
        assert.equal(await f_v_page(`return !!o_test.f_el('.smart-selector-popup');`), false);
        // a press anywhere else closes the list, and so does Escape
        await f_v_page(`await o_test.f_click('Slide list'); document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await o_test.f_tick();`);
        assert.equal(await f_v_page(`return !!o_test.f_el('.smart-selector-popup');`), false);
        await f_v_page(`await o_test.f_click('Slide list'); await o_test.f_key('Escape');`);
        assert.equal(await f_v_page(`return !!o_test.f_el('.smart-selector-popup');`), false);
        // a long name shows its beginning and its ending in the bar, and all of it in the list
        await f_v_page(`await o_test.f_create('slide', 'A very very very long name, why');
            await o_test.f_wait(() => o_test.o_state.a_o_slide.length === 3 && o_test.o_ml.s_activity === '', 'third slide');`);
        assert.equal((await f_o_library()).s_value, 'A very ver…, why');
        assert.match(await f_v_page(`return o_test.f_el('.ml-slide').dataset.tooltip;`), /^Slide · A very very very long name, why\n/);
        await f_v_page(`await o_test.f_click('Slide list');`);
        assert.deepEqual(await f_v_page(`return o_test.f_a_o_option().map(o => o.s_name);`), ['A very very very long name, why', 'ceratium1', 'ceratium2']);
        // delete in the list, after the question
        await f_v_page(`o_test.a_s_dialog.length = 0; await o_test.f_click('Delete slide ceratium2'); await o_test.f_wait(() => o_test.o_state.a_o_slide.length === 2 && o_test.o_ml.s_activity === '', 'slide deleted');`);
        assert.match(await f_v_page(`return o_test.a_s_dialog[0];`), /Delete the slide "ceratium2"/);
        assert.deepEqual(await f_v_page(`return o_test.f_a_o_option().map(o => o.s_name);`), ['A very very very long name, why', 'ceratium1']);
        await f_v_page(`await o_test.f_choose('ceratium1');`);
        assert.equal((await f_o_library()).s_value, 'ceratium1');

        await f_v_page(`
            o_test.o_state.b_streaming__webcam = true;
            o_test.o_state.o_calibration.n_um__per_px = 0.52;
            o_test.o_state.a_n_step__per_px = [0.4, 0.5, 0];
            await o_test.f_type('#ml-microscope', 'Bresser Erudit'); await o_test.f_type('#ml-calibration', '10x');`);
        assert.equal(await f_v_page(`return o_test.f_s_bar();`), '0.52 µm/px | 2.5 · 2 px/step | {ceratium1} | privat1 | jonas');

        // ── µm per px belongs to the camera image it was measured on ──
        // after a reload the camera has started but its image has no size yet: the stored scale is used all the same
        await f_v_page(`o_test.o_state.o_calibration.o_camera__scale = { n_width: 640, n_height: 480, n_width__sensor: 640, n_height__sensor: 480, o_hardware_crop: null }; await o_test.f_tick();`);
        assert.equal(await f_v_page(`return o_test.f_s_bar();`), '0.52 µm/px | 2.5 · 2 px/step | {ceratium1} | privat1 | jonas');
        // the image arrives in the calibrated size
        await f_v_page(`await o_test.f_show_camera(640, 480);`);
        assert.equal(await f_v_page(`return o_test.f_s_bar();`), '0.52 µm/px | 2.5 · 2 px/step | {ceratium1} | privat1 | jonas');
        assert.equal(await f_v_page(`return o_test.f_el_button('capture').disabled;`), false);
        // an image of another size: the scale is not used, and capture says why
        await f_v_page(`await o_test.f_show_camera(320, 240);`);
        assert.equal(await f_v_page(`return o_test.f_s_bar();`), '— µm/px | 2.5 · 2 px/step | {ceratium1} | privat1 | jonas');
        assert.equal(await f_v_page(`return o_test.f_el_button('capture').disabled;`), true);
        assert.ok((await f_v_page(`return o_test.f_el_button('capture').dataset.tooltip;`)).includes('Calibrate µm per px for this camera image'));
        // the calibrated size again
        await f_v_page(`await o_test.f_show_camera(640, 480);`);
        assert.equal(await f_v_page(`return o_test.f_s_bar();`), '0.52 µm/px | 2.5 · 2 px/step | {ceratium1} | privat1 | jonas');
        assert.equal(await f_v_page(`return o_test.f_el_button('capture').disabled;`), false);
        assert.deepEqual(await f_v_page(`return o_test.o_saved.o_ml_config;`),
            { n_id__dataset: 1, s_name__microscope: 'Bresser Erudit', s_name__calibration: '10x', n_id__model: 0, n_epoch: 50 });

        // ── the stage lies exactly on the live image and lets it through ──
        await f_v_page(`await o_test.f_wait(() => o_test.f_el('.ml-stage.ml-stage--live') && o_test.f_el('.ml-view'), 'stage on the live image');`);
        assert.deepEqual(await f_v_page(`let o = o_test.f_el('.ml-stage').getBoundingClientRect(); return [o.left, o.top, o.width, o.height];`), [0, 54, 1296, 846]);
        // the camera image is 640 x 480: it fills the height, and the boxes are placed on it, not on the black bars
        assert.deepEqual(await f_v_page(`let o = o_test.f_el('.ml-view').getBoundingClientRect(); return [o.left, o.top, o.width, o.height];`), [84, 54, 1128, 846]);
        assert.deepEqual(await f_v_page(`return [getComputedStyle(o_test.f_el('.ml-stage')).backgroundColor, document.body.classList.contains('ml-annotating'), !!o_test.f_el('.ml-still')];`),
            ['rgba(0, 0, 0, 0)', true, false]);
        let f_a_o_image = async () => (await f_o_request(o_server, 'GET', '/api/dataset/1/image', { s_token })).v_body.a_o_image;

        // ── two dashed lines follow the cursor, with the class the next box gets ──
        let o_point__hover = await f_v_page(`return o_test.f_o_point(0.7, 0.2);`);
        await f_send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: o_point__hover.n_x, y: o_point__hover.n_y });
        await f_v_page(`await o_test.f_tick();`);
        assert.deepEqual(await f_v_page(`let el = o_test.f_el('.ml-cursor-label'); let a_el = [...document.querySelectorAll('.ml-crosshair line')];
            return [a_el.length, Math.round(a_el[1].x1.baseVal.value), Math.round(a_el[0].y1.baseVal.value), el.textContent.trim(), getComputedStyle(el).color, getComputedStyle(a_el[0]).stroke];`),
            [2, 448, 96, '1ceratium', 'rgb(230, 25, 75)', 'rgb(230, 25, 75)']);

        // ── draw a box on the live image with the mouse: nothing is stored yet, X and Y are held ──
        await f_drag(0.25, 0.25, 0.5, 0.5);
        assert.deepEqual(await f_v_page(`return [o_test.o_ml.a_o_bbox.length, o_test.o_ml.n_idx__bbox__selected, o_test.f_a_s_box(), o_test.f_s_status()];`), [1, -1, ['1ceratium'], '1 box · x · y locked']);
        assert.equal((await f_a_o_image()).length, 0);
        // the label sits inside the box, at its top left corner
        assert.deepEqual(await f_v_page(`let o_tag = o_test.f_el('.ml-bbox-tag').getBoundingClientRect(); let o_point = o_test.f_o_point(0.25, 0.25);
            return [Math.round(o_tag.left - o_point.n_x), Math.round(o_tag.top - o_point.n_y)];`), [3, 3]);

        // ── whoever moves X or Y now is asked first; Z stays free ──
        assert.match(await f_v_page(`return await o_test.f_s_move(0, 100);`), /locked/);
        assert.deepEqual(await f_v_page(`await o_test.f_tick(); return [o_test.f_el('.ml-ask p').textContent.trim(), document.activeElement.getAttribute('aria-label')];`),
            ['Are you sure to leave the current field of view? Annotation data is going to be lost.', 'stay']);
        await f_screenshot('2-leave-question');
        await f_v_page(`await o_test.f_click('stay');`);
        assert.deepEqual(await f_v_page(`return [!!o_test.f_el('.ml-ask'), o_test.o_ml.a_o_bbox.length, o_test.a_o_move.length];`), [false, 1, 0]);
        assert.equal(await f_v_page(`return await o_test.f_s_move(2, 5);`), 'moved');
        assert.equal(await f_v_page(`return !!o_test.f_el('.ml-ask');`), false);
        // Y is held as well; Escape answers "stay"
        assert.match(await f_v_page(`return await o_test.f_s_move(1, -50);`), /locked/);
        await f_v_page(`await o_test.f_tick(); await o_test.f_key('Escape', o_test.f_el('.ml-ask'));`);
        assert.deepEqual(await f_v_page(`return [!!o_test.f_el('.ml-ask'), o_test.o_ml.a_o_bbox.length];`), [false, 1]);
        // "leave" gives the boxes up, and X and Y are free again
        await f_v_page(`await o_test.f_s_move(0, 100); await o_test.f_tick(); await o_test.f_click('leave');`);
        assert.deepEqual(await f_v_page(`return [!!o_test.f_el('.ml-ask'), o_test.o_ml.a_o_bbox.length, o_test.f_s_status()];`), [false, 0, '']);
        assert.equal(await f_v_page(`return await o_test.f_s_move(0, 100);`), 'moved');
        assert.deepEqual(await f_v_page(`return o_test.a_o_move.splice(0);`), [{ n_motor: 2, n_step: 5 }, { n_motor: 0, n_step: 100 }]);

        // ── a box is only changed in its edit mode ──
        await f_drag(0.25, 0.25, 0.5, 0.5);
        // a second box may begin inside the first one: the first one is not taken hold of
        await f_drag(0.4, 0.4, 0.7, 0.8);
        assert.deepEqual(await f_v_page(`return [o_test.f_a_s_box(), o_test.o_ml.n_idx__bbox__selected, document.querySelectorAll('.ml-handle').length];`), [['1ceratium', '1ceratium'], -1, 0]);
        assert.equal(await f_v_page(`return document.querySelectorAll('.ml-guide line').length;`), 0);
        // key 2 chooses the class of the next box; without a box in edit mode no box changes
        await f_v_page(`await o_test.f_key('2');`);
        assert.deepEqual(await f_v_page(`return [document.querySelector('.ml-class.active .ml-class-name').value, o_test.f_a_s_box()];`), ['Luftblase', ['1ceratium', '1ceratium']]);
        // a click on the label puts the box into edit mode
        await f_click__mouse('Edit box 1');
        assert.deepEqual(await f_v_page(`return [o_test.o_ml.n_idx__bbox__selected, document.querySelectorAll('.ml-handle').length, o_test.o_ml.a_o_bbox.length, o_test.f_el_button('Edit box 1').getAttribute('aria-pressed')];`), [0, 4, 2, 'true']);
        // dashed lines continue its four edges across the whole stage, beyond the image
        let f_check_guide = async (n_x__min, n_y__min, n_x__max, n_y__max, s_what) => {
            let o_guide = await f_v_page(`return o_test.f_o_guide();`);
            let o_point__min = await f_v_page(`return o_test.f_o_point(${n_x__min}, ${n_y__min});`);
            let o_point__max = await f_v_page(`return o_test.f_o_point(${n_x__max}, ${n_y__max});`);
            assert.deepEqual([o_guide.a_n_x.length, o_guide.a_n_y.length, o_guide.b_across, o_guide.s_dash], [2, 2, true, '7px, 5px'], s_what);
            for(let [n, n__expected] of [[o_guide.a_n_x[0], o_point__min.n_x], [o_guide.a_n_x[1], o_point__max.n_x], [o_guide.a_n_y[0], o_point__min.n_y], [o_guide.a_n_y[1], o_point__max.n_y]]){
                assert.ok(Math.abs(n - n__expected) < 1.5, `${s_what}: ${JSON.stringify(o_guide)} for ${JSON.stringify([o_point__min, o_point__max])}`);
            }
        };
        await f_check_guide(0.25, 0.25, 0.5, 0.5, 'guides of the box in edit mode');
        // key 2 now changes its class
        await f_v_page(`await o_test.f_key('2');`);
        assert.deepEqual(await f_v_page(`return o_test.f_a_s_box();`), ['2Luftblase', '1ceratium']);
        // drag inside moves it
        await f_drag(0.3, 0.32, 0.35, 0.42);
        let f_o_bbox = n_idx => f_v_page(`return { ...o_test.o_ml.a_o_bbox[${n_idx}] };`);
        let o_bbox = await f_o_bbox(0);
        f_near(o_bbox.n_trn_x_center_nor, 0.425, 'moved centre x');
        f_near(o_bbox.n_trn_y_center_nor, 0.475, 'moved centre y');
        f_near(o_bbox.n_scl_x_nor, 0.25, 'moved width');
        // drag the bottom right corner resizes it
        await f_drag(0.55, 0.6, 0.6, 0.7);
        o_bbox = await f_o_bbox(0);
        f_near(o_bbox.n_scl_x_nor, 0.3, 'resized width');
        f_near(o_bbox.n_trn_x_center_nor, 0.45, 'resized centre x');
        f_near(o_bbox.n_scl_y_nor, 0.35, 'resized height');
        f_near(o_bbox.n_trn_y_center_nor, 0.525, 'resized centre y');
        assert.equal(await f_v_page(`return o_test.o_ml.a_o_bbox.length;`), 2);
        // the lines follow the edges
        await f_check_guide(0.3, 0.35, 0.6, 0.7, 'guides after move and resize');
        await f_screenshot('3-edit-mode');
        // a click outside the box ends the edit mode, and a slip of the hand is no box
        await f_drag(0.9, 0.1, 0.902, 0.102);
        assert.deepEqual(await f_v_page(`return [o_test.o_ml.n_idx__bbox__selected, document.querySelectorAll('.ml-handle').length, o_test.o_ml.a_o_bbox.length, document.querySelectorAll('.ml-guide line').length];`), [-1, 0, 2, 0]);
        // out of edit mode a drag inside the box does not move it: it draws
        await f_drag(0.32, 0.45, 0.36, 0.55);
        assert.equal(await f_v_page(`return o_test.o_ml.a_o_bbox.length;`), 3);
        f_near((await f_o_bbox(0)).n_trn_x_center_nor, 0.45, 'first box stayed');
        await f_screenshot('3-annotate');
        // the trash next to the label deletes a box
        await f_click__mouse('Delete box 3');
        assert.deepEqual(await f_v_page(`return o_test.f_a_s_box();`), ['2Luftblase', '1ceratium']);
        // Delete removes the box in edit mode, Escape ends the edit mode
        await f_v_page(`await o_test.f_click('Edit box 2'); await o_test.f_key('Delete');`);
        assert.deepEqual(await f_v_page(`return [o_test.f_a_s_box(), o_test.o_ml.n_idx__bbox__selected];`), [['2Luftblase'], -1]);
        await f_v_page(`await o_test.f_click('Edit box 1'); await o_test.f_key('Escape');`);
        assert.deepEqual(await f_v_page(`return [o_test.f_a_s_box(), o_test.o_ml.n_idx__bbox__selected];`), [['2Luftblase'], -1]);
        assert.equal((await f_a_o_image()).length, 0);

        // ── capture finishes the annotation: the camera image goes to the server with its boxes ──
        await f_v_page(`await o_test.f_click('capture'); await o_test.f_wait(() => o_test.o_ml.a_o_image.length === 1 && o_test.o_ml.s_activity === '', 'captured');`);
        let a_o_image = await f_a_o_image();
        assert.equal(a_o_image.length, 1);
        assert.deepEqual(
            [a_o_image[0].n_scl_x, a_o_image[0].n_scl_y, a_o_image[0].s_camera, a_o_image[0].n_iso, a_o_image[0].n_ms__exposure, a_o_image[0].b_done],
            [640, 480, 'HY-500B (0ac8:3420)', 20, 15.7, true]);
        assert.deepEqual([a_o_image[0].n_steps_x_rel, a_o_image[0].n_steps_y_rel, a_o_image[0].n_steps_z_rel], [722, 1740, 659]);
        assert.equal(a_o_image[0].a_o_bbox.length, 1);
        assert.equal(a_o_image[0].a_o_bbox[0].n_o_class_n_id, 2);
        f_near(a_o_image[0].a_o_bbox[0].n_trn_x_center_nor, 0.45, 'stored centre x');
        f_near(a_o_image[0].a_o_bbox[0].n_trn_y_center_nor, 0.525, 'stored centre y');
        f_near(a_o_image[0].a_o_bbox[0].n_scl_x_nor, 0.3, 'stored width');
        f_near(a_o_image[0].a_o_bbox[0].n_scl_y_nor, 0.35, 'stored height');
        let o_microscope = (await f_o_request(o_server, 'GET', '/api/microscope', { s_token })).v_body.a_o_microscope[0];
        assert.equal(o_microscope.s_name, 'Bresser Erudit');
        assert.deepEqual(o_microscope.a_o_calibration.map(o => [o.n_id, o.s_name, o.n_px_per_step_x, o.n_px_per_step_y, o.n_um_per_px]),
            [[a_o_image[0].n_o_calibration_n_id, '10x', 2.5, 2, 0.52]]);
        let a_o_slide = (await f_o_request(o_server, 'GET', '/api/slide', { s_token })).v_body.a_o_slide;
        assert.deepEqual(a_o_slide.map(o => [o.n_id, o.s_name]), [[a_o_image[0].n_o_slide_n_id, 'ceratium1']]);
        assert.equal((await f_o_request(o_server, 'GET', '/api/dataset/1/image/1/thumbnail.jpg', { s_token })).n_status, 200);
        // the boxes are stored: the stage is empty and live again, X and Y are free
        assert.deepEqual(await f_v_page(`return [o_test.o_ml.a_o_bbox.length, o_test.o_ml.b_still, !!o_test.f_el('.ml-stage.ml-stage--live'), o_test.f_s_status(), await o_test.f_s_move(0, 10)];`),
            [0, false, true, '', 'moved']);
        assert.equal(await f_v_page(`return o_test.f_el('.ml-dock [data-tooltip^="Images"].cockpit-readout').textContent;`), '1/1');
        // the image captured last is shown in the dock
        await f_v_page(`await o_test.f_wait(() => o_test.f_el('.ml-thumbnail img'), 'thumbnail of the image captured last');`);

        // ── the list shows the image taken last from a slide; a slide without an image stays empty ──
        await f_v_page(`await o_test.f_click('Slide list'); await o_test.f_wait(() => o_test.f_a_o_option().some(o => o.b_image), 'image in the list');`);
        assert.deepEqual(await f_v_page(`return o_test.f_a_o_option().map(o => [o.s_name, o.b_image]);`),
            [['A very very very long name, why', false], ['ceratium1', true]]);
        assert.deepEqual(await f_v_page(`let el = o_test.f_el('.smart-selector-list img'); await el.decode(); let o = el.getBoundingClientRect(); return [o.width, o.height, el.naturalWidth > 0];`), [50, 50, true]);
        await f_screenshot('4-slide-list');
        await f_v_page(`await o_test.f_key('Escape');`);

        // ── renaming the slide renames it on the data server: the image keeps its slide ──
        await f_v_page(`await o_test.f_update('slide', 'ceratium1b'); await o_test.f_wait(() => o_test.o_state.a_o_slide[0].s_name === 'ceratium1b' && o_test.o_ml.s_activity === '', 'slide renamed');`);
        a_o_slide = (await f_o_request(o_server, 'GET', '/api/slide', { s_token })).v_body.a_o_slide;
        assert.deepEqual(a_o_slide.map(o => [o.n_id, o.s_name]), [[a_o_image[0].n_o_slide_n_id, 'ceratium1b']]);

        // ── capture without a box: an example without objects ──
        await f_v_page(`await o_test.f_key('1'); await o_test.f_click('capture'); await o_test.f_wait(() => o_test.o_ml.a_o_image.length === 2 && o_test.o_ml.s_activity === '', 'second image');`);
        a_o_image = await f_a_o_image();
        assert.deepEqual(a_o_image.map(o => [o.b_done, o.a_o_bbox.length, o.n_o_slide_n_id]), [[true, 1, a_o_slide[0].n_id], [true, 0, a_o_slide[0].n_id]]);

        // ── focus points: folded away, one point, until they are asked for ──
        assert.deepEqual(await f_v_page(`return [o_test.f_el_button('Focus points').getAttribute('aria-expanded'), !!o_test.f_el('[aria-label="Number of focus points"]'), !!o_test.f_el('.ml-focus'), o_test.o_ml.n_cnt__focus];`),
            ['false', false, false, 1]);
        await f_v_page(`await o_test.f_click('Focus points');`);
        assert.deepEqual(await f_v_page(`return [o_test.f_el('[aria-label="Number of focus points"]').value, document.querySelectorAll('.ml-focus').length];`), ['1', 0]);
        await f_v_page(`await o_test.f_type('[aria-label="Number of focus points"]', '2');`);
        let f_a_s_focus = () => f_v_page(`return [...document.querySelectorAll('.ml-focus')].map(el => el.querySelector('.ml-focus-number').textContent.trim() + ' ' + el.querySelector('.cockpit-readout').textContent.trim());`);
        assert.deepEqual(await f_a_s_focus(), ['1 —', '2 —']);
        // every point has to be set before an image is taken
        assert.equal(await f_v_page(`return o_test.f_el_button('capture').disabled;`), true);
        assert.ok((await f_v_page(`return o_test.f_el_button('capture').dataset.tooltip;`)).includes('Set focus point 1.'));
        // "set" takes the focus as it is now
        await f_v_page(`await o_test.f_click('Set focus point 1'); o_test.o_state.a_o_motor[2].n_position = 700; await o_test.f_click('Set focus point 2'); o_test.o_state.a_o_motor[2].n_position = 680; await o_test.f_tick();`);
        assert.deepEqual(await f_a_s_focus(), ['1 659', '2 700']);
        assert.equal(await f_v_page(`return o_test.f_el_button('capture').disabled;`), false);
        // capture: one image at each focus point, all with the same boxes, and the focus goes back
        await f_drag(0.1, 0.1, 0.3, 0.4);
        await f_screenshot('5-focus-points');
        // while it runs, the middle of the image says how far it is
        assert.equal(await f_v_page(`return !!o_test.f_el('.ml-progress');`), false);
        let a_s_progress = await f_v_page(`o_test.a_o_move.length = 0; o_test.o_esp.a_s_command.length = 0; o_test.o_esp.n_ms__move = 150;
            let a_s_text = [];
            let n_id__interval = setInterval(() => {
                let el = o_test.f_el('.ml-progress-text');
                if(el && a_s_text.at(-1) !== el.textContent.trim()) a_s_text.push(el.textContent.trim());
            }, 5);
            await o_test.f_click('capture');
            await o_test.f_wait(() => o_test.o_ml.a_o_image.length === 4 && o_test.o_ml.s_activity === '', 'an image for each focus point');
            clearInterval(n_id__interval);
            return a_s_text;`);
        assert.deepEqual(a_s_progress, ['capturing focus point 1/2', 'capturing focus point 2/2', 'returning focus']);
        assert.equal(await f_v_page(`return !!o_test.f_el('.ml-progress');`), false);
        // before the first image and before the way back, whatever still runs is stopped and the positions are asked for
        assert.deepEqual(await f_v_page(`return o_test.o_esp.a_s_command.splice(0);`), ['stopAll', 'status', 'stopAll', 'status']);
        a_o_image = await f_a_o_image();
        assert.deepEqual(a_o_image.slice(2).map(o => [o.n_steps_z_rel, o.b_done, o.a_o_bbox.length, o.a_o_bbox[0].n_o_class_n_id]), [[659, true, 1, 1], [700, true, 1, 1]]);
        for(let o_image of a_o_image.slice(2)){
            f_near(o_image.a_o_bbox[0].n_trn_x_center_nor, 0.2, 'focus point box centre x');
            f_near(o_image.a_o_bbox[0].n_scl_y_nor, 0.3, 'focus point box height');
        }
        assert.deepEqual(await f_v_page(`return [o_test.a_o_move.splice(0), o_test.o_state.a_o_motor[2].n_position, o_test.o_ml.a_o_bbox.length];`),
            [[{ n_motor: 2, n_step: -21 }, { n_motor: 2, n_step: 41 }, { n_motor: 2, n_step: -20 }], 680, 0]);

        // ── while the images are taken no motor is moved by hand, and "cancel" keeps nothing ──
        await f_drag(0.1, 0.1, 0.3, 0.4);
        // the way to the second focus point takes long enough to be interrupted
        await f_v_page(`o_test.o_esp.n_ms__move = 600; o_test.o_state.a_o_toast.length = 0; o_test.f_el_button('capture').click();
            await o_test.f_wait(() => o_test.f_el('.ml-progress-text')?.textContent.trim() === 'capturing focus point 1/2' && o_test.a_o_move.length === 1, 'the first focus point');
            o_test.o_esp.n_ms__move = 20000;`);
        await f_screenshot('5-focus-points-capturing');
        // the message lies in the middle of the image
        assert.deepEqual(await f_v_page(`let o_rect = o_test.f_el('.ml-progress').getBoundingClientRect(); let o_point = o_test.f_o_point(0.5, 0.5);
            return [Math.abs(o_rect.left + o_rect.width / 2 - o_point.n_x) < 2, Math.abs(o_rect.top + o_rect.height / 2 - o_point.n_y) < 2, o_test.f_el_button('cancel').disabled];`), [true, true, false]);
        // X, Y and Z refuse, and nobody is asked whether the field of view may be left
        for(let n_motor of [0, 1, 2]) assert.match(await f_v_page(`return await o_test.f_s_move(${n_motor}, 10);`), /locked/);
        assert.deepEqual(await f_v_page(`let o_index = await import('./index.js');
            o_index.f_send_esp({ motor: 2, command: 'runContinuous', n_rpm: 5, direction: 'cw' });
            o_index.f_send_esp({ motor: 0, command: 'runContinuous', n_rpm: 5, direction: 'cw' });
            await o_test.f_tick();
            return [o_test.o_esp.a_s_command.includes('runContinuous'), !!o_test.f_el('.ml-ask'), o_test.a_o_move.length];`), [false, false, 1]);
        // nothing can be drawn or changed on the image meanwhile
        await f_drag(0.5, 0.5, 0.8, 0.8);
        assert.equal(await f_v_page(`return o_test.o_ml.a_o_bbox.length;`), 1);
        // cancel on the way to the second focus point: its image is not taken, the first one is removed again
        await f_v_page(`await o_test.f_wait(() => o_test.f_el('.ml-progress-text')?.textContent.trim() === 'capturing focus point 2/2' && o_test.a_o_move.length === 2, 'the second focus point');`);
        assert.equal((await f_a_o_image()).length, 5);
        await f_v_page(`o_test.o_esp.n_ms__move = 400; await o_test.f_click('cancel');`);
        assert.deepEqual(await f_v_page(`return [o_test.f_el('.ml-progress-text').textContent.trim(), o_test.f_el_button('cancel').disabled];`), ['cancelling', true]);
        await f_v_page(`await o_test.f_wait(() => !o_test.f_el('.ml-progress') && o_test.o_ml.s_activity === '', 'the end of the cancelled capture');`);
        assert.equal((await f_a_o_image()).length, 4);
        // the motor was stopped halfway (679): the way back starts from there, not from where it was last heard of
        assert.deepEqual(await f_v_page(`return [o_test.a_o_move.splice(0), o_test.o_state.a_o_motor[2].n_position, o_test.o_ml.a_o_image.length, o_test.f_a_s_box(), o_test.o_ml.s_error,
            o_test.o_state.a_o_toast.map(o => o.s_type + ': ' + o.s_message), o_test.o_esp.a_s_command.splice(0)];`),
            [[{ n_motor: 2, n_step: -21 }, { n_motor: 2, n_step: 41 }, { n_motor: 2, n_step: 1 }], 680, 4, ['1ceratium'], '',
                ['info: Capture cancelled. No image was stored.'], ['stopAll', 'status', 'stop', 'stopAll', 'status']]);
        // afterwards the box holds X and Y as before, Z is free again
        assert.equal(await f_v_page(`o_test.o_esp.n_ms__move = 10; o_test.o_state.a_o_toast.length = 0; return await o_test.f_s_move(2, 5);`), 'moved');
        await f_v_page(`o_test.a_o_move.length = 0; await o_test.f_s_move(0, 100); await o_test.f_tick(); await o_test.f_click('leave');`);
        assert.deepEqual(await f_v_page(`return [o_test.o_ml.a_o_bbox.length, o_test.a_o_move.length];`), [0, 0]);
        // the focus points belong to one field of view: after a move of X or Y they have to be set again
        assert.deepEqual(await f_a_s_focus(), ['1 659', '2 700']);
        await f_v_page(`o_test.o_state.a_o_motor[0].n_position += 40; await o_test.f_tick();`);
        assert.deepEqual(await f_a_s_focus(), ['1 —', '2 —']);
        // folded, the number of points stays readable; back to one point
        await f_v_page(`await o_test.f_click('Focus points');`);
        assert.deepEqual(await f_v_page(`return [!!o_test.f_el('.ml-focus'), o_test.f_el('.ml-dock .cockpit-section-head:has(.ml-fold) .cockpit-readout').textContent];`), [false, '2']);
        await f_v_page(`await o_test.f_click('Focus points'); await o_test.f_type('[aria-label="Number of focus points"]', '0');`);
        assert.deepEqual(await f_v_page(`return [o_test.o_ml.n_cnt__focus, o_test.f_el('[aria-label="Number of focus points"]').value, o_test.f_el_button('capture').disabled];`), [1, '1', false]);
        await f_v_page(`await o_test.f_click('Focus points');`);

        // ── library: a stored image is opened with its boxes; the boxes of the live image wait ──
        await f_drag(0.6, 0.1, 0.8, 0.3);
        await f_v_page(`await o_test.f_click('Images'); await o_test.f_wait(() => o_test.f_el('.ml-library') && document.querySelectorAll('.ml-library-item img').length === 4, 'thumbnails');`);
        assert.deepEqual(await f_v_page(`return [...document.querySelectorAll('.ml-library-item')].map(el => el.querySelector('.ml-library-count').textContent + (el.classList.contains('done') ? ' done' : ''));`),
            ['1 done', '1 done', '0 done', '1 done']);
        // every thumbnail shows the boxes of its image where they lie on it, in the colour of their class
        let a_a_o_rect = await f_v_page(`return [...document.querySelectorAll('.ml-library-item')].map(el => {
            let o_img = el.querySelector('img').getBoundingClientRect();
            return [...el.querySelectorAll('.ml-library-bbox rect')].map(el_rect => {
                let o = el_rect.getBoundingClientRect();
                return { n_x: (o.left - o_img.left) / o_img.width, n_y: (o.top - o_img.top) / o_img.height, n_scl_x: o.width / o_img.width, n_scl_y: o.height / o_img.height, s_color: getComputedStyle(el_rect).color };
            });
        });`);
        assert.deepEqual(a_a_o_rect.map(a_o_rect => a_o_rect.length), [1, 1, 0, 1]);
        let a_o_class__server = (await f_o_request(o_server, 'GET', '/api/dataset/1', { s_token })).v_body.a_o_class;
        // the tiles are newest first, the images of the data server oldest first
        for(let [n_idx, o_image] of (await f_a_o_image()).reverse().entries()){
            for(let [n_idx__bbox, o_bbox] of o_image.a_o_bbox.entries()){
                let o_rect = a_a_o_rect[n_idx][n_idx__bbox];
                let s_what = 'box on the thumbnail of image ' + o_image.n_id;
                f_near(o_rect.n_x, o_bbox.n_trn_x_center_nor - o_bbox.n_scl_x_nor / 2, s_what + ': left');
                f_near(o_rect.n_y, o_bbox.n_trn_y_center_nor - o_bbox.n_scl_y_nor / 2, s_what + ': top');
                f_near(o_rect.n_scl_x, o_bbox.n_scl_x_nor, s_what + ': width');
                f_near(o_rect.n_scl_y, o_bbox.n_scl_y_nor, s_what + ': height');
                let s_color_hex = a_o_class__server.find(o_class => o_class.n_id === o_bbox.n_o_class_n_id).s_color_hex;
                assert.equal(o_rect.s_color, 'rgb(' + [1, 3, 5].map(n => parseInt(s_color_hex.slice(n, n + 2), 16)).join(', ') + ')', s_what + ': colour');
            }
        }
        await f_screenshot('6-library');
        await f_v_page(`await o_test.f_click('Open image 1'); await o_test.f_wait(() => o_test.o_ml.o_image?.n_id === 1 && o_test.o_ml.a_o_bbox.length === 1 && !o_test.f_el('.ml-library'), 'image 1 open');`);
        assert.deepEqual(await f_v_page(`return [o_test.f_a_s_box(), !!o_test.f_el('.ml-stage--live'), !!o_test.f_el('.ml-still'), o_test.f_s_status(), o_test.f_el_button('done').classList.contains('active')];`),
            [['2Luftblase'], false, true, 'image 1 · 1 box · x · y locked', true]);
        // no image is taken while a stored one is shown, and X and Y stay held for the boxes that wait
        assert.equal(await f_v_page(`return o_test.f_el_button('capture').disabled;`), true);
        assert.ok((await f_v_page(`return o_test.f_el_button('capture').dataset.tooltip;`)).includes('A stored image is shown'));
        assert.match(await f_v_page(`return await o_test.f_s_move(0, 100);`), /locked/);
        await f_v_page(`await o_test.f_tick(); await o_test.f_click('stay');`);
        // the boxes of a stored image are saved as they change
        await f_click__mouse('Edit box 1');
        await f_drag(0.45, 0.6, 0.35, 0.5);
        await f_wait_saved();
        a_o_image = await f_a_o_image();
        f_near(a_o_image[0].a_o_bbox[0].n_trn_x_center_nor, 0.35, 'stored image: moved centre x');
        f_near(a_o_image[0].a_o_bbox[0].n_trn_y_center_nor, 0.425, 'stored image: moved centre y');
        // "live": the boxes of the live image are back
        await f_v_page(`await o_test.f_click('live'); await o_test.f_wait(() => !o_test.o_ml.b_still, 'live again');`);
        assert.deepEqual(await f_v_page(`return [o_test.f_a_s_box(), !!o_test.f_el('.ml-stage--live'), o_test.f_s_status()];`), [['1ceratium'], true, '1 box · x · y locked']);
        await f_v_page(`await o_test.f_click('capture'); await o_test.f_wait(() => o_test.o_ml.a_o_image.length === 5 && o_test.o_ml.s_activity === '', 'fifth image');`);
        assert.equal((await f_a_o_image())[4].a_o_bbox.length, 1);
        // delete an image from the library. it is the sixth one stored: the fifth went with the cancelled capture
        await f_v_page(`await o_test.f_click('Images'); await o_test.f_wait(() => o_test.f_el('.ml-library'), 'library');
            await o_test.f_click('Delete image 6'); await o_test.f_wait(() => o_test.o_ml.a_o_image.length === 4, 'image deleted');
            await o_test.f_click('Close images');`);
        assert.equal((await f_a_o_image()).length, 4);

        // ── train: the dataset becomes a model ──
        await f_v_page(`await o_test.f_type('#ml-epoch', '3'); await o_test.f_click('train');
            await o_test.f_wait(() => o_test.o_ml.o_job?.s_status === 'done' && o_test.o_ml.a_o_model.length === 1, 'training done', 15000);`);
        let a_o_model = (await f_o_request(o_server, 'GET', '/api/model', { s_token })).v_body.a_o_model;
        assert.equal(a_o_model.length, 1);
        assert.equal(a_o_model[0].n_o_dataset_n_id, 1);
        assert.equal(await f_v_page(`return o_test.f_el('.ml-dock .cockpit-footer > .cockpit-status').textContent;`), 'trained · 3/3');
        assert.equal(await f_v_page(`return o_test.o_state.o_ml_config.n_id__model;`), a_o_model[0].n_id);

        // ── the model is chosen in a smart selector: its list says when it was made and with how many images ──
        let n_cnt__done = (await f_a_o_image()).filter(o => o.b_done).length;
        assert.deepEqual([n_cnt__done, a_o_model[0].n_cnt__image], [4, 4]);
        assert.equal(await f_v_page(`return o_test.f_el('.ml-model .smart-selector-value').textContent.trim();`), f_s_text__short(a_o_model[0].s_name, 24));
        let f_a_a_s_model = () => f_v_page(`return [...document.querySelectorAll('.smart-selector-list .smart-selector-option')].map(el =>
            [el.querySelector('.smart-selector-option-value').textContent.trim(), el.querySelector('.smart-selector-option-detail')?.textContent.trim() ?? '', el.classList.contains('active')]);`);
        await f_v_page(`await o_test.f_click('Model list');`);
        let a_a_s_model = await f_a_a_s_model();
        assert.deepEqual([a_a_s_model.length, a_a_s_model[0][0], a_a_s_model[0][2]], [1, a_o_model[0].s_name, true]);
        assert.match(a_a_s_model[0][1], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} · 4 images$/);
        await f_v_page(`await o_test.f_key('Escape');`);
        // edit: the model gets another name
        await f_v_page(`await o_test.f_update('model', 'ceratium v1'); await o_test.f_wait(() => o_test.o_ml.a_o_model[0].s_name === 'ceratium v1' && o_test.o_ml.s_activity === '', 'model renamed');`);
        assert.equal((await f_o_request(o_server, 'GET', '/api/model', { s_token })).v_body.a_o_model[0].s_name, 'ceratium v1');
        assert.equal(await f_v_page(`return o_test.f_el('.ml-model .smart-selector-value').textContent.trim();`), 'ceratium v1');
        // "+": a model is not typed in, it is a file. no popup with fields opens, the file dialog does.
        assert.deepEqual(await f_v_page(`let el = document.querySelector('[aria-label="Upload model"]'); let n_cnt__click = 0; el.click = () => { n_cnt__click++; };
            await o_test.f_click('New model'); delete el.click;
            return [n_cnt__click, !!o_test.f_el('.smart-selector-popup')];`), [1, false]);
        await f_v_page(`let el = document.querySelector('[aria-label="Upload model"]'); let o_transfer = new DataTransfer();
            o_transfer.items.add(new File(['FAKEMODEL weights'], 'from elsewhere.pt')); el.files = o_transfer.files; el.dispatchEvent(new Event('change', { bubbles: true }));
            await o_test.f_wait(() => o_test.o_ml.a_o_model.length === 2 && o_test.o_ml.s_activity === '', 'model uploaded');`);
        assert.equal(await f_v_page(`return o_test.f_el('.ml-model .smart-selector-value').textContent.trim();`), 'from elsewhere');
        // with how many images an uploaded model was trained is not known
        await f_v_page(`await o_test.f_click('Model list');`);
        a_a_s_model = await f_a_a_s_model();
        assert.deepEqual(a_a_s_model.map(a => [a[0], a[2]]), [['ceratium v1', false], ['from elsewhere', true]]);
        assert.match(a_a_s_model[0][1], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} · 4 images$/);
        assert.match(a_a_s_model[1][1], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} · — images$/);
        await f_screenshot('7-model-list');
        // the model is at the lower edge of the window: its list opens upwards and stays inside the window
        assert.deepEqual(await f_v_page(`let o_list = o_test.f_el('.smart-selector-list').getBoundingClientRect(); let o_root = o_test.f_el('.ml-model').getBoundingClientRect();
            let a_o_option = [...document.querySelectorAll('.smart-selector-list .smart-selector-option')].map(el => el.getBoundingClientRect());
            return [Math.round(o_root.top - o_list.bottom), o_list.top >= 0, a_o_option.every(o => o.top >= o_list.top - 1 && o.bottom <= o_list.bottom + 1)];`), [4, true, true]);
        // delete in the list, after the question; the model that is left is chosen
        await f_v_page(`o_test.a_s_dialog.length = 0; await o_test.f_click('Delete model from elsewhere'); await o_test.f_wait(() => o_test.o_ml.a_o_model.length === 1 && o_test.o_ml.s_activity === '', 'model deleted');`);
        assert.deepEqual(await f_v_page(`return [o_test.a_s_dialog, o_test.o_state.o_ml_config.n_id__model, o_test.f_el('.ml-model .smart-selector-value').textContent.trim()];`),
            [['Delete the model "from elsewhere"?'], a_o_model[0].n_id, 'ceratium v1']);
        await f_v_page(`await o_test.f_key('Escape'); await o_test.f_tick();`);
        assert.equal((await f_o_request(o_server, 'GET', '/api/model', { s_token })).v_body.a_o_model.length, 1);

        // ── the buttons say what they do: "train" with its pictogram, "detect objects" instead of "infer" ──
        assert.deepEqual(await f_v_page(`return [o_test.f_el_button('train').querySelector('svg path').getAttribute('d').slice(0, 15), o_test.f_el_button('detect objects').textContent.trim(), !!o_test.f_el_button('infer'),
            o_test.f_el_button('detect objects').dataset.tooltip.split('\\n')[0]];`), ['M12 3.5A3.2 3.2', 'detect objects', false, 'Detect objects']);
        // "detect objects" has a line of its own below the model it uses; its words fit, and so do those of "train"
        assert.deepEqual(await f_v_page(`let o_model = o_test.f_el('.ml-model').getBoundingClientRect(); let o_dock = o_test.f_el('.ml-dock').getBoundingClientRect();
            let [el_detect, el_train] = ['detect objects', 'train'].map(s => o_test.f_el_button(s)); let o_detect = el_detect.getBoundingClientRect();
            return [o_detect.top >= o_model.bottom, el_train.getBoundingClientRect().top >= o_detect.bottom, Math.round(o_detect.width) === Math.round(o_model.width), o_detect.right <= o_dock.right,
                el_detect.scrollWidth <= el_detect.clientWidth, el_train.scrollWidth <= el_train.clientWidth];`), [true, true, true, true, true, true]);

        // ── detect objects on the live image: the prediction is drawn on it, nothing is frozen, nothing stored ──
        // while the model is at work the middle of the image says so
        assert.deepEqual(await f_v_page(`let a_s_text = []; let b_cancel = false;
            let n_id__interval = setInterval(() => {
                let el = o_test.f_el('.ml-progress-text');
                if(el && a_s_text.at(-1) !== el.textContent.trim()) a_s_text.push(el.textContent.trim());
                if(o_test.f_el_button('cancel')) b_cancel = true;
            }, 2);
            await o_test.f_click('detect objects'); await o_test.f_wait(() => o_test.o_ml.a_o_prediction.length === 1 && o_test.f_el('.ml-prediction'), 'prediction');
            clearInterval(n_id__interval);
            return [a_s_text, b_cancel, !!o_test.f_el('.ml-progress')];`), [['detecting objects'], false, false]);
        assert.equal(await f_v_page(`return o_test.f_el('.ml-prediction text').textContent.trim();`), 'ceratium 90%');
        assert.deepEqual(await f_v_page(`return [o_test.o_ml.o_image, o_test.o_ml.b_still, !!o_test.f_el('.ml-stage.ml-stage--live'), o_test.f_s_status()];`), [null, false, true, '1 prediction']);
        assert.equal((await f_a_o_image()).length, 4);
        // focusing leaves the prediction where it is; X or Y takes it away at once
        assert.deepEqual(await f_v_page(`return [await o_test.f_s_move(2, 5), o_test.o_ml.a_o_prediction.length];`), ['moved', 1]);
        assert.deepEqual(await f_v_page(`let s_move = await o_test.f_s_move(0, 10); let n_cnt = o_test.o_ml.a_o_prediction.length; await o_test.f_tick();
            return [s_move, n_cnt, !!o_test.f_el('.ml-prediction'), o_test.f_s_status()];`), ['moved', 0, false, '']);
        await f_v_page(`await o_test.f_click('detect objects'); await o_test.f_wait(() => o_test.f_el('.ml-prediction'), 'prediction again');`);
        assert.deepEqual(await f_v_page(`let o_index = await import('./index.js'); o_index.f_send_esp({ motor: 1, command: 'runContinuous', n_rpm: 5, direction: 'cw' }); await o_test.f_tick();
            return [o_test.o_ml.a_o_prediction.length, !!o_test.f_el('.ml-prediction')];`), [0, false]);
        // the stage moves while the model is asked: the answer belongs to another field of view and is not shown
        await f_v_page(`o_test.f_el_button('detect objects').click(); await o_test.f_s_move(1, 10); await o_test.f_wait(() => o_test.o_ml.s_activity === '', 'the answer of the model');`);
        assert.deepEqual(await f_v_page(`return [o_test.o_ml.a_o_prediction.length, o_test.o_ml.s_error];`), [0, '']);
        // while X or Y is moving there is nothing to detect on
        await f_v_page(`o_test.o_state.a_o_motor[1].b_running = true; await o_test.f_click('detect objects'); await o_test.f_wait(() => o_test.o_ml.s_activity === '', 'refused');`);
        assert.match(await f_v_page(`return o_test.o_ml.s_error;`), /X or Y is moving/);
        assert.equal(await f_v_page(`return o_test.o_ml.a_o_prediction.length;`), 0);
        await f_v_page(`o_test.o_state.a_o_motor[1].b_running = false; o_test.o_state.a_o_toast.length = 0;`);
        // with the prediction as a guide a box is drawn. the box holds the field of view, so the prediction stays too.
        await f_v_page(`await o_test.f_click('detect objects'); await o_test.f_wait(() => o_test.f_el('.ml-prediction'), 'prediction for the box');`);
        await f_drag(0.2, 0.2, 0.4, 0.4);
        assert.deepEqual(await f_v_page(`return [o_test.f_a_s_box(), o_test.f_s_status()];`), [['1ceratium'], '1 box · 1 prediction · x · y locked']);
        assert.match(await f_v_page(`return await o_test.f_s_move(0, 10);`), /locked/);
        await f_v_page(`await o_test.f_tick(); await o_test.f_click('stay');`);
        assert.equal(await f_v_page(`return !!o_test.f_el('.ml-prediction');`), true);
        await f_screenshot('7-prediction');
        await f_v_page(`await o_test.f_click('Show predictions');`);
        assert.equal(await f_v_page(`return !!o_test.f_el('.ml-prediction');`), false);
        // capture stores the camera image with the box; the prediction is never a box
        await f_v_page(`await o_test.f_click('capture'); await o_test.f_wait(() => o_test.o_ml.a_o_image.length === 5 && o_test.o_ml.s_activity === '', 'image stored');`);
        a_o_image = await f_a_o_image();
        assert.deepEqual([a_o_image.length, a_o_image[4].a_o_bbox.length, a_o_image[4].b_done], [5, 1, true]);
        assert.deepEqual(await f_v_page(`return [o_test.o_ml.b_still, o_test.o_ml.a_o_prediction.length, o_test.o_ml.a_o_bbox.length];`), [false, 0, 0]);
        // a stored image: the prediction belongs to the image, so the motors do not take it away; "live" does
        await f_v_page(`await o_test.f_click('Images'); await o_test.f_wait(() => o_test.f_el('.ml-library'), 'library');
            await o_test.f_click('Open image 1'); await o_test.f_wait(() => o_test.o_ml.o_image?.n_id === 1, 'stored image');
            await o_test.f_click('detect objects'); await o_test.f_wait(() => o_test.f_el('.ml-prediction'), 'prediction on the stored image');`);
        assert.deepEqual(await f_v_page(`return [await o_test.f_s_move(0, 10), o_test.o_ml.a_o_prediction.length, !!o_test.f_el('.ml-stage--live')];`), ['moved', 1, false]);
        await f_v_page(`await o_test.f_click('live'); await o_test.f_wait(() => !o_test.o_ml.b_still, 'live again');`);
        assert.deepEqual(await f_v_page(`return [o_test.o_ml.a_o_prediction.length, o_test.o_ml.a_o_bbox.length, o_test.f_s_status()];`), [0, 0, '']);

        // ── export: the archive is downloaded under the name of the dataset ──
        await f_v_page(`await o_test.f_click('export'); await o_test.f_wait(() => o_test.a_s_download.length === 1, 'download');`);
        // the page only opens a link; the browser itself downloads the archive, without a token
        let s_url__export = await f_v_page(`return o_test.a_s_download[0];`);
        assert.ok(s_url__export.startsWith(o_server.s_url + '/api/export/'));
        let o_response__export = await fetch(s_url__export);
        assert.equal(o_response__export.status, 200);
        assert.match(o_response__export.headers.get('content-disposition'), /filename="Ceratium_Test_\d{4}-\d{2}-\d{2}\.tar"/);
        assert.ok((await o_response__export.arrayBuffer()).byteLength > 2048);

        // ── a class with boxes is deleted only after the question ──
        await f_v_page(`o_test.a_s_dialog.length = 0; await o_test.f_click('Delete class Luftblase'); await o_test.f_wait(() => o_test.o_ml.a_o_class.length === 1, 'class deleted');`);
        assert.match(await f_v_page(`return o_test.a_s_dialog[0];`), /used by 1 boxes/);
        assert.equal((await f_a_o_image())[0].a_o_bbox.length, 0);

        // ── a second dataset: the list shows the image captured last, chooses, and deletes after the name is typed ──
        await f_v_page(`await o_test.f_create('dataset', 'Diatomeen'); await o_test.f_wait(() => o_test.o_ml.a_o_dataset.length === 2 && o_test.o_state.o_ml_config.n_id__dataset === 2 && o_test.o_ml.s_activity === '', 'second dataset');`);
        assert.deepEqual([await f_s_dataset(), await f_v_page(`return o_test.o_ml.a_o_class.length;`)], ['Diatomeen', 0]);
        await f_v_page(`await o_test.f_click('Dataset list'); await o_test.f_wait(() => o_test.f_a_o_option().some(o => o.b_image), 'image in the list of datasets');`);
        assert.deepEqual(await f_v_page(`return o_test.f_a_o_option();`), [
            { s_name: 'Ceratium Test', b_active: false, b_image: true },
            { s_name: 'Diatomeen', b_active: true, b_image: false },
        ]);
        await f_v_page(`await o_test.f_choose('Ceratium Test'); await o_test.f_wait(() => o_test.o_ml.a_o_image.length === 5 && o_test.o_ml.s_activity === '', 'first dataset again');`);
        assert.equal(await f_s_dataset(), 'Ceratium Test');
        // a wrong name deletes nothing
        await f_v_page(`o_test.a_s_dialog.length = 0; window.s_answer__prompt = 'diatomeen'; await o_test.f_click('Dataset list'); await o_test.f_click('Delete dataset Diatomeen'); await o_test.f_tick();`);
        assert.match(await f_v_page(`return o_test.a_s_dialog.join(' | ');`), /Type the name of the dataset.*\| The name does not match/s);
        assert.equal(await f_v_page(`return o_test.o_ml.a_o_dataset.length;`), 2);
        await f_v_page(`window.s_answer__prompt = 'Diatomeen'; await o_test.f_click('Delete dataset Diatomeen'); await o_test.f_wait(() => o_test.o_ml.a_o_dataset.length === 1 && o_test.o_ml.s_activity === '', 'dataset deleted');
            window.s_answer__prompt = undefined; await o_test.f_key('Escape');`);
        assert.deepEqual([await f_s_dataset(), await f_v_page(`return o_test.o_ml.a_o_image.length;`)], ['Ceratium Test', 5]);

        // ── reload: the session is restored and shown in the top bar, the window closed ──
        await f_open_page();
        await f_v_page(`await o_test.f_wait(() => o_test.o_ml.o_person && o_test.o_ml.a_o_image.length === 5, 'session restored');`);
        assert.equal(await f_v_page(`return o_test.f_s_bar();`), '{no slide} | privat1 | jonas');
        assert.equal(await f_v_page(`return !!o_test.f_el('#ml-login-person') || !!o_test.f_el('.ml-dock') || !!o_test.f_el('.ml-stage');`), false);

        // ── the session ends on the server (restart, idle time): the top bar shows the login again ──
        let s_token__page = await f_v_page(`return localStorage.getItem('omm.dataserver.s_token');`);
        assert.equal((await f_o_request(o_server, 'POST', '/api/logout', { s_token: s_token__page })).n_status, 204);
        await f_v_page(`await (await import('./o_ml.module.js')).f_refresh_status();
            await o_test.f_wait(() => !o_test.o_ml.o_person && o_test.f_el('#ml-login-person'), 'login is back');`);
        assert.equal(await f_v_page(`return localStorage.getItem('omm.dataserver.s_token');`), null);
        assert.match(await f_v_page(`return o_test.o_state.a_o_toast.map(o => o.s_message).join();`), /session of the data server has ended/);

        // ── login again, open the window, logout with its own button ──
        await f_v_page(`o_test.o_state.a_o_toast.length = 0;
            await o_test.f_type('#ml-login-organisation', 'privat1'); await o_test.f_type('#ml-login-person', 'jonas'); await o_test.f_click('log in');
            await o_test.f_wait(() => o_test.o_ml.o_person && o_test.o_ml.a_o_image.length === 5, 'logged in again');
            o_test.o_state.o_panel_visibility.ml_training = true; await o_test.f_wait(() => o_test.f_el('.ml-dock .ml-dataset'), 'dock');`);
        await f_v_page(`await o_test.f_click('Log out'); await o_test.f_wait(() => !o_test.o_ml.o_person && o_test.f_el('#ml-login-person'), 'logged out');`);
        assert.equal(await f_v_page(`return localStorage.getItem('omm.dataserver.s_token');`), null);
        // the window has nothing to show without a login and says so
        assert.equal(await f_v_page(`return o_test.f_el('.ml-dock .cockpit-status').textContent;`), 'not logged in');
        assert.equal(await f_v_page(`return !!o_test.f_el('.ml-dock .ml-dataset') || !!o_test.f_el('.ml-stage');`), false);

        // ── closing the window gives the whole screen back to the image ──
        await f_v_page(`await o_test.f_click('Close ML Training');`);
        assert.equal(await f_v_page(`return document.body.classList.contains('ml-docked') || !!o_test.f_el('.ml-dock');`), false);
        assert.equal(await f_v_page(`return document.querySelector('#webcamVideo').getBoundingClientRect().width;`), 1600);
        await f_v_page(`o_test.f_check();`);
        await f_send('Browser.close');
    } finally {
        try { o_socket?.close(); } catch { /* closed already */ }
        try { o_chrome?.kill('SIGKILL'); } catch { /* ended already */ }
        await o_chrome?.status;
        await o_server__static.shutdown();
        await o_server.f_stop();
        await Deno.remove(s_path__profile, { recursive: true }).catch(() => {});
    }
});
