#!/usr/bin/env -S deno run -A
// run: deno task install     (or: deno task doctor  -> report only, install nothing)
//
// installs everything the software needs to run:
//   arduino-cli + esp32 core + arduino libraries  ->  detecting / flashing the ESP32
//   ./venv with numpy + opencv                    ->  stitch.py
//   torch (cpu) + lightglue + kornia              ->  autostitch.py feature matching,
//                                                     stitch.py --matcher loftr
//   v4l2-ctl (linux only)                         ->  camera sensor sizes + gain in the Camera window
//   desktop entry (linux only)                    ->  "MicroMatic" in the application menu and as an icon on
//                                                     the desktop starts or restarts the application and the
//                                                     data server
//   ./venv_yolo of MicroMatic_Server              ->  ML Training window: training and prediction of the
//                                                     data server (install_ml.js there), when its checkout
//                                                     is found (micromatic_server.module.js)
//
// every step is idempotent: already satisfied steps are skipped, so this is safe
// to run on every `deno task start`.

import {
    s_root_dir,
    s_ds,
} from "./runtimedata.module.js";
import { f_generate_ino } from './flash_functions.module.js';
import { f_s_path__desktop_entry, f_s_path__desktop_icon, f_s_desktop_entry, f_b_chromium_snap__usb, A_S_NAME__BROWSER } from './launcher/launcher.module.js';
import { f_o_checkout__server } from './micromatic_server.module.js';

// ─── Paths ──────────────────────────────────────────────────────────

let s_path__venv = `${s_root_dir}${s_ds}venv`;
// the webserver invokes venv/bin/python3 directly, so match that layout exactly
let s_path__python__venv = `${s_path__venv}${s_ds}bin${s_ds}python3`;
let s_path__requirement = `${s_root_dir}${s_ds}requirements.txt`;
// the scan panel stitches its tiles with this script
let s_path__stitch = `${s_root_dir}${s_ds}stitch.py`;
let s_dir__bin = `${Deno.env.get('HOME')}${s_ds}.local${s_ds}bin`;
let s_path__arduino_cli = `${s_dir__bin}${s_ds}arduino-cli`;

let s_url__lightglue = 'git+https://github.com/cvg/LightGlue.git';
let s_url__torch_cpu = 'https://download.pytorch.org/whl/cpu';

// arduino-cli requires the sketch file to be named exactly like its directory
let s_dir__verify = '/tmp/microscope-verify/stepper_serial';
let s_fqbn = 'esp32:esp32:esp32s3';

// ─── CLI args ───────────────────────────────────────────────────────

let a_s_arg = Deno.args;
let b_check_only = a_s_arg.includes('--check');
let b_skip_arduino = a_s_arg.includes('--skip-arduino');
let b_skip_python = a_s_arg.includes('--skip-python');
let b_skip_stitch_ai = a_s_arg.includes('--skip-stitch-ai');
let b_verify_compile = a_s_arg.includes('--verify-compile');
let b_skip_desktop = a_s_arg.includes('--skip-desktop');
let b_skip_ml = a_s_arg.includes('--skip-ml');

// ─── Helpers ────────────────────────────────────────────────────────

let f_o_run = async function(s_cmd, a_s_arg__cmd = []) {
    try {
        let o_command = new Deno.Command(s_cmd, {
            args: a_s_arg__cmd,
            stdout: 'piped',
            stderr: 'piped',
            stdin: 'null',
        });
        let o_result = await o_command.output();
        return {
            b_success: o_result.success,
            s_stdout: new TextDecoder().decode(o_result.stdout),
            s_stderr: new TextDecoder().decode(o_result.stderr),
        };
    } catch (o_error) {
        return { b_success: false, s_stdout: '', s_stderr: o_error.message };
    }
};

let f_b_run_live = async function(s_cmd, a_s_arg__cmd = []) {
    try {
        let o_command = new Deno.Command(s_cmd, {
            args: a_s_arg__cmd,
            stdout: 'inherit',
            stderr: 'inherit',
            stdin: 'null',
        });
        let o_result = await o_command.output();
        return o_result.success;
    } catch {
        return false;
    }
};

let f_b_binary_exists = async function(s_name) {
    let o_result = await f_o_run('which', [s_name]);
    return o_result.b_success;
};

