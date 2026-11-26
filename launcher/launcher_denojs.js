#!/usr/bin/env -S deno run -A
// run: deno task launch     (or "MicroMatic" in the application menu, see install.js)
//
// starts the application server and the data server in this terminal and opens
// the application in the browser. servers of this checkout that are running
// already are stopped first: starting again is a restart.
// before the servers start, what the data server needs for training and
// prediction is installed when it is missing (the task "install_ml").
// closing the terminal window or Ctrl+C stops both.
//
//   --no-browser     do not open the browser
//   --root <folder>  the checkout whose tasks "install_ml", "server" and "dataserver"
//                    are run (default: the checkout this file lies in)

import { f_o_config } from '../dataserver/config.module.js';
import { A_S_NAME__BROWSER, f_a_s_arg__task, f_n_port__app, f_a_n_pid__listening } from './launcher.module.js';

// run before the servers start. with everything in place it only reads what is
// installed and is done in a moment, so every start can afford it.
let S_NAME__TASK__INSTALL = 'install_ml';
let N_MS__START_TIMEOUT = 120 * 1000;
let N_MS__STOP_TIMEOUT = 5 * 1000;
let N_MS__POLL = 150;

let b_browser = !Deno.args.includes('--no-browser');
let n_idx__root = Deno.args.indexOf('--root');
let s_path__root = Deno.realPathSync(n_idx__root !== -1 && Deno.args[n_idx__root + 1]
    ? Deno.args[n_idx__root + 1]
    : decodeURIComponent(new URL('..', import.meta.url).pathname));

let f_log = function(s_message){
    console.log('  ' + s_message);
};

let f_sleep = function(n_ms){
    return new Promise(function(f_resolve){ setTimeout(f_resolve, n_ms); });
};

// ─── Which servers ──────────────────────────────────────────────────

let f_o_task = async function(){
    return JSON.parse(await Deno.readTextFile(s_path__root + '/deno.json')).tasks || {};
};

// the tasks the servers are started with by hand are the ones started here
let f_a_o_server = function(o_task){
    let f_a_s_arg = function(s_name__task){
        let a_s_arg = f_a_s_arg__task(o_task[s_name__task]);
        if(!a_s_arg) throw new Error(`The task "${s_name__task}" of deno.json is missing or is more than one plain deno command. The launcher cannot start it.`);
        return a_s_arg;
    };
    let o_config__data = f_o_config();
    let a_s_arg__app = f_a_s_arg('server');
    let n_port__app = f_n_port__app(a_s_arg__app);
    return [
        { s_name: 'application', a_s_arg: a_s_arg__app, s_hostname: '127.0.0.1', n_port: n_port__app, s_url: 'http://localhost:' + n_port__app },
        { s_name: 'data server', a_s_arg: f_a_s_arg('dataserver'), s_hostname: o_config__data.s_hostname, n_port: o_config__data.n_port, s_url: `http://${o_config__data.s_hostname}:${o_config__data.n_port}` },
    ];
};

// ─── Ports and processes ────────────────────────────────────────────

let f_b_port__open = async function(o_server){
    try {
        (await Deno.connect({ hostname: o_server.s_hostname, port: o_server.n_port })).close();
        return true;
    } catch {
        return false;
    }
};

// the processes of this user that listen on the port. empty where `ss` is missing.
let f_a_n_pid__on_port = async function(n_port){
    try {
        let o_output = await new Deno.Command('ss', { args: ['-H', '-ltnp', `sport = :${n_port}`], stdin: 'null', stdout: 'piped', stderr: 'null' }).output();
        return f_a_n_pid__listening(new TextDecoder().decode(o_output.stdout));
    } catch {
        return [];
    }
};

// a server of this checkout: it was started in its folder
let f_b_process__own = function(n_pid){
    try {
        return Deno.realPathSync(`/proc/${n_pid}/cwd`) === s_path__root;
    } catch {
        return false;
    }
};

