import * as C from "./constants";
import type { Body, Direction, FathomState, ReadState } from "./game";
export const DIRECTIONS: Direction[] = ["up", "right", "down", "left"];
export const VECTORS: Record<Direction, readonly [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};
export const opposite = (d: Direction): Direction =>
  DIRECTIONS[(DIRECTIONS.indexOf(d) + 2) % 4];
export const center = (tx: number, ty: number) => ({
  x: C.GRID_ORIGIN_X + (tx + 0.5) * C.TILE,
  y: C.GRID_ORIGIN_Y + (ty + 0.5) * C.TILE,
  tx,
  ty,
});
export const layer = (char: string): string[] =>
  Array.from({ length: C.GRID_ROWS }, () => char.repeat(C.GRID_COLS));
export function write(
  rows: string[],
  tx: number,
  ty: number,
  char: string,
): void {
  rows[ty] = rows[ty].slice(0, tx) + char + rows[ty].slice(tx + 1);
}
export function maze(): string[] {
  const rows = layer("#");
  for (let y = 1; y < C.GRID_ROWS - 1; y++)
    for (let x = 1; x < C.GRID_COLS - 1; x++) {
      if (
        [1, 5, 11, 16].includes(y) ||
        [1, 5, 9, 13, 22, 26, 30, 34].includes(x)
      )
        write(rows, x, y, ".");
    }
  for (let x = 0; x < C.GRID_COLS; x++)
    if (x <= 13 || x >= 22) write(rows, x, 8, ".");
  for (let y = 7; y <= 9; y++)
    for (let x = 16; x <= 19; x++) write(rows, x, y, "d");
  write(rows, 17, 6, "g");
  return rows;
}
export const tile = (
  s: Pick<ReadState, "tiles">,
  x: number,
  y: number,
): string => s.tiles[y]?.[x] ?? "#";
export function locate(b: Body): void {
  b.tx = Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE);
  b.ty = Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE);
}
export function neighbor(
  s: Pick<ReadState, "tiles">,
  tx: number,
  ty: number,
  d: Direction,
): { tx: number; ty: number } {
  const [dx, dy] = VECTORS[d];
  let x = tx + dx;
  const wrap = s.tiles.findIndex(
    (row) => row[0] !== "#" && row[C.GRID_COLS - 1] !== "#",
  );
  if (ty === wrap) x = (x + C.GRID_COLS) % C.GRID_COLS;
  return { tx: x, ty: ty + dy };
}
export function open(
  s: Pick<ReadState, "tiles">,
  tx: number,
  ty: number,
  den = false,
): boolean {
  const t = tile(s, tx, ty);
  return t === "." || (den && (t === "g" || t === "d"));
}
export function options(
  s: ReadState,
  b: Pick<Body, "tx" | "ty">,
  den = false,
): Direction[] {
  return DIRECTIONS.filter((d) => {
    const n = neighbor(s, b.tx, b.ty, d);
    return open(s, n.tx, n.ty, den);
  });
}
export const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => Math.hypot(a.x - b.x, a.y - b.y);
export const sameTile = (
  a: { tx: number; ty: number },
  b: { tx: number; ty: number },
): boolean => a.tx === b.tx && a.ty === b.ty;
export function distances(
  s: ReadState,
  tx: number,
  ty: number,
  den = true,
): number[] {
  const result = Array<number>(C.GRID_COLS * C.GRID_ROWS).fill(Infinity);
  if (!open(s, tx, ty, den)) return result;
  const queue = [{ tx, ty }];
  result[ty * C.GRID_COLS + tx] = 0;
  for (let i = 0; i < queue.length; i++) {
    const b = queue[i];
    for (const d of options(s, b, den)) {
      const n = neighbor(s, b.tx, b.ty, d);
      const id = n.ty * C.GRID_COLS + n.tx;
      if (result[id] === Infinity) {
        result[id] = result[b.ty * C.GRID_COLS + b.tx] + 1;
        queue.push(n);
      }
    }
  }
  return result;
}
export function route(
  s: ReadState,
  b: Body,
  target: { tx: number; ty: number },
  den = false,
): Direction | null {
  if (sameTile(b, target)) return null;
  const ds = distances(s, target.tx, target.ty, den);
  let best = Infinity;
  let chosen: Direction | null = null;
  for (const d of options(s, b, den)) {
    const n = neighbor(s, b.tx, b.ty, d);
    const value = ds[n.ty * C.GRID_COLS + n.tx];
    if (value < best) {
      best = value;
      chosen = d;
    }
  }
  return chosen;
}
export function random(s: FathomState): number {
  s.random = (Math.imul(s.random, 1664525) + 1013904223) >>> 0;
  return s.random / 4294967296;
}
export function wander(s: FathomState, b: Body): Direction | null {
  const dirs = options(s, b);
  const forward = dirs.filter((d) => d !== opposite(b.dir));
  const choices = forward.length ? forward : dirs;
  return choices.length
    ? choices[Math.floor(random(s) * choices.length)]
    : null;
}
export function atCenter(b: Body | ReadState["forager"]): boolean {
  const c = center(b.tx, b.ty);
  return Math.abs(b.x - c.x) < 1e-7 && Math.abs(b.y - c.y) < 1e-7;
}
/** Consume distance in center-to-center segments; wrapping preserves the remainder. */
export function move(
  s: FathomState,
  b: Body,
  amount: number,
  choose: () => Direction | null,
  den = false,
): boolean {
  if (!open(s, b.tx, b.ty, den)) return false;
  let moved = false;
  while (amount > 1e-9) {
    if (atCenter(b)) {
      const d = choose();
      if (!d) break;
      const n = neighbor(s, b.tx, b.ty, d);
      if (!open(s, n.tx, n.ty, den)) break;
      b.dir = d;
    }
    const [dx, dy] = VECTORS[b.dir];
    const c = center(b.tx, b.ty);
    let toCenter = dx ? (c.x - b.x) * dx : (c.y - b.y) * dy;
    if (toCenter <= 1e-8) toCenter += C.TILE;
    const step = Math.min(amount, toCenter);
    b.x += dx * step;
    b.y += dy * step;
    const width = C.GRID_COLS * C.TILE;
    if (b.x < C.GRID_ORIGIN_X) b.x += width;
    if (b.x >= C.GRID_ORIGIN_X + width) b.x -= width;
    locate(b);
    amount -= step;
    moved = true;
    if (Math.abs(step - toCenter) < 1e-8) Object.assign(b, center(b.tx, b.ty));
  }
  return moved;
}
/** Grid DDA: each crossed cell is tested, including corner-adjacent rock. */
export function lineOfSight(
  s: ReadState,
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  const ax = (a.x - C.GRID_ORIGIN_X) / C.TILE,
    ay = (a.y - C.GRID_ORIGIN_Y) / C.TILE;
  const bx = (b.x - C.GRID_ORIGIN_X) / C.TILE,
    by = (b.y - C.GRID_ORIGIN_Y) / C.TILE;
  let x = Math.floor(ax),
    y = Math.floor(ay);
  const ex = Math.floor(bx),
    ey = Math.floor(by);
  const dx = bx - ax,
    dy = by - ay,
    sx = Math.sign(dx),
    sy = Math.sign(dy);
  const ix = dx ? Math.abs(1 / dx) : Infinity,
    iy = dy ? Math.abs(1 / dy) : Infinity;
  let mx = dx ? (sx > 0 ? x + 1 - ax : ax - x) * ix : Infinity;
  let my = dy ? (sy > 0 ? y + 1 - ay : ay - y) * iy : Infinity;
  for (let steps = 0; steps < C.GRID_COLS + C.GRID_ROWS + 4; steps++) {
    if (x === ex && y === ey) return true;
    if (tile(s, x, y) === "#") return false;
    if (Math.abs(mx - my) < 1e-10) {
      if (tile(s, x + sx, y) === "#" || tile(s, x, y + sy) === "#")
        return false;
      x += sx;
      y += sy;
      mx += ix;
      my += iy;
    } else if (mx < my) {
      x += sx;
      mx += ix;
    } else {
      y += sy;
      my += iy;
    }
  }
  return false;
}
export function segmentDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length))
    : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