let f_b_path_exists = async function(s_path) {
    try {
        await Deno.stat(s_path);
        return true;
    } catch {
        return false;
    }
};

// resolve arduino-cli from PATH first, then from the local bin dir
let f_s_arduino_cli = async function() {
    if (await f_b_binary_exists('arduino-cli')) {
        let o_result = await f_o_run('which', ['arduino-cli']);
        return o_result.s_stdout.trim();
    }
    if (await f_b_path_exists(s_path__arduino_cli)) {
        return s_path__arduino_cli;
    }
    return '';
};

// ─── Logging ────────────────────────────────────────────────────────

let f_log_step = function(s_msg) {
    console.log(`\n  ▸ ${s_msg}`);
};
let f_log_ok = function(s_msg) {
    console.log(`  ✓ ${s_msg}`);
};
let f_log_todo = function(s_msg) {
    console.log(`  ○ ${s_msg}`);
};
let f_log_error = function(s_msg) {
    console.error(`  ✗ ${s_msg}`);
};
let f_log = function(s_msg) {
    console.log(`    ${s_msg}`);
};

let a_s_problem = [];
// set when this run actually installed something arduino related, which is
// when a compile verification is worth the minutes it costs
let b_installed__arduino = false;

// ─── Step: python venv ──────────────────────────────────────────────

let f_setup_python = async function() {
    f_log_step('python (image stitching)');

    if (!await f_b_binary_exists('python3')) {
        f_log_error('python3 not found — install it (e.g. sudo apt install python3 python3-venv)');
        a_s_problem.push('python3 missing');
        return;
    }

    let b_venv = await f_b_path_exists(s_path__python__venv);
    if (!b_venv) {
        if (b_check_only) {
            f_log_todo('venv missing');
            a_s_problem.push('venv missing');
            return;
        }
        f_log('creating venv...');
        if (!await f_b_run_live('python3', ['-m', 'venv', s_path__venv])) {
            f_log_error('could not create venv — try: sudo apt install python3-venv');
            a_s_problem.push('venv creation failed');
            return;
        }
    }
    f_log_ok(`venv at ${s_path__venv}`);

    // base packages
    let o_import__base = await f_o_run(s_path__python__venv, ['-c', 'import cv2, numpy']);
    if (o_import__base.b_success) {
        f_log_ok('numpy + opencv installed');
    } else if (b_check_only) {
        f_log_todo('numpy + opencv missing');
        a_s_problem.push('numpy/opencv missing');
    } else {
        f_log('installing numpy + opencv...');
        await f_b_run_live(s_path__python__venv, ['-m', 'pip', 'install', '--upgrade', 'pip']);
        if (!await f_b_run_live(s_path__python__venv, ['-m', 'pip', 'install', '-r', s_path__requirement])) {
            f_log_error('pip install failed for numpy/opencv');
            a_s_problem.push('numpy/opencv install failed');
        } else {
            f_log_ok('numpy + opencv installed');
        }
    }

    // stitch.py is what the scan panel runs on its tiles -> make sure it starts
    if (!await f_b_path_exists(s_path__stitch)) {
        f_log_error(`stitch.py not found at ${s_path__stitch} — the scan cannot stitch`);
        a_s_problem.push('stitch.py missing');
    } else {
        let o_stitch = await f_o_run(s_path__python__venv, [s_path__stitch, '--help']);
        if (o_stitch.b_success) {
            f_log_ok('stitch.py runs in the venv');
        } else {
            f_log_error('stitch.py cannot run in the venv:');
            f_log((o_stitch.s_stderr || o_stitch.s_stdout).trim().split('\n').slice(-3).join('\n'));
            a_s_problem.push('stitch.py not runnable');
        }
    }

    // feature matching packages (autostitch.py, and stitch.py --matcher loftr)
    if (b_skip_stitch_ai) {
        f_log_todo('torch + lightglue + kornia skipped (--skip-stitch-ai)');
        return;
    }
    let o_import__ai = await f_o_run(s_path__python__venv, ['-c', 'import torch, lightglue, kornia']);
    if (o_import__ai.b_success) {
        f_log_ok('torch + lightglue + kornia installed');
    } else if (b_check_only) {
        f_log_todo('torch + lightglue + kornia missing (autostitch and the LoFTR rescue matcher will not run)');
        a_s_problem.push('torch/lightglue/kornia missing');
    } else {
        f_log('installing torch (cpu build) + lightglue — this downloads a few hundred MB...');
        let b_torch = await f_b_run_live(s_path__python__venv, [
            '-m', 'pip', 'install', 'torch', 'torchvision',
            '--index-url', s_url__torch_cpu,
        ]);
        if (!b_torch) {
            f_log_error('torch install failed — autostitch will not work, the rest still does');
            a_s_problem.push('torch install failed');
            return;
        }
        if (!await f_b_binary_exists('git')) {
            f_log_error('git not found — needed to install lightglue (sudo apt install git)');
            a_s_problem.push('git missing for lightglue');
            return;
        }
        if (!await f_b_run_live(s_path__python__venv, ['-m', 'pip', 'install', s_url__lightglue])) {
            f_log_error('lightglue install failed — autostitch will not work, the rest still does');
            a_s_problem.push('lightglue install failed');
            return;
        }
        // kornia carries the LoFTR weights stitch.py falls back to
        if (!await f_b_run_live(s_path__python__venv, ['-m', 'pip', 'install', 'kornia'])) {
            f_log_error('kornia install failed — stitch.py --matcher loftr will not work, the rest still does');
            a_s_problem.push('kornia install failed');
            return;
        }
        f_log_ok('torch + lightglue + kornia installed');
    }
};