let f_kill = function(n_pid, s_signal){
    try { Deno.kill(n_pid, s_signal); } catch { /* it has ended already */ }
};

// true once none of the servers answers any more
let f_b_wait_closed = async function(a_o_server, n_ms){
    let n_ts_ms__end = Date.now() + n_ms;
    while(Date.now() < n_ts_ms__end){
        let a_b_open = await Promise.all(a_o_server.map(f_b_port__open));
        if(!a_b_open.includes(true)) return true;
        await f_sleep(N_MS__POLL);
    }
    return false;
};

// stop the servers of this checkout that are running. true when there were any.
// a port held by another program is not touched: that is said and nothing is started.
let f_b_stop_running = async function(a_o_server){
    let a_n_pid = [];
    for(let o_server of a_o_server){
        let a_n_pid__port = await f_a_n_pid__on_port(o_server.n_port);
        for(let n_pid of a_n_pid__port){
            if(!f_b_process__own(n_pid)){
                throw new Error(`Port ${o_server.n_port} of the ${o_server.s_name} is used by another program (process ${n_pid}). Stop it, then start MicroMatic again.`);
            }
            a_n_pid.push(n_pid);
        }
        if(a_n_pid__port.length === 0 && await f_b_port__open(o_server)){
            throw new Error(`Port ${o_server.n_port} of the ${o_server.s_name} is in use, and it cannot be seen by which program. Stop it, then start MicroMatic again.`);
        }
    }
    if(a_n_pid.length === 0) return false;
    f_log('stopping the running servers ...');
    for(let n_pid of a_n_pid) f_kill(n_pid, 'SIGTERM');
    if(await f_b_wait_closed(a_o_server, N_MS__STOP_TIMEOUT)) return true;
    for(let n_pid of a_n_pid) f_kill(n_pid, 'SIGKILL');
    if(await f_b_wait_closed(a_o_server, N_MS__STOP_TIMEOUT)) return true;
    throw new Error('The running servers did not stop.');
};

// ─── Browser ────────────────────────────────────────────────────────

let f_s_path__program = function(s_name){
    for(let s_path_folder of (Deno.env.get('PATH') || '').split(':')){
        if(s_path_folder === '') continue;
        try {
            if(Deno.statSync(s_path_folder + '/' + s_name).isFile) return s_path_folder + '/' + s_name;
        } catch { /* not in this folder */ }
    }
    return '';
};

// the browser is started apart from this terminal: closing the window must not close the browser
let f_open_browser = async function(s_url){
    let s_path__browser = A_S_NAME__BROWSER.map(f_s_path__program).find(function(s_path){ return s_path !== ''; });
    if(!s_path__browser){
        f_log('no browser found. open ' + s_url + ' yourself.');
        return;
    }
    let s_path__setsid = f_s_path__program('setsid');
    let a_s_command = s_path__setsid ? [s_path__setsid, '-f', s_path__browser, s_url] : [s_path__browser, s_url];
    try {
        let o_process = new Deno.Command(a_s_command[0], { args: a_s_command.slice(1), stdin: 'null', stdout: 'null', stderr: 'null' }).spawn();
        o_process.unref();
    } catch (o_error) {
        f_log('the browser could not be started (' + o_error.message + '). open ' + s_url + ' yourself.');
    }
};

// ─── Install ────────────────────────────────────────────────────────

// run the install task of the checkout and wait for it. a checkout without
// one is started as it is. what could not be installed does not keep the
// servers from starting: the application says which model cannot be trained.
let f_install = async function(o_task, s_path){
    let a_s_arg = f_a_s_arg__task(o_task[S_NAME__TASK__INSTALL]);
    if(!a_s_arg) return;
    let b_success = false;
    try {
        b_success = (await new Deno.Command(Deno.execPath(), {
            args: a_s_arg, cwd: s_path__root, env: { PATH: s_path }, stdin: 'null', stdout: 'inherit', stderr: 'inherit',
        }).spawn().status).success;
    } catch { /* said below */ }
    if(!b_success) f_log('not everything could be installed, see above. the servers are started all the same.');
    console.log('');
};

