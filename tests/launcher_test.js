// The launcher: the desktop entry that install.js writes, and starting,
// restarting and stopping the two servers. The servers are replaced by small
// stand-ins in a temporary checkout; no browser is opened.
import assert from 'node:assert/strict';
import {
    f_s_path__desktop_entry, f_s_arg__exec, f_s_desktop_entry, f_a_s_arg__task, f_n_port__app, f_a_n_pid__listening,
    f_s_path__desktop_icon, f_b_chromium_snap__usb,
} from '../launcher/launcher.module.js';

let s_path__repository = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');

let f_o_output = async function(s_program, a_s_arg, o_option = {}){
    try {
        let o_output = await new Deno.Command(s_program, { args: a_s_arg, stdin: 'null', stdout: 'piped', stderr: 'piped', ...o_option }).output();
        return { b_found: true, n_code: o_output.code, s_stdout: new TextDecoder().decode(o_output.stdout), s_stderr: new TextDecoder().decode(o_output.stderr) };
    } catch (o_error) {
        if(o_error instanceof Deno.errors.NotFound) return { b_found: false, n_code: -1, s_stdout: '', s_stderr: '' };
        throw o_error;
    }
};

Deno.test('the desktop entry lies where the desktop looks for the entries of the user', () => {
    assert.equal(f_s_path__desktop_entry(undefined, '/home/jonas'), '/home/jonas/.local/share/applications/micromatic.desktop');
    assert.equal(f_s_path__desktop_entry('', '/home/jonas'), '/home/jonas/.local/share/applications/micromatic.desktop');
    assert.equal(f_s_path__desktop_entry('/data/share', '/home/jonas'), '/data/share/applications/micromatic.desktop');
});

Deno.test('an argument of the Exec line: plain as it is, anything else quoted', () => {
    assert.equal(f_s_arg__exec('/home/jonas/.deno/bin/deno'), '/home/jonas/.deno/bin/deno');
    assert.equal(f_s_arg__exec('-A'), '-A');
    assert.equal(f_s_arg__exec('/home/jonas/My Projects/MicroMatic'), '"/home/jonas/My Projects/MicroMatic"');
    assert.equal(f_s_arg__exec(''), '""');
    // % begins a field code, so it is written twice
    assert.equal(f_s_arg__exec('/data/100%/x'), '/data/100%%/x');
    // inside the quotes " ` $ and \ get a backslash, and every backslash of the line is written twice
    assert.equal(f_s_arg__exec('/a "b" $c `d` e\\f'), '"/a \\\\"b\\\\" \\\\$c \\\\`d\\\\` e\\\\\\\\f"');
    for(let s_arg of ['a;b', 'a&b', 'a|b', 'a>b', "a'b", 'a~b', 'a*b', 'a?b', 'a#b', 'a(b)']){
        assert.equal(f_s_arg__exec(s_arg), '"' + s_arg + '"', s_arg);
    }
});

Deno.test('the desktop entry: MicroMatic, in a terminal, with absolute paths', () => {
    let s_entry = f_s_desktop_entry({
        s_path__deno: '/home/jonas/.deno/bin/deno',
        s_path__launcher: '/home/jonas/code/MicroMatic/launcher/launcher_denojs.js',
        s_path__root: '/home/jonas/code/MicroMatic',
        s_path__icon: '/home/jonas/code/MicroMatic/launcher/icon_lux.svg',
    });
    assert.equal(s_entry, [
        '[Desktop Entry]',
        'Type=Application',
        'Name=MicroMatic',
        'Comment=Start the microscope application and its data server, or start them again',
        'Exec=/home/jonas/.deno/bin/deno run -A /home/jonas/code/MicroMatic/launcher/launcher_denojs.js',
        'Path=/home/jonas/code/MicroMatic',
        'Icon=/home/jonas/code/MicroMatic/launcher/icon_lux.svg',
        'Terminal=true',
        'Categories=Science;',
        'Keywords=microscope;Mikroskop;Lux;',
        'StartupNotify=false',
        '',
    ].join('\n'));
    assert.throws(() => f_s_desktop_entry({ s_path__deno: '/a\nb', s_path__launcher: '/l', s_path__root: '/r', s_path__icon: '/i' }), /line break/);
});