// ─── Step: arduino-cli ──────────────────────────────────────────────

let f_install_arduino_cli = async function() {
    f_log('downloading arduino-cli...');
    await Deno.mkdir(s_dir__bin, { recursive: true });

    let o_curl = await f_o_run('curl', [
        '-fsSL',
        'https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh',
    ]);
    if (!o_curl.b_success) {
        f_log_error('could not download the arduino-cli installer (no network?)');
        a_s_problem.push('arduino-cli download failed');
        return false;
    }

    let o_command = new Deno.Command('sh', {
        stdin: 'piped',
        stdout: 'inherit',
        stderr: 'inherit',
        env: { ...Deno.env.toObject(), BINDIR: s_dir__bin },
    });
    let o_process = o_command.spawn();
    let o_writer = o_process.stdin.getWriter();
    await o_writer.write(new TextEncoder().encode(o_curl.s_stdout));
    await o_writer.close();
    let o_result = await o_process.output();

    if (!o_result.success || !await f_b_path_exists(s_path__arduino_cli)) {
        f_log_error('arduino-cli installation failed');
        a_s_problem.push('arduino-cli install failed');
        return false;
    }
    return true;
};

let f_setup_arduino = async function() {
    f_log_step('arduino-cli (ESP32 detection + flashing)');

    let s_bin = await f_s_arduino_cli();
    if (!s_bin) {
        if (b_check_only) {
            f_log_todo('arduino-cli missing — the setup page cannot detect the ESP32 without it');
            a_s_problem.push('arduino-cli missing');
            return;
        }
        if (!await f_install_arduino_cli()) return;
        s_bin = s_path__arduino_cli;
    }
    let o_version = await f_o_run(s_bin, ['version']);
    f_log_ok(`arduino-cli: ${o_version.s_stdout.trim() || s_bin}`);

    // esp32 board package
    let o_core = await f_o_run(s_bin, ['core', 'list']);
    if (o_core.s_stdout.includes('esp32:esp32')) {
        f_log_ok('esp32 board package installed');
    } else if (b_check_only) {
        f_log_todo('esp32 board package missing');
        a_s_problem.push('esp32 core missing');
    } else {
        f_log('installing esp32 board package (large download, takes a few minutes)...');
        await f_b_run_live(s_bin, ['core', 'update-index']);
        if (!await f_b_run_live(s_bin, ['core', 'install', 'esp32:esp32'])) {
            f_log_error('esp32 board package install failed');
            a_s_problem.push('esp32 core install failed');
        } else {
            b_installed__arduino = true;
            f_log_ok('esp32 board package installed');
        }
    }

    // arduino libraries required by stepper_serial.ino
    let a_s_name_lib = ['ArduinoJson'];
    let o_lib = await f_o_run(s_bin, ['lib', 'list']);
    let a_s_line__lib = o_lib.s_stdout.split('\n');
    let a_s_name_lib__missing = a_s_name_lib.filter(function(s_name) {
        // the name is the first column, so anchor on the line start
        return !a_s_line__lib.some(function(s_line) { return s_line.startsWith(s_name); });
    });

    if (a_s_name_lib__missing.length === 0) {
        f_log_ok('arduino libraries installed');
    } else if (b_check_only) {
        f_log_todo(`arduino libraries missing: ${a_s_name_lib__missing.join(', ')}`);
        a_s_problem.push('arduino libraries missing');
    } else {
        for (let s_name_lib of a_s_name_lib__missing) {
            f_log(`installing ${s_name_lib}...`);
            await f_b_run_live(s_bin, ['lib', 'install', s_name_lib]);
        }
        b_installed__arduino = true;
        f_log_ok('arduino libraries installed');
    }

    if (!b_check_only && (b_installed__arduino || b_verify_compile)) {
        await f_b_verify_compile(s_bin);
    }
};