// ─── Run ────────────────────────────────────────────────────────────

let a_o_process = [];
let b_stopping = false;

let f_stop_process = function(){
    for(let o_process of a_o_process) f_kill(o_process.pid, 'SIGTERM');
};

// the terminal window stays until its message was read
let f_exit = async function(n_code, s_message){
    if(s_message){
        console.error('\n  ✗ ' + s_message);
        if(Deno.stdin.isTerminal()){
            console.error('    press Enter to close this window');
            await Deno.stdin.read(new Uint8Array(1024)).catch(function(){});
        }
    }
    Deno.exit(n_code);
};

let f_run = async function(){
    if(Deno.stdout.isTerminal()) await Deno.stdout.write(new TextEncoder().encode('\x1b]0;MicroMatic\x07'));
    console.log('\n  MicroMatic\n');
    let o_task = await f_o_task();
    let a_o_server = f_a_o_server(o_task);
    let b_restart = await f_b_stop_running(a_o_server);

    // the servers find deno and what the installer put next to it, also when the desktop started this
    let s_path = [Deno.execPath().replace(/\/[^/]*$/, ''), Deno.env.get('PATH') || ''].join(':');
    await f_install(o_task, s_path);
    let a_o_end = [];
    for(let o_server of a_o_server){
        let o_process = new Deno.Command(Deno.execPath(), {
            args: o_server.a_s_arg, cwd: s_path__root, env: { PATH: s_path }, stdin: 'null', stdout: 'inherit', stderr: 'inherit',
        }).spawn();
        a_o_process.push(o_process);
        a_o_end.push(o_process.status.then(function(o_status){ return { o_server, o_status }; }));
    }
    // the first server that ends, ends the other one too
    let o_promise__end = Promise.race(a_o_end);

    for(let s_signal of ['SIGINT', 'SIGTERM', 'SIGHUP']){
        Deno.addSignalListener(s_signal, function(){
            b_stopping = true;
            f_stop_process();
        });
    }

    let n_ts_ms__end = Date.now() + N_MS__START_TIMEOUT;
    let b_ready = false;
    while(!b_ready && Date.now() < n_ts_ms__end){
        let o_end = await Promise.race([o_promise__end, f_sleep(N_MS__POLL).then(function(){ return null; })]);
        if(o_end) break;
        b_ready = !(await Promise.all(a_o_server.map(f_b_port__open))).includes(false);
    }
    if(b_ready){
        for(let o_server of a_o_server) f_log(`${o_server.s_name.padEnd(12)} ${o_server.s_url}`);
        f_log(b_restart ? 'started again.' : 'started.');
        f_log('close this window or press Ctrl+C to stop both. start MicroMatic again to restart them.\n');
        if(b_browser) await f_open_browser(a_o_server[0].s_url);
    }

    let o_end = b_ready || b_stopping ? await o_promise__end : await Promise.race([o_promise__end, Promise.resolve(null)]);
    f_stop_process();
    let b_ended = await Promise.race([Promise.all(a_o_end).then(function(){ return true; }), f_sleep(N_MS__STOP_TIMEOUT).then(function(){ return false; })]);
    if(!b_ended){
        for(let o_process of a_o_process) f_kill(o_process.pid, 'SIGKILL');
        await Promise.all(a_o_end);
    }
    // stopped on purpose: by this window, or by a newer start that took over. a server that
    // was told to stop ends by the signal or, when it tidies up first, with exit code 0.
    if(b_stopping || (o_end && (o_end.o_status.signal || o_end.o_status.code === 0))) return await f_exit(0, '');
    if(!o_end) return await f_exit(1, 'The servers did not start in time.');
    await f_exit(1, `The ${o_end.o_server.s_name} ended (exit code ${o_end.o_status.code}). Its last lines above say why.`);
};

try {
    await f_run();
} catch (o_error) {
    f_stop_process();
    await f_exit(1, o_error.message);
}