Deno.test('the desktop starts what the entry says, also for a checkout in a folder with an awkward name', async () => {
    let s_path__tmp = await Deno.realPath(await Deno.makeTempDir({ prefix: 'omm_launcher_' }));
    try {
        let s_path__root = s_path__tmp + '/My "Projects" $x `y` 100% a\\b/MicroMatic';
        // in the place of deno: a program that writes down how it was started
        let s_path__program = s_path__tmp + '/bin "q" $x `y` a\\b/deno';
        await Deno.mkdir(s_path__root + '/launcher', { recursive: true });
        await Deno.mkdir(s_path__program.replace(/\/[^/]*$/, ''), { recursive: true });
        await Deno.writeTextFile(s_path__program, '#!/bin/sh\n{ printf \'%s\\n\' "$0" "$@"; pwd; } > "$(dirname "$0")/started.txt.part"\nmv "$(dirname "$0")/started.txt.part" "$(dirname "$0")/started.txt"\n', { mode: 0o755 });
        await Deno.copyFile(s_path__repository + '/launcher/icon_lux.svg', s_path__root + '/launcher/icon_lux.svg');
        let o_path = { s_path__deno: s_path__program, s_path__launcher: s_path__root + '/launcher/launcher_denojs.js', s_path__root, s_path__icon: s_path__root + '/launcher/icon_lux.svg' };
        let s_entry = f_s_desktop_entry(o_path);
        let s_path__entry = s_path__tmp + '/micromatic.desktop';
        await Deno.writeTextFile(s_path__entry, s_entry);

        let o_validate = await f_o_output('desktop-file-validate', [s_path__entry]);
        if(o_validate.b_found) assert.equal(o_validate.s_stdout + o_validate.s_stderr, '', 'desktop-file-validate');

        // GLib, the library of the desktop, starts the entry. without a terminal window here:
        // what is asked is how the Exec line and the folder are read.
        let s_path__entry__plain = s_path__tmp + '/micromatic_plain.desktop';
        await Deno.writeTextFile(s_path__entry__plain, s_entry.replace('Terminal=true', 'Terminal=false'));
        let o_glib = await f_o_output('python3', ['-c', `
import sys
import gi
gi.require_version('Gio', '2.0')
from gi.repository import Gio
o_info = Gio.DesktopAppInfo.new_from_filename(sys.argv[1])
print(o_info.get_name())
o_info.launch([], None)`, s_path__entry__plain]);
        // without python3 and its GLib binding there is nobody to ask
        if(!o_glib.b_found || /No module named|not available/.test(o_glib.s_stderr)) return;
        assert.equal(o_glib.n_code, 0, o_glib.s_stderr);
        assert.equal(o_glib.s_stdout.trim(), 'MicroMatic');
        let s_path__started = s_path__program.replace(/\/[^/]*$/, '') + '/started.txt';
        let s_started = '';
        for(let n_it = 0; n_it < 100 && s_started === ''; n_it++){
            s_started = await Deno.readTextFile(s_path__started).catch(() => '');
            if(s_started === '') await new Promise(f_resolve => setTimeout(f_resolve, 50));
        }
        assert.deepEqual(s_started.split('\n'), [s_path__program, 'run', '-A', o_path.s_path__launcher, s_path__root, '']);
    } finally {
        await Deno.remove(s_path__tmp, { recursive: true });
    }
});

Deno.test('a deno whose own path contains a percent sign is refused: the desktop could not find it', () => {
    assert.throws(() => f_s_desktop_entry({ s_path__deno: '/home/100%/.deno/bin/deno', s_path__launcher: '/l', s_path__root: '/r', s_path__icon: '/i' }), /cannot start a program whose path contains %/);
});

