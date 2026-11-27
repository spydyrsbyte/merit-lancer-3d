/*
  A Camera looks at a figure from a distance so large that nothing gets smaller
  further away.

  The heading turns the figure, counter-clockwise seen from above, and at zero it
  faces up the screen. The tilt is how far the camera leans: zero looks straight
  down, and 90 looks from the side.

  The view is three columns: what a step to the right, forward and up in the world
  is on the screen, where the third number is toward the viewer.
*/

const RADIANS = Math.PI / 180;
const MARGIN = 1.04;

export class Camera {
  constructor(heading = 0, tilt = 35) {
    this.heading = heading;
    this.tilt = tilt;
    this.center = [0, 0];
    this.extent = [1, 1];
    this.depth = 1;
  }

  get view() {
    const turnX = Math.cos(this.heading * RADIANS);
    const turnY = Math.sin(this.heading * RADIANS);
    const leanX = Math.cos(this.tilt * RADIANS);
    const leanY = Math.sin(this.tilt * RADIANS);

    return [
      turnX, turnY * leanX, -turnY * leanY,
      -turnY, turnX * leanX, -turnX * leanY,
      0, leanY, leanX
    ];
  }

  fit({ low, high }) {
    const lean = this.tilt * RADIANS;
    const radius = Math.hypot(Math.max(-low[0], high[0]), Math.max(-low[1], high[1]));
    const height = high[2] - low[2];

    const rise = height * Math.sin(lean) / 2;
    const half = Math.max(radius, radius * Math.cos(lean) + rise, 1) * MARGIN;

    this.center = [0, (low[2] + high[2]) / 2 * Math.sin(lean)];
    this.extent = [half, half];
    this.depth = radius + Math.abs(low[2]) + Math.abs(high[2]) + 1;
  }
}
