// Every call from the browser to the data server goes through this module.
// It knows the address, sends the token of the session and turns a failed
// call into an error with a message that says what to do.
// The API is described in dataserver/readme_mgc.md.

let s_key__token = 'omm.dataserver.s_token';
let s_key__url = 'omm.dataserver.s_url';
let s_url__default = 'http://127.0.0.1:8001';

// called when the server answers 401: the session is gone, the login has to appear
let f_on_session_lost = function(){};
let f_set_on_session_lost = function(f_handler){
    f_on_session_lost = f_handler;
};

let f_s_storage = function(s_key){
    try { return localStorage.getItem(s_key) || ''; } catch { return ''; }
};

let f_s_url__dataserver = function(){
    return f_s_storage(s_key__url) || s_url__default;
};

let f_s_token = function(){
    return f_s_storage(s_key__token);
};

let f_set_token = function(s_token){
    try {
        if(s_token) localStorage.setItem(s_key__token, s_token);
        else localStorage.removeItem(s_key__token);
    } catch { /* the session then lasts until the page is reloaded */ }
};

// an Error with n_status, s_error and o_body of the response
let f_o_error__dataserver = function(n_status, s_error, s_message, o_body = {}){
    let o_error = new Error(s_message);
    o_error.n_status = n_status;
    o_error.s_error = s_error;
    o_error.o_body = o_body;
    return o_error;
};

let f_s_message__status = function(n_status, s_message__server){
    if(n_status === 401) return 'The session has ended. Log in again.';
    if(n_status === 413) return 'The file is too large for the data server.';
    if(n_status === 507) return 'The disk of the data server is full. Free some space, then try again.';
    return s_message__server || ('The data server answered with status ' + n_status + '.');
};

// o_option: { v_json, o_form, o_blob, b_blob }
//   v_json  body as json          o_form  body as multipart/form-data
//   o_blob  body as raw bytes     b_blob  return { o_blob, o_response } instead of parsed json
let f_v_response__dataserver = async function(s_method, s_path, o_option = {}){
    let o_header = {};
    let s_token = f_s_token();
    if(s_token) o_header['Authorization'] = 'Bearer ' + s_token;
    let v_body = undefined;
    if(o_option.v_json !== undefined){
        o_header['Content-Type'] = 'application/json';
        v_body = JSON.stringify(o_option.v_json);
    }
    if(o_option.o_form) v_body = o_option.o_form;
    if(o_option.o_blob) v_body = o_option.o_blob;

    let o_response;
    try {
        o_response = await fetch(f_s_url__dataserver() + s_path, { method: s_method, headers: o_header, body: v_body });
    } catch {
        throw f_o_error__dataserver(0, 'not_reachable', 'The data server is not reachable. Start it with: deno task dataserver');
    }
    if(!o_response.ok){
        let o_body = {};
        try { o_body = await o_response.json(); } catch { /* no json body */ }
        if(o_response.status === 401){
            f_set_token('');
            f_on_session_lost();
        }
        throw f_o_error__dataserver(o_response.status, o_body.s_error || 'error', f_s_message__status(o_response.status, o_body.s_message), o_body);
    }
    if(o_option.b_blob) return { o_blob: await o_response.blob(), o_response };
    if(o_response.status === 204) return null;
    return await o_response.json();
};

export {
    f_s_url__dataserver,
    f_s_token,
    f_set_token,
    f_set_on_session_lost,
    f_v_response__dataserver,
};