Deno.test('the icon of the entry is a drawing that needs nothing from outside', async () => {
    let s_svg = await Deno.readTextFile(s_path__repository + '/launcher/icon_lux.svg');
    assert.match(s_svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="256" height="256" viewBox="0 0 32 32">/);
    // a launcher gives an icon no colour of its own: nothing may depend on currentColor, a stylesheet or another file
    assert.doesNotMatch(s_svg, /currentColor|<style|href=|url\(/);
});

Deno.test('a task of deno.json becomes the arguments for deno, unless it needs a shell', async () => {
    assert.deepEqual(f_a_s_arg__task('deno run -A webserver_denojs.js'), ['run', '-A', 'webserver_denojs.js']);
    assert.deepEqual(f_a_s_arg__task('  deno   run --allow-env=DATASERVER_* x.js  '), ['run', '--allow-env=DATASERVER_*', 'x.js']);
    for(let s_task of ['deno run -A install.js && deno run -A webserver_denojs.js', 'deno run "a b.js"', 'FOO=1 deno run x.js', 'deno run x.js > log', 'deno run $HOME/x.js', 'node x.js', 'deno', undefined]){
        assert.equal(f_a_s_arg__task(s_task), null, String(s_task));
    }
    // the two tasks the launcher starts are plain commands
    let o_task = JSON.parse(await Deno.readTextFile(s_path__repository + '/deno.json')).tasks;
    assert.deepEqual(f_a_s_arg__task(o_task.server), ['run', '-A', 'webserver_denojs.js']);
    let a_s_arg__data = f_a_s_arg__task(o_task.dataserver);
    assert.deepEqual([a_s_arg__data[0], a_s_arg__data.at(-1), a_s_arg__data.includes('--allow-env=DATASERVER_*')], ['run', 'dataserver/dataserver_denojs.js', true]);
    assert.equal(o_task.launch, 'deno run -A launcher/launcher_denojs.js');
});

Deno.test('the port of the application server: --port among its arguments, 8000 without', () => {
    assert.equal(f_n_port__app(['run', '-A', 'webserver_denojs.js']), 8000);
    assert.equal(f_n_port__app(['run', '-A', 'webserver_denojs.js', '--port', '8010', '--db', 'x.db']), 8010);
    assert.equal(f_n_port__app(['run', '-A', 'webserver_denojs.js', '--port']), 8000);
    assert.equal(f_n_port__app(['run', '-A', 'webserver_denojs.js', '--port', 'abc']), 8000);
});

Deno.test('the processes that listen on a port are read from the output of ss', () => {
    assert.deepEqual(f_a_n_pid__listening(''), []);
    assert.deepEqual(f_a_n_pid__listening('LISTEN 0 511 0.0.0.0:8000 0.0.0.0:* users:(("deno",pid=928514,fd=21))\n'), [928514]);
    // one process on two addresses counts once, two processes on one port count both
    assert.deepEqual(f_a_n_pid__listening('LISTEN 0 511 0.0.0.0:8000 0.0.0.0:* users:(("deno",pid=12,fd=21))\nLISTEN 0 511 [::]:8000 [::]:* users:(("deno",pid=12,fd=22),("deno",pid=34,fd=22))\n'), [12, 34]);
    // a process of another user is shown without its id
    assert.deepEqual(f_a_n_pid__listening('LISTEN 0 511 0.0.0.0:8000 0.0.0.0:*\n'), []);
});

// ─── Start, restart, stop ───────────────────────────────────────────

let f_n_port__free = function(){
    let o_listener = Deno.listen({ hostname: '127.0.0.1', port: 0 });
    let n_port = o_listener.addr.port;
    o_listener.close();
    return n_port;
};

let f_b_port__open = async function(n_port){
    try {
        (await Deno.connect({ hostname: '127.0.0.1', port: n_port })).close();
        return true;
    } catch {
        return false;
    }
};

let f_wait = async function(f_b_done, s_what, n_ms = 20000){
    let n_ts_ms__end = Date.now() + n_ms;
    while(Date.now() < n_ts_ms__end){
        if(await f_b_done()) return;
        await new Promise(f_resolve => setTimeout(f_resolve, 50));
    }
    throw new Error('Timed out waiting for: ' + s_what);
};

// a stand-in for a server: listens on --port and says who answers. like the real
// ones, the application server ends by the signal and the data server tidies up
// and ends with exit code 0. --fail ends it by itself after a moment.
let s_server__stand_in = `
    let n_idx = Deno.args.indexOf('--port');
    let n_port = Number(n_idx === -1 ? Deno.env.get('DATASERVER_N_PORT') : Deno.args[n_idx + 1]);
    if(Deno.args.includes('--tidy')) Deno.addSignalListener('SIGTERM', () => Deno.exit(0));
    Deno.serve({ hostname: '127.0.0.1', port: n_port, onListen() {} }, () => new Response(String(Deno.pid)));
    if(Deno.args.includes('--fail')) setTimeout(() => { console.error('stand-in: out of luck'); Deno.exit(3); }, 400);
`;

Deno.test('the launcher starts both servers, starts them again when they run, and stops them', async () => {
    let s_path__root = await Deno.realPath(await Deno.makeTempDir({ prefix: 'omm_launcher_' }));
    let n_port__app = f_n_port__free();
    let n_port__data = f_n_port__free();
    let a_o_process = [];
    let f_o_launcher = function(a_s_arg = []){
        let o_process = new Deno.Command(Deno.execPath(), {
            args: ['run', '-A', s_path__repository + '/launcher/launcher_denojs.js', '--no-browser', '--root', s_path__root, ...a_s_arg],
            env: { DATASERVER_N_PORT: String(n_port__data) }, stdin: 'null', stdout: 'piped', stderr: 'piped',
        }).spawn();
        let o_launcher = { o_process, s_output: '' };
        // what it prints is read as it comes, so a full pipe never holds it up
        for(let o_stream of [o_process.stdout, o_process.stderr]){
            (async () => { for await (let a_n_byte of o_stream) o_launcher.s_output += new TextDecoder().decode(a_n_byte); })();
        }
        a_o_process.push(o_process);
        return o_launcher;
    };
    let f_s_pid = async n_port => await (await fetch('http://127.0.0.1:' + n_port)).text();
    let f_b_running = async () => (await f_b_port__open(n_port__app)) && (await f_b_port__open(n_port__data));
    let f_b_stopped = async () => !(await f_b_port__open(n_port__app)) && !(await f_b_port__open(n_port__data));
    let f_write_task = (s_arg__app = '') => Deno.writeTextFile(s_path__root + '/deno.json', JSON.stringify({ tasks: {
        server: `deno run -A stand_in.js --port ${n_port__app}${s_arg__app}`,
        dataserver: 'deno run -A stand_in.js --tidy',
    } }));
    try {
        await Deno.writeTextFile(s_path__root + '/stand_in.js', s_server__stand_in);
        await f_write_task();

        // ── start ──
        let o_launcher__1 = f_o_launcher();
        await f_wait(f_b_running, 'both servers');
        await f_wait(() => o_launcher__1.s_output.includes('started.'), 'the launcher says so');
        assert.ok(o_launcher__1.s_output.includes(`http://localhost:${n_port__app}`) && o_launcher__1.s_output.includes(`http://127.0.0.1:${n_port__data}`), o_launcher__1.s_output);
        let a_s_pid__1 = [await f_s_pid(n_port__app), await f_s_pid(n_port__data)];

        // ── start again: the running servers are stopped, new ones answer, the first launcher ends by itself ──
        let o_launcher__2 = f_o_launcher();
        await f_wait(() => o_launcher__2.s_output.includes('started again.'), 'the second launcher has taken over');
        let a_s_pid__2 = [await f_s_pid(n_port__app), await f_s_pid(n_port__data)];
        assert.ok(a_s_pid__2[0] !== a_s_pid__1[0] && a_s_pid__2[1] !== a_s_pid__1[1], 'both servers are new processes');
        let o_status__1 = await o_launcher__1.o_process.status;
        // it was taken over: no error, and nothing to read in its window
        assert.deepEqual([o_status__1.code, o_launcher__1.s_output.includes('✗')], [0, false], o_launcher__1.s_output);
        assert.equal(await f_b_running(), true);

        // ── a port held by another program is not touched: nothing is stopped, nothing is started ──
        // (a server of another checkout: it was started in another folder)
        let n_port__other = f_n_port__free();
        let s_path__other = await Deno.realPath(await Deno.makeTempDir({ prefix: 'omm_launcher_other_' }));
        await Deno.writeTextFile(s_path__other + '/stand_in.js', s_server__stand_in);
        let o_other = new Deno.Command(Deno.execPath(), { args: ['run', '-A', 'stand_in.js', '--port', String(n_port__other)], cwd: s_path__other, stdin: 'null', stdout: 'null', stderr: 'null' }).spawn();
        a_o_process.push(o_other);
        try {
            await f_wait(() => f_b_port__open(n_port__other), 'the other program');
            let s_pid__other = await f_s_pid(n_port__other);
            let s_path__root__3 = await Deno.realPath(await Deno.makeTempDir({ prefix: 'omm_launcher_' }));
            await Deno.writeTextFile(s_path__root__3 + '/stand_in.js', s_server__stand_in);
            await Deno.writeTextFile(s_path__root__3 + '/deno.json', JSON.stringify({ tasks: { server: `deno run -A stand_in.js --port ${n_port__other}`, dataserver: 'deno run -A stand_in.js --tidy' } }));
            let o_output = await new Deno.Command(Deno.execPath(), {
                args: ['run', '-A', s_path__repository + '/launcher/launcher_denojs.js', '--no-browser', '--root', s_path__root__3],
                env: { DATASERVER_N_PORT: String(f_n_port__free()) }, stdin: 'null', stdout: 'piped', stderr: 'piped',
            }).output();
            assert.equal(o_output.code, 1);
            assert.match(new TextDecoder().decode(o_output.stderr), new RegExp(`Port ${n_port__other} of the application is used by another program \\(process ${s_pid__other}\\)`));
            assert.equal(await f_s_pid(n_port__other), s_pid__other, 'the other program still runs');
            await Deno.remove(s_path__root__3, { recursive: true });
        } finally {
            o_other.kill('SIGKILL');
            await o_other.status;
            await Deno.remove(s_path__other, { recursive: true });
        }
        assert.deepEqual([await f_s_pid(n_port__app), await f_s_pid(n_port__data)], a_s_pid__2, 'the servers of the second launcher were not touched');

        // ── stop: the window is closed (the launcher is told to end), both servers end ──
        o_launcher__2.o_process.kill('SIGHUP');
        let o_status__2 = await o_launcher__2.o_process.status;
        assert.equal(o_status__2.code, 0, o_launcher__2.s_output);
        await f_wait(f_b_stopped, 'both servers stopped');

        // ── a server that ends by itself: the other one is stopped, and the reason is said ──
        await f_write_task(' --fail');
        let o_launcher__4 = f_o_launcher();
        let o_status__4 = await o_launcher__4.o_process.status;
        assert.equal(o_status__4.code, 1, o_launcher__4.s_output);
        assert.match(o_launcher__4.s_output, /stand-in: out of luck[\s\S]*The application ended \(exit code 3\)/);
        await f_wait(f_b_stopped, 'nothing left running');

        // ── a task that needs a shell is refused with the reason ──
        await Deno.writeTextFile(s_path__root + '/deno.json', JSON.stringify({ tasks: { server: 'deno run -A a.js && deno run -A b.js', dataserver: 'deno run -A stand_in.js --tidy' } }));
        let o_launcher__5 = f_o_launcher();
        assert.equal((await o_launcher__5.o_process.status).code, 1);
        assert.match(o_launcher__5.s_output, /The task "server" of deno\.json is missing or is more than one plain deno command/);
    } finally {
        for(let o_process of a_o_process){
            try { o_process.kill('SIGKILL'); } catch { /* ended already */ }
            await o_process.status;
        }
        // servers a failed run may have left behind
        let o_left = await f_o_output('pkill', ['-KILL', '-f', s_path__root + '/']);
        void o_left;
        await Deno.remove(s_path__root, { recursive: true }).catch(() => {});
    }
});

Deno.test('the icon on the desktop lies in the desktop folder of the user, and nowhere when there is none', () => {
    assert.equal(f_s_path__desktop_icon('/home/jonas/Schreibtisch\n', '/home/jonas'), '/home/jonas/Schreibtisch/micromatic.desktop');
    assert.equal(f_s_path__desktop_icon('/home/jonas/Desktop/', '/home/jonas'), '/home/jonas/Desktop/micromatic.desktop');
    // xdg-user-dir is missing: the usual folder
    assert.equal(f_s_path__desktop_icon('', '/home/jonas'), '/home/jonas/Desktop/micromatic.desktop');
    // no desktop folder is set: xdg-user-dir answers with the home folder, and nothing is put there
    assert.equal(f_s_path__desktop_icon('/home/jonas\n', '/home/jonas'), '');
    assert.equal(f_s_path__desktop_icon('/home/jonas/', '/home/jonas/'), '');
});

Deno.test('Chromium from the Snap store: whether it may reach USB devices is read from `snap connections`', () => {
    let s_head = 'Interface                 Plug                               Slot                             Notes\n';
    let s_other = 'audio-playback            chromium:audio-playback            :audio-playback                  -\n'
        + 'camera                    chromium:camera                    :camera                          -\n';
    assert.equal(f_b_chromium_snap__usb(s_head + s_other + 'raw-usb                   chromium:raw-usb                   -                                -\n'), false);
    assert.equal(f_b_chromium_snap__usb(s_head + s_other + 'raw-usb                   chromium:raw-usb                   :raw-usb                         manual\n'), true);
    assert.equal(f_b_chromium_snap__usb(s_head + s_other), false);
    assert.equal(f_b_chromium_snap__usb(''), false);
});
