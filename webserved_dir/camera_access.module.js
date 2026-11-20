// What the stage says when no camera image can be shown, from the error the
// browser reports. No DOM and no Vue in here, so it can be tested on its own.

// o_error: what getUserMedia was rejected with.
// returns { s_title, s_detail }: s_title names the state, s_detail says what to do.
let f_o_error__camera = function(o_error){
    let s_name = o_error && o_error.name;
    if(s_name === 'NotAllowedError' || s_name === 'SecurityError'){
        return { s_title: 'Camera blocked', s_detail: 'Allow the camera for this page in the address bar of the browser, then reload the page.' };
    }
    if(s_name === 'NotFoundError' || s_name === 'OverconstrainedError'){
        return { s_title: 'No camera found', s_detail: 'Plug in the USB camera. It is listed as soon as the computer sees it.' };
    }
    if(s_name === 'NotReadableError' || s_name === 'AbortError'){
        return { s_title: 'Camera in use', s_detail: 'Another program or browser tab holds the camera. Close it there, then select the camera again.' };
    }
    let s_message = o_error && o_error.message ? String(o_error.message) : '';
    return { s_title: 'Camera not started', s_detail: s_message || 'Select the camera again.' };
};

// the camera that was showing its image is gone: its cable was pulled
let f_o_error__camera_lost = function(){
    return { s_title: 'Camera disconnected', s_detail: 'Plug the USB camera in again. It starts as soon as the computer sees it.' };
};

export { f_o_error__camera, f_o_error__camera_lost };
