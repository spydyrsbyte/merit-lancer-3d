/*
  The ground: a grid of 10 units, the square of 100 which is usual for a mech, and an
  arrow to the front.
*/

const REACH = 100;
const STEP = 10;
const HALF = 50;
const ARROW = 30;
const HEAD = 6;
const GRID = "#2c353f";
const MIDDLE = "#3d4854";
const SQUARE = "#566473";
const FRONT = "#f0a63a";

export function drawGround(context, view) {
  context.lineWidth = view.ratio;

  for (let at = -REACH; at <= REACH; at += STEP) {
    const color = at ? GRID : MIDDLE;

    path(context, view, color, [[at, -REACH], [at, REACH]]);
    path(context, view, color, [[-REACH, at], [REACH, at]]);
  }

  path(context, view, SQUARE, [[-HALF, -HALF], [HALF, -HALF], [HALF, HALF], [-HALF, HALF], [-HALF, -HALF]]);

  const tip = HALF + ARROW;

  path(context, view, FRONT, [[0, HALF], [0, tip]]);
  path(context, view, FRONT, [[-HEAD, tip - STEP], [0, tip], [HEAD, tip - STEP]]);
}

function path(context, view, color, points) {
  context.strokeStyle = color;
  context.beginPath();

  points.forEach(([x, y], index) => {
    const spot = view.project([x, y, 0]);

    if (index) context.lineTo(...spot);
    else context.moveTo(...spot);
  });

  context.stroke();
}
