// The read-out of the motors in the top bar in a real browser: the caps of the
// jog keys light up while the keys are pressed, the positions follow the motors.
// The application around it is replaced by a small index.js.
import assert from 'node:assert/strict';

let f_o_response__javascript = s_text => new Response(s_text, { headers: { 'content-type': 'text/javascript' } });

let s_index = `
    import { reactive } from './lib/vue.esm-browser.js';
    export const o_state = reactive({
        b_connected__esp: false, b_scanning: false, b_flashing: false,
        o_motor__axis: { x: 0, y: 1, z: 2 },
        a_o_motor: [{ n_position: 0 }, { n_position: 0 }, { n_position: 0 }],
    });
    export function f_n_motor__axis(s_axis) { let n_motor = o_state.o_motor__axis[s_axis]; return Number.isInteger(n_motor) ? n_motor : null; }
`;

let s_test = `
    import { createApp, nextTick } from './lib/vue.esm-browser.js';
    import { o_component__motor_readout } from './o_component__motor_readout.js';
    import { o_actions, o_action_ui } from './o_actions.js';
    import { o_state } from './index.js';
    let f_check = (b_ok, s_what) => { if(!b_ok) throw new Error(s_what); };
    let f_tick = async () => { await nextTick(); await new Promise(f_resolve => setTimeout(f_resolve, 20)); };
    let a_s_error = [];
    try {
        // in the application the jog registers these actions
        for(let s_key of ['q', 'w', 'e', 'a', 's', 'd']) o_actions.f_register({ id: 'motion.key.' + s_key, name: s_key, bindings: [{ source: 'keyboard', keys: [s_key] }], invoke() {} });
        let o_app = createApp(o_component__motor_readout);
        o_app.config.warnHandler = s_message => a_s_error.push('warn: ' + s_message);
        o_app.config.errorHandler = o_error => a_s_error.push('error: ' + (o_error.stack || o_error));
        o_app.mount('#app');
        await f_tick();
        let f_s_cap = () => [...document.querySelectorAll('.motor-key')].map(el => el.textContent.trim() || '_').join('');
        let f_s_lit = () => [...document.querySelectorAll('.motor-key.pressed')].map(el => el.dataset.key).join('');
        let f_s_position = () => [...document.querySelectorAll('.motor-position span')].map(el => el.textContent.trim()).join(' ');
        let f_b_idle = () => document.querySelector('.motor-key-grid').classList.contains('idle');
        let f_key = async (s_type, s_key, o_init = {}, el = document.body) => { el.dispatchEvent(new KeyboardEvent(s_type, { key: s_key, bubbles: true, ...o_init })); await f_tick(); };
        // the keymap is edited in the search of the action system; closing it shows the new keys
        let f_bind = async (s_key, a_s_key) => {
            o_actions.f_set('motion.key.' + s_key, { ...o_actions.f_config('motion.key.' + s_key), bindings: a_s_key ? [{ source: 'keyboard', keys: a_s_key }] : [] }, true);
            o_action_ui.open = true; await f_tick(); o_action_ui.open = false; await f_tick();
        };

        // the keys as they lie on the keyboard; nothing is connected
        f_check(f_s_cap() === 'QWEASD', 'caps: ' + f_s_cap());
        f_check(f_b_idle() && f_s_position() === 'x— y— z—', 'not connected: ' + f_s_position());
        f_check(document.querySelector('.motor-key-grid').dataset.tooltip.includes('not connected'), 'the tooltip says why the keys move nothing');

        // a key lights up while it is held
        for(let s_key of ['q', 'w', 'e', 'a', 's', 'd']){
            await f_key('keydown', s_key);
            f_check(f_s_lit() === s_key, s_key + ' lit while held: ' + f_s_lit());
            await f_key('keyup', s_key);
            f_check(f_s_lit() === '', s_key + ' dark after release');
        }
        await f_key('keydown', 'w'); await f_key('keydown', 'd');
        f_check(f_s_lit() === 'wd', 'two keys: ' + f_s_lit());
        await f_key('keyup', 'w');
        f_check(f_s_lit() === 'd', 'one released: ' + f_s_lit());
        // the window loses the keyboard: the release would never arrive
        window.dispatchEvent(new Event('blur')); await f_tick();
        f_check(f_s_lit() === '', 'blur releases');
        // Ctrl+A is another command; a letter typed into a field is no jog key
        await f_key('keydown', 'a', { ctrlKey: true });
        f_check(f_s_lit() === '', 'Ctrl+A');
        await f_key('keyup', 'a', { ctrlKey: true }); await f_key('keyup', 'Control');
        let el_input = document.querySelector('#field');
        await f_key('keydown', 'w', {}, el_input);
        f_check(f_s_lit() === '', 'typing lights nothing');
        await f_key('keyup', 'w', {}, el_input);
        // the search of the action system takes the keyboard
        await f_key('keydown', 's');
        o_action_ui.open = true; await f_tick();
        f_check(f_s_lit() === '', 'the open search releases');
        await f_key('keydown', 's');
        f_check(f_s_lit() === '', 'no jog key while the search is open');
        o_action_ui.open = false; await f_key('keyup', 's');

        // connected: the positions of the axes, in whole steps
        o_state.b_connected__esp = true;
        Object.assign(o_state.a_o_motor[0], { n_position: 722 }); Object.assign(o_state.a_o_motor[1], { n_position: -1740 }); Object.assign(o_state.a_o_motor[2], { n_position: 659.4 });
        await f_tick();
        f_check(!f_b_idle() && f_s_position() === 'x722 y-1740 z659', 'connected: ' + f_s_position());
        // the axes are assigned to other motors, one to none
        o_state.o_motor__axis = { x: 2, y: 0, z: null }; await f_tick();
        f_check(f_s_position() === 'x659 y722 z—', 'axes on other motors: ' + f_s_position());
        o_state.o_motor__axis = { x: 0, y: 1, z: 2 };
        // a scan drives the motors itself
        o_state.b_scanning = true; await f_tick();
        f_check(f_b_idle() && document.querySelector('.motor-key-grid').dataset.tooltip.includes('scan'), 'scan: the keys move nothing');
        o_state.b_scanning = false;

        // another keymap: the cap shows the key the action is bound to, and that key lights it
        await f_bind('w', ['ArrowUp']);
        f_check(f_s_cap() === 'Q↑EASD', 'rebound: ' + f_s_cap());
        await f_key('keydown', 'ArrowUp');
        f_check(f_s_lit() === 'w', 'the new key lights the cap: ' + f_s_lit());
        await f_key('keyup', 'ArrowUp'); await f_key('keydown', 'w');
        f_check(f_s_lit() === '', 'the old key no longer does');
        await f_key('keyup', 'w');
        // an action without a key: an empty cap that never lights
        await f_bind('q', null);
        f_check(f_s_cap() === '_↑EASD', 'unbound: ' + f_s_cap());
        await f_key('keydown', 'q');
        f_check(f_s_lit() === '', 'unbound never lights');
        f_check(!a_s_error.length, a_s_error.join(' | '));
        o_app.unmount();
        document.body.dataset.result = 'PASS';
    } catch (o_error) { document.body.dataset.result = 'FAIL'; document.body.textContent = o_error.stack + ' | ' + a_s_error.join(' | '); }
`;