// ─── Step: verify the firmware really compiles ──────────────────────

// installing the libraries is not proof that they are complete — a missing
// header only shows up at compile time. so compile the firmware once against
// the default configuration to prove the toolchain is whole.
let f_b_verify_compile = async function(s_bin) {
    f_log_step('verifying the firmware compiles');

    try {
        await f_generate_ino(undefined, s_dir__verify);
    } catch (o_error) {
        f_log_error(`could not generate verification firmware: ${o_error.message}`);
        a_s_problem.push('firmware generation failed');
        return false;
    }

    f_log('compiling (first run takes a few minutes)...');
    let o_compile = await f_o_run(s_bin, ['compile', '--fqbn', s_fqbn, s_dir__verify]);
    if (!o_compile.b_success) {
        f_log_error('firmware does not compile — a dependency is still missing:');
        let a_s_line = (o_compile.s_stderr + '\n' + o_compile.s_stdout)
            .split('\n')
            .filter(function(s_line) { return s_line.trim() !== ''; });
        let a_s_line__error = a_s_line.filter(function(s_line) {
            return s_line.includes('error') || s_line.includes('No such file');
        });
        // never report a failure with no detail: fall back to the tail of the output
        let a_s_line__report = a_s_line__error.length > 0
            ? a_s_line__error.slice(0, 8)
            : a_s_line.slice(-8);
        for (let s_line of a_s_line__report) {
            f_log(s_line.trim());
        }
        a_s_problem.push('firmware compile failed');
        return false;
    }
    f_log_ok('firmware compiles — all arduino dependencies present');
    return true;
};

// ─── Step: v4l2-ctl (linux only) ────────────────────────────────────

// camera_functions.module.js reads the sensor sizes and sets the controls the browser
// camera api has no access to with it. other systems keep the browser-only Camera window.
let f_setup_v4l2 = async function() {
    if (Deno.build.os !== 'linux') return;
    f_log_step('v4l2-ctl (camera sensor sizes + gain)');
    if (await f_b_binary_exists('v4l2-ctl')) {
        f_log_ok('v4l2-ctl found');
        return;
    }
    if (b_check_only) {
        f_log_todo('v4l2-ctl missing — the Camera window has no ISO and only a generic resolution list');
        a_s_problem.push('v4l2-ctl missing');
        return;
    }
    // a system package, named v4l-utils by every one of these package managers
    let a_a_s_arg__install = [
        ['apt-get', 'install', '-y'],
        ['dnf', 'install', '-y'],
        ['pacman', '-S', '--noconfirm'],
        ['zypper', '--non-interactive', 'install'],
    ];
    for (let a_s_arg__install of a_a_s_arg__install) {
        if (!await f_b_binary_exists(a_s_arg__install[0])) continue;
        f_log(`installing: sudo ${a_s_arg__install.join(' ')} v4l-utils   (sudo may ask for your password)`);
        await f_b_run_live('sudo', [...a_s_arg__install, 'v4l-utils']);
        break;
    }
    if (await f_b_binary_exists('v4l2-ctl')) {
        f_log_ok('v4l2-ctl installed');
        return;
    }
    f_log_error('could not install v4l2-ctl — install the package "v4l-utils" by hand');
    a_s_problem.push('v4l2-ctl missing');
};

// ─── Step: serial port access ───────────────────────────────────────

