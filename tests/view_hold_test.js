// A held field of view: which commands for the microcontroller are refused.
import assert from 'node:assert/strict';
import { f_set_view_hold, f_v_command__own, f_b_command__refused } from '../webserved_dir/view_hold.module.js';

let o_motor__axis = { x: 0, y: 1, z: 2 };

Deno.test('without a hold every command passes', () => {
    f_set_view_hold(null);
    assert.equal(f_b_command__refused({ motor: 0, command: 'runContinuous' }, o_motor__axis), false);
    let n_cnt__refused = 0;
    let n_cnt__leave = 0;
    f_set_view_hold({ f_b_active: () => false, f_b_busy: () => false, f_on_refused: () => { n_cnt__refused++; }, f_on_leave: () => { n_cnt__leave++; } });
    try {
        // X and Y: the tool is told that the field of view is left
        for(let o_msg of [
            { motor: 0, command: 'moveSteps', n_step: 100 },
            { motor: 1, command: 'runContinuous', n_rpm: 5, direction: 'cw' },
            { command: 'circleStart', n_motor__x: 0, n_motor__y: 1 },
        ]){
            assert.equal(f_b_command__refused(o_msg, o_motor__axis), false, JSON.stringify(o_msg));
        }
        assert.deepEqual([n_cnt__refused, n_cnt__leave], [0, 3]);
        // focusing, stopping and asking leave the field of view where it is
        for(let o_msg of [
            { motor: 2, command: 'runContinuous', n_rpm: 5, direction: 'cw' },
            { motor: 2, command: 'moveSteps', n_step: 10 },
            { motor: 0, command: 'stop' },
            { command: 'stopAll' },
            { command: 'status' },
        ]){
            assert.equal(f_b_command__refused(o_msg, o_motor__axis), false, JSON.stringify(o_msg));
        }
        assert.deepEqual([n_cnt__refused, n_cnt__leave], [0, 3]);
        // the axes are assigned to other motors: what counts is the axis
        assert.equal(f_b_command__refused({ motor: 2, command: 'moveSteps' }, { x: 2, y: 0, z: 1 }), false);
        assert.equal(f_b_command__refused({ motor: 1, command: 'moveSteps' }, { x: 2, y: 0, z: 1 }), false);
        assert.deepEqual([n_cnt__refused, n_cnt__leave], [0, 4]);
    } finally { f_set_view_hold(null); }
});

Deno.test('a held field of view refuses what moves X or Y, and says so', () => {
    let n_cnt__refused = 0;
    let n_cnt__leave = 0;
    f_set_view_hold({ f_b_active: () => true, f_b_busy: () => false, f_on_refused: () => { n_cnt__refused++; }, f_on_leave: () => { n_cnt__leave++; } });
    try {
        for(let o_msg of [
            { motor: 0, command: 'runContinuous', n_rpm: 5, direction: 'cw' },
            { motor: 1, command: 'runContinuous', n_rpm: 5, direction: 'ccw' },
            { motor: 0, command: 'moveSteps', n_step: 100 },
            { motor: 1, command: 'moveSteps', n_step: -100 },
            { command: 'circleStart', n_motor__x: 0, n_motor__y: 1 },
        ]){
            assert.equal(f_b_command__refused(o_msg, o_motor__axis), true, JSON.stringify(o_msg));
        }
        assert.equal(n_cnt__refused, 5);
        // focusing does not leave the field of view, and stopping is never refused
        for(let o_msg of [
            { motor: 2, command: 'runContinuous', n_rpm: 5, direction: 'cw' },
            { motor: 2, command: 'moveSteps', n_step: 10 },
            { motor: 0, command: 'stop' },
            { command: 'stopAll' },
            { command: 'circleStop' },
            { command: 'status' },
            { motor: 0, command: 'setBacklash', n_step__backlash: 4 },
            { command: 'setLed' },
        ]){
            assert.equal(f_b_command__refused(o_msg, o_motor__axis), false, JSON.stringify(o_msg));
        }
        assert.equal(n_cnt__refused, 5);
        // the axes are assigned to other motors: the hold follows the axes
        assert.equal(f_b_command__refused({ motor: 2, command: 'moveSteps' }, { x: 2, y: 0, z: 1 }), true);
        assert.equal(f_b_command__refused({ motor: 1, command: 'moveSteps' }, { x: 2, y: 0, z: 1 }), false);
        // a held field of view is never left
        assert.equal(n_cnt__leave, 0);
    } finally { f_set_view_hold(null); }
});

Deno.test('a tool at work refuses every motor, asks nothing, and lets its own commands through', () => {
    let n_cnt__refused = 0;
    let n_cnt__leave = 0;
    let b_busy = true;
    // at work on a field of view that is not held, and on one that is
    for(let b_active of [false, true]){
        f_set_view_hold({ f_b_active: () => b_active, f_b_busy: () => b_busy, f_on_refused: () => { n_cnt__refused++; }, f_on_leave: () => { n_cnt__leave++; } });
        try {
            for(let o_msg of [
                { motor: 0, command: 'runContinuous', n_rpm: 5, direction: 'cw' },
                { motor: 1, command: 'moveSteps', n_step: -100 },
                { motor: 2, command: 'runContinuous', n_rpm: 5, direction: 'cw' },
                { motor: 2, command: 'moveSteps', n_step: 10 },
                { command: 'circleStart', n_motor__x: 0, n_motor__y: 1 },
            ]){
                assert.equal(f_b_command__refused(o_msg, o_motor__axis), true, JSON.stringify(o_msg));
            }
            // nobody is asked whether the field of view may be left: it cannot be left now
            assert.deepEqual([n_cnt__refused, n_cnt__leave], [0, 0]);
            for(let o_msg of [{ motor: 2, command: 'stop' }, { command: 'stopAll' }, { command: 'status' }]){
                assert.equal(f_b_command__refused(o_msg, o_motor__axis), false, JSON.stringify(o_msg));
            }
            // what the tool sends itself passes, and its result comes back
            assert.equal(f_v_command__own(() => f_b_command__refused({ motor: 2, command: 'moveSteps', n_step: 10 }, o_motor__axis)), false);
            assert.equal(f_v_command__own(() => 'sent'), 'sent');
            // only while it sends: afterwards, and after a command that threw, the motors refuse again
            assert.equal(f_b_command__refused({ motor: 2, command: 'moveSteps', n_step: 10 }, o_motor__axis), true);
            assert.throws(() => f_v_command__own(() => { throw new Error('not sent'); }), /not sent/);
            assert.equal(f_b_command__refused({ motor: 2, command: 'moveSteps', n_step: 10 }, o_motor__axis), true);
        } finally { f_set_view_hold(null); }
    }
    // the work is done: only the held field of view counts again
    b_busy = false;
    f_set_view_hold({ f_b_active: () => true, f_b_busy: () => b_busy, f_on_refused: () => { n_cnt__refused++; }, f_on_leave: () => { n_cnt__leave++; } });
    try {
        assert.equal(f_b_command__refused({ motor: 2, command: 'moveSteps', n_step: 10 }, o_motor__axis), false);
        assert.equal(f_b_command__refused({ motor: 0, command: 'moveSteps', n_step: 10 }, o_motor__axis), true);
        assert.equal(n_cnt__refused, 1);
    } finally { f_set_view_hold(null); }
});
