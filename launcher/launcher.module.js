// The launcher: an entry "MicroMatic" in the application menu of the desktop
// that starts the application server and the data server in a terminal window,
// or starts them again when they are running already.
// This file holds the parts that need no process and no file, so they can be
// tested on their own. launcher_denojs.js starts and stops the servers,
// install.js writes the desktop entry.

let S_NAME__DESKTOP_ENTRY = 'micromatic.desktop';

// tried in this order. the application talks to the microcontroller over Web
// Serial, which only these browsers have; without one of them the browser the
// desktop opens links with is used.
let A_S_NAME__BROWSER = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'xdg-open'];

// where the desktop looks for the entries of one user
let f_s_path__desktop_entry = function(s_path__data_home, s_path__home){
    return (s_path__data_home || (s_path__home + '/.local/share')) + '/applications/' + S_NAME__DESKTOP_ENTRY;
};

// the same entry as an icon on the desktop. s_path_folder__desktop: what `xdg-user-dir DESKTOP`
// answers, '' when the command is missing. '' when the user has no desktop folder:
// xdg-user-dir answers with the home folder itself then, and nothing is put there.
let f_s_path__desktop_icon = function(s_path_folder__desktop, s_path__home){
    let s_path_folder = (s_path_folder__desktop || '').trim().replace(/\/+$/, '');
    if(s_path_folder === '') s_path_folder = s_path__home.replace(/\/+$/, '') + '/Desktop';
    if(s_path_folder === s_path__home.replace(/\/+$/, '')) return '';
    return s_path_folder + '/' + S_NAME__DESKTOP_ENTRY;
};

// true when `snap connections chromium` says that Chromium may reach USB devices.
// Chromium from the Snap store is kept away from them until the plug raw-usb is connected,
// and the application reaches the microcontroller through the browser (Web Serial).
let f_b_chromium_snap__usb = function(s_output){
    return /^raw-usb\s+chromium:raw-usb\s+:raw-usb\b/m.test(s_output);
};

// a value of a desktop entry: a backslash is written twice
let f_s_value__desktop = function(s_value){
    return s_value.replaceAll('\\', '\\\\');
};

// one argument of the Exec line of a desktop entry, after the Desktop Entry
// Specification: an argument with a reserved character stands in double quotes,
// inside them " ` $ and \ get a backslash, and % is written twice because it
// begins a field code. the line is a value like any other, so every backslash
// is then written twice.
let f_s_arg__exec = function(s_arg){
    let s_arg__exec = s_arg.replaceAll('%', '%%');
    if(!/^[A-Za-z0-9_\-.,:\/@+=%]+$/.test(s_arg__exec)){
        s_arg__exec = '"' + s_arg__exec.replace(/(["`$\\])/g, '\\$1') + '"';
    }
    return f_s_value__desktop(s_arg__exec);
};

// the desktop entry: found under "MicroMatic" in the application menu, runs the
// launcher in a terminal window. all paths are absolute: a desktop does not
// start a program in the folder of the checkout, nor with ~/.deno/bin in PATH.
let f_s_desktop_entry = function({ s_path__deno, s_path__launcher, s_path__root, s_path__icon }){
    for(let s_path of [s_path__deno, s_path__launcher, s_path__root, s_path__icon]){
        if(/[\n\r]/.test(s_path)) throw new Error('A path with a line break cannot be written into a desktop entry: ' + JSON.stringify(s_path));
    }
    // the desktop (GLib) looks for the program under the name as it is written, with the %
    // written twice, and takes the entry for broken when it does not find it
    if(s_path__deno.includes('%')) throw new Error('The desktop cannot start a program whose path contains %: ' + s_path__deno);
    return [
        '[Desktop Entry]',
        'Type=Application',
        'Name=MicroMatic',
        'Comment=Start the microscope application and its data server, or start them again',
        'Exec=' + [s_path__deno, 'run', '-A', s_path__launcher].map(f_s_arg__exec).join(' '),
        'Path=' + f_s_value__desktop(s_path__root),
        'Icon=' + f_s_value__desktop(s_path__icon),
        'Terminal=true',
        'Categories=Science;',
        'Keywords=microscope;Mikroskop;Lux;',
        'StartupNotify=false',
    ].join('\n') + '\n';
};

// a task of deno.json as the arguments for deno, when the task is one plain
// "deno ..." command. null for a task that needs a shell: && | > quotes variables.
let f_a_s_arg__task = function(s_task){
    if(typeof s_task !== 'string' || /[|&;<>()$`"'\\~#]/.test(s_task)) return null;
    let a_s_word = s_task.trim().split(/\s+/);
    if(a_s_word[0] !== 'deno' || a_s_word.length < 2) return null;
    return a_s_word.slice(1);
};

// the port the application server listens on: "--port N" among its arguments,
// 8000 without it (the default of webserver_denojs.js)
let f_n_port__app = function(a_s_arg){
    let n_idx = a_s_arg.indexOf('--port');
    let n_port = n_idx === -1 ? NaN : Number(a_s_arg[n_idx + 1]);
    return Number.isInteger(n_port) && n_port > 0 ? n_port : 8000;
};

// the ids of the processes in the output of `ss -H -ltnp`, each once
let f_a_n_pid__listening = function(s_output){
    let a_n_pid = [];
    for(let a_s_match of s_output.matchAll(/\bpid=(\d+)/g)){
        let n_pid = Number(a_s_match[1]);
        if(!a_n_pid.includes(n_pid)) a_n_pid.push(n_pid);
    }
    return a_n_pid;
};

export {
    S_NAME__DESKTOP_ENTRY,
    A_S_NAME__BROWSER,
    f_s_path__desktop_entry,
    f_s_path__desktop_icon,
    f_b_chromium_snap__usb,
    f_s_value__desktop,
    f_s_arg__exec,
    f_s_desktop_entry,
    f_a_s_arg__task,
    f_n_port__app,
    f_a_n_pid__listening,
};