let f_check_serial = async function() {
    f_log_step('serial port access');

    let a_s_path__port = [];
    for (let s_dir_entry of ['/dev']) {
        try {
            for await (let o_entry of Deno.readDir(s_dir_entry)) {
                if (o_entry.name.startsWith('ttyUSB') || o_entry.name.startsWith('ttyACM')) {
                    a_s_path__port.push(`${s_dir_entry}/${o_entry.name}`);
                }
            }
        } catch { /* not linux, or /dev unreadable */ }
    }

    if (a_s_path__port.length === 0) {
        f_log_todo('no ttyUSB*/ttyACM* device found — plug in the ESP32 over USB');
        return;
    }
    f_log_ok(`serial device(s): ${a_s_path__port.join(', ')}`);

    let o_group = await f_o_run('id', ['-nG']);
    if (o_group.b_success && !o_group.s_stdout.split(/\s+/).includes('dialout')) {
        f_log_todo('you are not in the "dialout" group, so flashing needs a sudo password each time');
        f_log('permanent fix:  sudo usermod -aG dialout $USER   (then log out and back in)');
    } else if (o_group.b_success) {
        f_log_ok('user is in the "dialout" group');
    }
};

// ─── Step: browser (linux) ──────────────────────────────────────────
// the application reaches the ESP32 from the browser (Web Serial). Chromium from the Snap
// store (Ubuntu) is kept away from USB devices: its list of devices stays empty.

let f_b_program = async function(s_name) {
    return (await f_o_run('which', [s_name])).b_success;
};

let f_check_browser = async function() {
    if (Deno.build.os !== 'linux') return;
    f_log_step('browser for the USB connection');
    // the launcher takes the first of these that is installed
    let s_name__browser = '';
    for (let s_name of A_S_NAME__BROWSER) {
        if (s_name !== 'xdg-open' && await f_b_program(s_name)) { s_name__browser = s_name; break; }
    }
    if (s_name__browser === '') {
        f_log_todo('no Chrome, Chromium or Edge found — the USB connection to the ESP32 needs one of them');
        return;
    }
    // on Ubuntu "chromium" is a link into /snap/bin, and "chromium-browser" a script that starts the snap
    let s_path__browser = (await f_o_run('which', [s_name__browser])).s_stdout.trim();
    let b_snap = s_path__browser.startsWith('/snap/');
    if (!b_snap && s_name__browser.startsWith('chromium')) {
        try { b_snap = (await Deno.lstat('/snap/bin/chromium')) !== null; } catch { /* no Chromium from the Snap store */ }
    }
    if (!b_snap) {
        f_log_ok(`${s_name__browser} can reach USB devices`);
        return;
    }
    let o_connection = await f_o_run('snap', ['connections', 'chromium']);
    if (o_connection.b_success && f_b_chromium_snap__usb(o_connection.s_stdout)) {
        f_log_ok(`${s_name__browser} (snap) may reach USB devices`);
        return;
    }
    f_log_todo(`${s_name__browser} comes from the Snap store and sees no USB devices: the ESP32 will be missing in its list`);
    f_log('fix:  sudo snap connect chromium:raw-usb   (then start Chromium again), or install Google Chrome');
};

// ─── Step: desktop entry (linux) ────────────────────────────────────
// "MicroMatic" in the application menu and as an icon on the desktop:
// launcher/launcher_denojs.js in a terminal window. written again whenever
// the checkout or deno has moved.

// s_place: where the entry shows, for the messages. b_icon: a file on the desktop,
// which the desktop only starts when it can be executed and is marked as trusted.
let f_write_desktop_entry = async function(s_path__entry, s_entry, s_place, b_icon) {
    let s_entry__now = '';
    let b_executable = false;
    try {
        s_entry__now = await Deno.readTextFile(s_path__entry);
        b_executable = ((await Deno.stat(s_path__entry)).mode & 0o111) !== 0;
    } catch { /* not there yet */ }
    if (s_entry__now === s_entry && (b_executable || !b_icon)) {
        f_log_ok(`"MicroMatic" is ${s_place}`);
        return;
    }
    if (b_check_only) {
        f_log_todo(s_entry__now === '' ? `"MicroMatic" is not ${s_place} yet` : `the entry "MicroMatic" ${s_place} points to another place`);
        a_s_problem.push('desktop entry');
        return;
    }
    try {
        await Deno.mkdir(s_path__entry.replace(/\/[^/]*$/, ''), { recursive: true });
        await Deno.writeTextFile(s_path__entry, s_entry);
        if (b_icon) {
            await Deno.chmod(s_path__entry, 0o755);
            // GNOME (Ubuntu) shows "Allow Launching" until the file is marked. other desktops ignore the mark.
            await f_o_run('gio', ['set', s_path__entry, 'metadata::trusted', 'true']);
        }
        f_log_ok(`"MicroMatic" is ${s_place} now (${s_path__entry})`);
    } catch (o_error) {
        f_log_error(`could not write ${s_path__entry}: ${o_error.message}`);
        a_s_problem.push('desktop entry');
    }
};

