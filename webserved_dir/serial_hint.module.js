// What to tell someone whose ESP32 does not connect over USB.
// No DOM and no Vue in here, so it can be tested on its own. o_navigator is the
// navigator of the browser, or an object shaped like it.

// the names the browser gives itself, e.g. ['Chromium', 'Google Chrome', 'Not A;Brand']
let f_a_s_brand = function(o_navigator){
    let a_o_brand = o_navigator && o_navigator.userAgentData && o_navigator.userAgentData.brands;
    return Array.isArray(a_o_brand) ? a_o_brand.map(function(o_brand){ return String(o_brand.brand); }) : [];
};

// Chromium itself, not a browser built from it (Chrome, Edge, Brave ...).
// on Ubuntu that is the snap package, which is kept away from USB devices.
let f_b_browser__chromium = function(o_navigator){
    let a_s_brand = f_a_s_brand(o_navigator).filter(function(s_brand){ return !/not.*brand/i.test(s_brand); });
    return a_s_brand.length === 1 && a_s_brand[0] === 'Chromium';
};

let f_b_platform__linux = function(o_navigator){
    let s_platform = (o_navigator && ((o_navigator.userAgentData && o_navigator.userAgentData.platform) || o_navigator.platform)) || '';
    return /linux/i.test(s_platform);
};

// the list of USB serial devices was closed without a choice. nothing failed,
// but that is also all there is to do when the ESP32 was not in the list
// ("No compatible devices found"), so it says what to check then.
let f_s_hint__port_not_chosen = function(o_navigator = globalThis.navigator){
    let s_hint = 'No device chosen. ESP32 not in the list? Check that the USB cable is pushed in fully at both ends and carries data: some cables only charge.';
    if(f_b_browser__chromium(o_navigator) && f_b_platform__linux(o_navigator)){
        s_hint += ' Chromium from the Snap store (Ubuntu) sees no USB devices: use Google Chrome, or run "sudo snap connect chromium:raw-usb" in a terminal and start Chromium again.';
    }
    return s_hint;
};

// the message of a connection that failed, with what to do about it where that is known
let f_s_error__serial_connect = function(o_error, o_navigator = globalThis.navigator){
    let s_message = (o_error && o_error.message) ? String(o_error.message) : 'The USB connection failed.';
    // what the browser says when it may not open the port, or when something else holds it
    if(/failed to open serial port/i.test(s_message)){
        s_message += ' Another program or browser tab may hold the port: close it there.';
        if(f_b_platform__linux(o_navigator)){
            s_message += ' On Linux the user also has to be in the group "dialout": run "sudo usermod -aG dialout $USER" in a terminal, then log out and in again.';
        }
    }
    return s_message;
};

export { f_b_browser__chromium, f_s_hint__port_not_chosen, f_s_error__serial_connect };
