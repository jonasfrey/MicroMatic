// What the stage says when no camera image can be shown.
import assert from 'node:assert/strict';
import { f_o_error__camera, f_o_error__camera_lost } from '../webserved_dir/camera_access.module.js';

let f_o_error = function(s_name, s_message = ''){
    let o_error = new Error(s_message);
    o_error.name = s_name;
    return o_error;
};

Deno.test('the reason why no camera shows is named, with what to do', () => {
    assert.equal(f_o_error__camera(f_o_error('NotAllowedError', 'Permission denied')).s_title, 'Camera blocked');
    assert.match(f_o_error__camera(f_o_error('NotAllowedError')).s_detail, /Allow the camera/);
    assert.equal(f_o_error__camera(f_o_error('NotFoundError', 'Requested device not found')).s_title, 'No camera found');
    // the saved camera is not plugged in
    assert.equal(f_o_error__camera(f_o_error('OverconstrainedError')).s_title, 'No camera found');
    assert.equal(f_o_error__camera(f_o_error('NotReadableError', 'Could not start video source')).s_title, 'Camera in use');
    assert.match(f_o_error__camera(f_o_error('NotReadableError')).s_detail, /Another program or browser tab/);
});

Deno.test('an unknown reason keeps the message of the browser', () => {
    assert.deepEqual(f_o_error__camera(f_o_error('TypeError', 'something else')), { s_title: 'Camera not started', s_detail: 'something else' });
    for(let o_error of [undefined, null, {}, f_o_error('TypeError')]){
        assert.deepEqual(f_o_error__camera(o_error), { s_title: 'Camera not started', s_detail: 'Select the camera again.' });
    }
});

Deno.test('a camera whose cable was pulled is said to be disconnected', () => {
    assert.equal(f_o_error__camera_lost().s_title, 'Camera disconnected');
    assert.match(f_o_error__camera_lost().s_detail, /Plug the USB camera in again/);
});
