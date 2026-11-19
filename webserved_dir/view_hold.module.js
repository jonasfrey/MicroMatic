// A tool that works on what the camera shows right now can hold the field of
// view: while it does, X and Y refuse to move and the tool is told, so it can
// ask whether its work may be given up. Z stays free: focusing does not leave
// the field of view.
// While the tool is busy with the field of view (it is taking its images) no
// motor is moved at all, except by the tool itself.
// A field of view that is not held can be left, and the tool is told that too:
// what it shows for the old field of view has to go.
// No DOM and no Vue in here, so it can be tested on its own.

// { f_b_active(): the field of view is held now, f_b_busy(): the tool is at work on it now,
//   f_on_refused(): a move was just refused because the field of view is held,
//   f_on_leave(): X or Y is sent on its way, the field of view is left }
let o_hold = null;
// the tool that holds the field of view is sending a command of its own right now
let b_own = false;

// null: no tool holds the field of view
let f_set_view_hold = function(o_hold__new){
    o_hold = o_hold__new;
};

// f_v_command sends commands of the tool itself: they pass. it has to send
// them before it returns, what it sends later is refused like any other command.
let f_v_command__own = function(f_v_command){
    b_own = true;
    try { return f_v_command(); } finally { b_own = false; }
};

// o_msg: a command for the microcontroller. o_motor__axis: { x, y, z }, the motor of each axis.
// true: the command would move a motor that has to stay where it is, and must not be sent.
let f_b_command__refused = function(o_msg, o_motor__axis){
    if(!o_hold || b_own) return false;
    let b_motor = o_msg.command === 'runContinuous' || o_msg.command === 'moveSteps';
    if(!b_motor && o_msg.command !== 'circleStart') return false;
    // the tool is at work: nothing moves, and there is nothing to ask
    if(o_hold.f_b_busy()) return true;
    // focusing does not leave the field of view
    if(b_motor && o_msg.motor !== o_motor__axis.x && o_msg.motor !== o_motor__axis.y) return false;
    if(o_hold.f_b_active()){
        o_hold.f_on_refused();
        return true;
    }
    o_hold.f_on_leave();
    return false;
};

export { f_set_view_hold, f_v_command__own, f_b_command__refused };