let f_setup_desktop = async function() {
    f_log_step('Desktop entry');
    if (Deno.build.os !== 'linux') {
        f_log('only on linux, skipped');
        return;
    }
    let s_path__home = Deno.env.get('HOME');
    let s_entry = f_s_desktop_entry({
        s_path__deno: Deno.execPath(),
        s_path__launcher: `${s_root_dir}${s_ds}launcher${s_ds}launcher_denojs.js`,
        s_path__root: s_root_dir,
        s_path__icon: `${s_root_dir}${s_ds}launcher${s_ds}icon_lux.svg`,
    });
    await f_write_desktop_entry(f_s_path__desktop_entry(Deno.env.get('XDG_DATA_HOME'), s_path__home), s_entry, 'in the application menu', false);

    // the icon on the desktop, where the user has a desktop folder
    let o_folder = await f_o_run('xdg-user-dir', ['DESKTOP']);
    let s_path__icon = f_s_path__desktop_icon(o_folder.b_success ? o_folder.s_stdout : '', s_path__home);
    let b_folder = false;
    try {
        b_folder = s_path__icon !== '' && (await Deno.stat(s_path__icon.replace(/\/[^/]*$/, ''))).isDirectory;
    } catch { /* no desktop folder */ }
    if (!b_folder) {
        f_log('no desktop folder, so no icon on the desktop');
        return;
    }
    await f_write_desktop_entry(s_path__icon, s_entry, 'on the desktop', true);
};

// ─── Step: detection libraries of the ML Training window ───────────
// the installer of MicroMatic_Server, which the launcher also runs alone before
// it starts the servers. it prints its own lines; the last step here, because
// its first run downloads a few GB. without the server checkout it is skipped:
// everything but the ML Training window works without it.

let f_setup_ml = async function() {
    let o_checkout__server = f_o_checkout__server(s_root_dir);
    if (!o_checkout__server.b_found) {
        f_log_step('Detection libraries (ML Training: training and prediction of the data server)');
        f_log_todo(`skipped: no MicroMatic_Server in ${o_checkout__server.s_path}. the ML Training window needs it next to this checkout`);
        return;
    }
    let a_s_arg__ml = ['run', '-A', `${o_checkout__server.s_path}${s_ds}install_ml.js`];
    if (b_check_only) a_s_arg__ml.push('--check');
    if (!await f_b_run_live(Deno.execPath(), a_s_arg__ml)) {
        a_s_problem.push('detection libraries of the ML Training window');
    }
};

// ─── Run ────────────────────────────────────────────────────────────

console.log(`
  ╔══════════════════════════════════════╗
  ║   Microscope Motorization            ║
  ║   ${b_check_only ? 'Dependency check                  ' : 'Dependency install                '} ║
  ╚══════════════════════════════════════╝`);

if (!b_skip_python) await f_setup_python();
if (!b_skip_arduino) await f_setup_arduino();
await f_setup_v4l2();
await f_check_serial();
await f_check_browser();
if (!b_skip_desktop) await f_setup_desktop();
if (!b_skip_ml) await f_setup_ml();

if (a_s_problem.length === 0) {
    console.log('\n  ✓ everything is ready\n');
} else if (b_check_only) {
    console.log(`\n  ○ ${a_s_problem.length} thing(s) not installed yet — run: deno task install\n`);
} else {
    console.log(`\n  ✗ finished with problem(s):\n${a_s_problem.map(function(s) { return `      - ${s}`; }).join('\n')}\n`);
    // do not block the server from starting: partial installs still run most features
}
