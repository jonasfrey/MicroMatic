// Geometry of bounding boxes (webserved_dir/ml_bbox.module.js).
import assert from 'node:assert/strict';
import {
    f_o_bbox__from_corner,
    f_o_edge,
    f_o_bbox__moved,
    f_o_bbox__resized,
    f_s_hit,
    f_b_bbox__large_enough,
} from '../webserved_dir/ml_bbox.module.js';

let f_near = (n_a, n_b) => assert.ok(Math.abs(n_a - n_b) < 1e-9, n_a + ' is not ' + n_b);
let f_o_bbox = (n_trn_x_center_nor, n_trn_y_center_nor, n_scl_x_nor, n_scl_y_nor) => ({ n_trn_x_center_nor, n_trn_y_center_nor, n_scl_x_nor, n_scl_y_nor });

Deno.test('bbox: two corners make a centre box, in any order, limited to the image', () => {
    for(let a_n of [[0.2, 0.3, 0.6, 0.5], [0.6, 0.5, 0.2, 0.3], [0.2, 0.5, 0.6, 0.3]]){
        let o_bbox = f_o_bbox__from_corner(...a_n);
        f_near(o_bbox.n_trn_x_center_nor, 0.4);
        f_near(o_bbox.n_trn_y_center_nor, 0.4);
        f_near(o_bbox.n_scl_x_nor, 0.4);
        f_near(o_bbox.n_scl_y_nor, 0.2);
    }
    // a drag that leaves the image ends at its border
    let o_edge = f_o_edge(f_o_bbox__from_corner(0.8, 0.9, 1.4, -0.3));
    f_near(o_edge.n_x__min, 0.8);
    f_near(o_edge.n_x__max, 1);
    f_near(o_edge.n_y__min, 0);
    f_near(o_edge.n_y__max, 0.9);
});

Deno.test('bbox: moving keeps the size and stops at the border', () => {
    let o_bbox = f_o_bbox(0.5, 0.5, 0.2, 0.4);
    let o_moved = f_o_bbox__moved(o_bbox, 0.1, -0.2);
    f_near(o_moved.n_trn_x_center_nor, 0.6);
    f_near(o_moved.n_trn_y_center_nor, 0.3);
    let o_stopped = f_o_bbox__moved(o_bbox, 5, -5);
    f_near(o_stopped.n_trn_x_center_nor, 0.9);
    f_near(o_stopped.n_trn_y_center_nor, 0.2);
    assert.deepEqual([o_stopped.n_scl_x_nor, o_stopped.n_scl_y_nor], [0.2, 0.4]);
    // the box that was passed in is not changed
    assert.deepEqual(o_bbox, f_o_bbox(0.5, 0.5, 0.2, 0.4));
});

Deno.test('bbox: resizing moves one corner, the opposite corner stays', () => {
    let o_bbox = f_o_bbox(0.5, 0.5, 0.2, 0.2);
    for(let [s_corner, n_x, n_y, a_n__edge] of [
        ['se', 0.8, 0.9, [0.4, 0.8, 0.4, 0.9]],
        ['nw', 0.1, 0.2, [0.1, 0.6, 0.2, 0.6]],
        ['ne', 0.9, 0.1, [0.4, 0.9, 0.1, 0.6]],
        ['sw', 0.3, 0.7, [0.3, 0.6, 0.4, 0.7]],
        // dragged across the opposite corner the box flips instead of collapsing
        ['se', 0.1, 0.1, [0.1, 0.4, 0.1, 0.4]],
    ]){
        let o_edge = f_o_edge(f_o_bbox__resized(o_bbox, s_corner, n_x, n_y));
        [o_edge.n_x__min, o_edge.n_x__max, o_edge.n_y__min, o_edge.n_y__max].forEach((n, n_idx) => f_near(n, a_n__edge[n_idx]));
    }
});

Deno.test('bbox: a press finds the corner, the inside or nothing', () => {
    let o_bbox = f_o_bbox(0.5, 0.5, 0.2, 0.2);
    assert.equal(f_s_hit(o_bbox, 0.5, 0.5, 0.01, 0.01), 'inside');
    assert.equal(f_s_hit(o_bbox, 0.405, 0.395, 0.01, 0.01), 'nw');
    assert.equal(f_s_hit(o_bbox, 0.6, 0.4, 0.01, 0.01), 'ne');
    assert.equal(f_s_hit(o_bbox, 0.392, 0.608, 0.01, 0.01), 'sw');
    assert.equal(f_s_hit(o_bbox, 0.609, 0.6, 0.01, 0.01), 'se');
    assert.equal(f_s_hit(o_bbox, 0.62, 0.6, 0.01, 0.01), '');
    assert.equal(f_s_hit(o_bbox, 0.2, 0.2, 0.01, 0.01), '');
});

Deno.test('bbox: smaller than 5 image pixels on a side is no box', () => {
    assert.equal(f_b_bbox__large_enough(f_o_bbox(0.5, 0.5, 5 / 1920, 5 / 1080), 1920, 1080), true);
    assert.equal(f_b_bbox__large_enough(f_o_bbox(0.5, 0.5, 4.9 / 1920, 0.5), 1920, 1080), false);
    assert.equal(f_b_bbox__large_enough(f_o_bbox(0.5, 0.5, 0.5, 4.9 / 1080), 1920, 1080), false);
    assert.equal(f_b_bbox__large_enough(f_o_bbox(0.5, 0.5, 0, 0), 1920, 1080), false);
});
