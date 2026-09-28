export interface Point {
  x: number;
  y: number;
}

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** How far outside the triangle's edges a pointer may stray and still count as heading for the
 * submenu, in pixels. Small, so a straight move down to the next item still closes it. */
export const AIM_TOLERANCE_PX = 2;

/** Whether `point` is inside the triangle `apex`-`top`-`bottom`, allowing `tolerance` pixels
 * outside its edges. A degenerate triangle (collinear or coincident corners) contains nothing. */
export function isInsideSafeTriangle(
  point: Point,
  apex: Point,
  top: Point,
  bottom: Point,
  tolerance = 0,
): boolean {
  const area = (top.x - apex.x) * (bottom.y - apex.y) - (top.y - apex.y) * (bottom.x - apex.x);
  if (Math.abs(area) < 1e-6) return false;
  const orientation = Math.sign(area);
  const corners = [apex, top, bottom];
  return corners.every((a, i) => {
    const b = corners[(i + 1) % 3];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const side = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    return (orientation * side) / length >= -tolerance;
  });
}

/** The top and bottom corners of the submenu's edge nearest to `apex`: its left edge when the
 * pointer is left of the submenu's centre, its right edge when the submenu flipped to the left. */
export function nearEdgeCorners(apex: Point, box: Box): { top: Point; bottom: Point } {
  const x = apex.x <= (box.left + box.right) / 2 ? box.left : box.right;
  return { top: { x, y: box.top }, bottom: { x, y: box.bottom } };
}

/** Whether a pointer at `point`, having come from `apex`, is heading for the submenu at `box`. */
export function isHeadingForSubmenu(point: Point, apex: Point, box: Box): boolean {
  const { top, bottom } = nearEdgeCorners(apex, box);
  return isInsideSafeTriangle(point, apex, top, bottom, AIM_TOLERANCE_PX);
}
