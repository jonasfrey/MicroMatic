// Geometry of bounding boxes. A box is stored the way the data server and
// YOLO expect it: centre and size, normalised 0..1 by image width / height.
//   { n_trn_x_center_nor, n_trn_y_center_nor, n_scl_x_nor, n_scl_y_nor }
// No DOM and no Vue in here, so the functions can be tested on their own.

let f_n_clamp = function(n, n_min, n_max){
    return Math.min(Math.max(n, n_min), n_max);
};

// the box between two opposite corners, limited to the image
let f_o_bbox__from_corner = function(n_x__a, n_y__a, n_x__b, n_y__b){
    let n_x__min = f_n_clamp(Math.min(n_x__a, n_x__b), 0, 1);
    let n_x__max = f_n_clamp(Math.max(n_x__a, n_x__b), 0, 1);
    let n_y__min = f_n_clamp(Math.min(n_y__a, n_y__b), 0, 1);
    let n_y__max = f_n_clamp(Math.max(n_y__a, n_y__b), 0, 1);
    return {
        n_trn_x_center_nor: (n_x__min + n_x__max) / 2,
        n_trn_y_center_nor: (n_y__min + n_y__max) / 2,
        n_scl_x_nor: n_x__max - n_x__min,
        n_scl_y_nor: n_y__max - n_y__min,
    };
};

// the edges of a box
let f_o_edge = function(o_bbox){
    return {
        n_x__min: o_bbox.n_trn_x_center_nor - o_bbox.n_scl_x_nor / 2,
        n_x__max: o_bbox.n_trn_x_center_nor + o_bbox.n_scl_x_nor / 2,
        n_y__min: o_bbox.n_trn_y_center_nor - o_bbox.n_scl_y_nor / 2,
        n_y__max: o_bbox.n_trn_y_center_nor + o_bbox.n_scl_y_nor / 2,
    };
};

// the box moved by (n_trn_x, n_trn_y); it keeps its size and stops at the image border
let f_o_bbox__moved = function(o_bbox, n_trn_x, n_trn_y){
    return {
        n_trn_x_center_nor: f_n_clamp(o_bbox.n_trn_x_center_nor + n_trn_x, o_bbox.n_scl_x_nor / 2, 1 - o_bbox.n_scl_x_nor / 2),
        n_trn_y_center_nor: f_n_clamp(o_bbox.n_trn_y_center_nor + n_trn_y, o_bbox.n_scl_y_nor / 2, 1 - o_bbox.n_scl_y_nor / 2),
        n_scl_x_nor: o_bbox.n_scl_x_nor,
        n_scl_y_nor: o_bbox.n_scl_y_nor,
    };
};

// the box with one corner dragged to (n_x, n_y); the opposite corner stays.
// s_corner: 'nw' | 'ne' | 'sw' | 'se' (n = top, w = left)
let f_o_bbox__resized = function(o_bbox, s_corner, n_x, n_y){
    let o_edge = f_o_edge(o_bbox);
    let n_x__fixed = s_corner.includes('w') ? o_edge.n_x__max : o_edge.n_x__min;
    let n_y__fixed = s_corner.includes('n') ? o_edge.n_y__max : o_edge.n_y__min;
    return f_o_bbox__from_corner(n_x__fixed, n_y__fixed, n_x, n_y);
};

// what of the box lies under the point: a corner, 'inside' or ''.
// n_tolerance_x / n_tolerance_y: how far from a corner still counts as the corner
let f_s_hit = function(o_bbox, n_x, n_y, n_tolerance_x, n_tolerance_y){
    let o_edge = f_o_edge(o_bbox);
    for(let [s_corner, n_x__corner, n_y__corner] of [
        ['nw', o_edge.n_x__min, o_edge.n_y__min],
        ['ne', o_edge.n_x__max, o_edge.n_y__min],
        ['sw', o_edge.n_x__min, o_edge.n_y__max],
        ['se', o_edge.n_x__max, o_edge.n_y__max],
    ]){
        if(Math.abs(n_x - n_x__corner) <= n_tolerance_x && Math.abs(n_y - n_y__corner) <= n_tolerance_y) return s_corner;
    }
    if(n_x >= o_edge.n_x__min && n_x <= o_edge.n_x__max && n_y >= o_edge.n_y__min && n_y <= o_edge.n_y__max) return 'inside';
    return '';
};

// a box smaller than n_px__min image pixels on a side is a slip of the hand, not an object
let f_b_bbox__large_enough = function(o_bbox, n_scl_x, n_scl_y, n_px__min = 5){
    return o_bbox.n_scl_x_nor * n_scl_x >= n_px__min && o_bbox.n_scl_y_nor * n_scl_y >= n_px__min;
};

export {
    f_n_clamp,
    f_o_bbox__from_corner,
    f_o_edge,
    f_o_bbox__moved,
    f_o_bbox__resized,
    f_s_hit,
    f_b_bbox__large_enough,
};