Deno.test('top bar: the jog keys light up while pressed, the positions follow the motors', async () => {
    let s_path__profile = await Deno.makeTempDir();
    let o_server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, async o_request => {
        let s_path = new URL(o_request.url).pathname;
        if(s_path === '/') return new Response('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/index.css"><input id="field"><div class="toolbar-group toolbar-group--motor" id="toolbar-motor"></div><div id="app"></div><script type="module" src="/test.js"></script>', { headers: { 'content-type': 'text/html' } });
        if(s_path === '/index.js') return f_o_response__javascript(s_index);
        if(s_path === '/test.js') return f_o_response__javascript(s_test);
        try {
            return new Response(await Deno.readFile(new URL('../webserved_dir' + s_path, import.meta.url)),
                { headers: { 'content-type': s_path.endsWith('.css') ? 'text/css' : 'text/javascript' } });
        } catch { return new Response('', { status: 404 }); }
    });
    try {
        let o_result = await new Deno.Command('/usr/bin/google-chrome', { args: [
            '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--user-data-dir=' + s_path__profile,
            '--virtual-time-budget=15000', '--dump-dom', 'http://127.0.0.1:' + o_server.addr.port,
        ], stdout: 'piped', stderr: 'piped' }).output();
        let s_html = new TextDecoder().decode(o_result.stdout);
        assert.ok(s_html.includes('data-result="PASS"'), s_html.slice(-3000) + '\n' + new TextDecoder().decode(o_result.stderr).slice(-600));
    } finally {
        await o_server.shutdown();
        await Deno.remove(s_path__profile, { recursive: true }).catch(() => {});
    }
});
