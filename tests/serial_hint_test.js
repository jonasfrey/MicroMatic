// What is said when the ESP32 does not connect: after the list of USB devices
// was closed without a choice, and after a port could not be opened.
import assert from 'node:assert/strict';
import { f_b_browser__chromium, f_s_hint__port_not_chosen, f_s_error__serial_connect } from '../webserved_dir/serial_hint.module.js';

let f_o_navigator = function(a_s_brand, s_platform){
    return { userAgentData: { brands: a_s_brand.map(s_brand => ({ brand: s_brand, version: '155' })), platform: s_platform } };
};
let o_navigator__chrome = f_o_navigator(['Chromium', 'Google Chrome', 'Not A;Brand'], 'Linux');
let o_navigator__chromium = f_o_navigator(['Not)A;Brand', 'Chromium'], 'Linux');

Deno.test('Chromium itself is told apart from the browsers built from it', () => {
    assert.equal(f_b_browser__chromium(o_navigator__chromium), true);
    assert.equal(f_b_browser__chromium(o_navigator__chrome), false);
    assert.equal(f_b_browser__chromium(f_o_navigator(['Microsoft Edge', 'Chromium', 'Not_A Brand'], 'Linux')), false);
    assert.equal(f_b_browser__chromium(f_o_navigator(['Brave', 'Chromium'], 'Linux')), false);
    // a browser that does not say what it is
    for(let o_navigator of [undefined, null, {}, { userAgentData: {} }, { userAgentData: { brands: [] } }]){
        assert.equal(f_b_browser__chromium(o_navigator), false);
    }
});

Deno.test('the list of USB devices was closed without a choice: what to check when the ESP32 was not in it', () => {
    let s_hint = f_s_hint__port_not_chosen(o_navigator__chrome);
    assert.match(s_hint, /^No device chosen\./);
    assert.match(s_hint, /USB cable/);
    assert.doesNotMatch(s_hint, /snap/i);
    // Chromium on Linux: the package of the Snap store is kept away from USB devices
    let s_hint__chromium = f_s_hint__port_not_chosen(o_navigator__chromium);
    assert.ok(s_hint__chromium.startsWith(s_hint));
    assert.match(s_hint__chromium, /sudo snap connect chromium:raw-usb/);
    assert.match(s_hint__chromium, /Google Chrome/);
    // Chromium elsewhere has no such limit
    assert.equal(f_s_hint__port_not_chosen(f_o_navigator(['Chromium', 'Not A;Brand'], 'Windows')), s_hint);
    assert.equal(f_s_hint__port_not_chosen({}), s_hint);
});

Deno.test('a port that cannot be opened: the message of the browser, and what usually is behind it', () => {
    let o_error = new Error('Failed to open serial port.');
    let s_error = f_s_error__serial_connect(o_error, o_navigator__chrome);
    assert.ok(s_error.startsWith('Failed to open serial port.'));
    assert.match(s_error, /Another program or browser tab/);
    assert.match(s_error, /sudo usermod -aG dialout \$USER/);
    // the group is a matter of Linux only
    let s_error__windows = f_s_error__serial_connect(o_error, f_o_navigator(['Chromium', 'Google Chrome'], 'Windows'));
    assert.match(s_error__windows, /Another program or browser tab/);
    assert.doesNotMatch(s_error__windows, /dialout/);
    // an older browser tells its platform in another place
    assert.match(f_s_error__serial_connect(o_error, { platform: 'Linux x86_64' }), /dialout/);
    // any other message stays as it is
    assert.equal(f_s_error__serial_connect(new Error('USB disconnected during connection.'), o_navigator__chrome), 'USB disconnected during connection.');
    assert.equal(f_s_error__serial_connect(null, o_navigator__chrome), 'The USB connection failed.');
});
