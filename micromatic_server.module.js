// Where MicroMatic Server lies: the data server of the ML Training window, a
// separate program in a checkout of its own (see readme_mgc.md there). The
// launcher starts it, install.js runs its installer, the tests of the ML
// Training window start it.
// By default it lies next to this checkout, in ../MicroMatic_Server. The
// environment variable MICROMATIC_S_PATH__SERVER names another folder.

let S_NAME__ENV__PATH__SERVER = 'MICROMATIC_S_PATH__SERVER';
let S_NAME__FOLDER__SERVER = 'MicroMatic_Server';

// { s_path, b_found }: the folder the server checkout is looked for in, and
// whether there is one (it has the deno.json and the config.module.js of the
// server). s_path__root: the MicroMatic checkout. s_path__given: a folder named
// on the command line, '' for none; it comes before the environment variable.
let f_o_checkout__server = function(s_path__root, s_path__given = ''){
    let s_path = s_path__given || Deno.env.get(S_NAME__ENV__PATH__SERVER) || '';
    if(s_path === ''){
        // next to the checkout, in the folder it lies in as the system names it
        s_path = s_path__root + '/../' + S_NAME__FOLDER__SERVER;
        try { s_path = Deno.realPathSync(s_path__root + '/..') + '/' + S_NAME__FOLDER__SERVER; } catch { /* the checkout itself is missing */ }
    }
    try {
        s_path = Deno.realPathSync(s_path);
        let b_found = ['deno.json', 'config.module.js'].every(function(s_name_file){ return Deno.statSync(s_path + '/' + s_name_file).isFile; });
        return { s_path, b_found };
    } catch {
        return { s_path, b_found: false };
    }
};

// the address a module of the server checkout is imported with: every part of
// the path is encoded, so a folder with a space or a % in its name works
let f_s_url__file = function(s_path){
    return 'file://' + s_path.split('/').map(encodeURIComponent).join('/');
};

export {
    S_NAME__ENV__PATH__SERVER,
    S_NAME__FOLDER__SERVER,
    f_o_checkout__server,
    f_s_url__file,
};
