import * as C from "./constants";
import { BACKGROUND } from "./game";
import type { ReadState, Direction } from "./game";
import {
  center,
  distance,
  distances,
  tile,
  lineOfSight,
  options,
  neighbor,
  VECTORS,
} from "./world";
import { menuItems, menuRect } from "./menus";
const FONT = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
const CYAN = "#8df8ef",
  DIM = "#65888e",
  AMBER = "#ff9959";
type Context = CanvasRenderingContext2D;
function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = CYAN,
  align: CanvasTextAlign = "left",
): void {
  ctx.font = `${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
}
function line(
  ctx: Context,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color = "#183b42",
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function circle(ctx: Context, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}
function glow(
  ctx: Context,
  x: number,
  y: number,
  r: number,
  color: string,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function sprite(
  ctx: Context,
  s: ReadState,
  sheet: string,
  frame: number,
  x: number,
  y: number,
  size = C.TILE,
): void {
  const image = s.art[sheet]?.[frame];
  if (image) ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
}
function facing(dir: Direction): number {
  return { down: 0, up: 2, left: 4, right: 6 }[dir];
}
function amber(ctx: Context, x: number, y: number): void {
  glow(ctx, x, y, 22, "#ff70284d");
  ctx.fillStyle = AMBER;
  circle(ctx, x, y, 3);
  ctx.fill();
  ctx.fillStyle = "#ffe1a4";
  circle(ctx, x, y, 1.3);
  ctx.fill();
}
function terrain(ctx: Context, s: ReadState, full = false): void {
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++) {
      const v = full ? "r" : s.visibility[y][x];
      if (v === "u") continue;
      const t = tile(s, x, y);
      let frame = t === "g" ? 18 : 16;
      if (t === "#")
        frame =
          (tile(s, x, y - 1) === "#" ? 1 : 0) +
          (tile(s, x + 1, y) === "#" ? 2 : 0) +
          (tile(s, x, y + 1) === "#" ? 4 : 0) +
          (tile(s, x - 1, y) === "#" ? 8 : 0);
      const c = center(x, y);
      ctx.globalAlpha = v === "l" ? 1 : 0.28;
      sprite(ctx, s, "trench-walls", frame, c.x, c.y);
      if (s.plankton[y][x] === "*") {
        ctx.fillStyle = "#8bddbd";
        circle(ctx, c.x, c.y, C.PLANKTON_DOT / 2);
        ctx.fill();
        if (v === "l") glow(ctx, c.x, c.y, 8, "#60ffcd35");
      }
    }
  ctx.globalAlpha = 1;
}
function mazeView(ctx: Context, s: ReadState): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    C.GRID_ORIGIN_X,
    C.GRID_ORIGIN_Y,
    C.GRID_COLS * C.TILE,
    C.GRID_ROWS * C.TILE,
  );
  ctx.clip();
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(
    C.GRID_ORIGIN_X,
    C.GRID_ORIGIN_Y,
    C.GRID_COLS * C.TILE,
    C.GRID_ROWS * C.TILE,
  );
  // The supplied fog frame is flat: one stretched blit is identical to a
  // tile-by-tile fill and avoids hundreds of hidden draws each frame.
  const fog = s.art["trench-walls"]?.[17];
  if (fog)
    ctx.drawImage(
      fog,
      C.GRID_ORIGIN_X,
      C.GRID_ORIGIN_Y,
      C.GRID_COLS * C.TILE,
      C.GRID_ROWS * C.TILE,
    );
  const f = s.forager;
  ctx.save();
  circle(ctx, f.x, f.y, s.windowRadius);
  ctx.clip();
  terrain(ctx, s);
  glow(ctx, f.x, f.y, s.windowRadius, "#27bea314");
  for (const d of s.drifters) {
    if (d.lit)
      sprite(
        ctx,
        s,
        "drifter",
        d.mind && d.travel ? Math.floor(s.playTime * 8) % 8 : 0,
        d.x,
        d.y,
      );
    amber(ctx, d.x, d.y);
  }
  for (const p of s.predators)
    if (p.kind === "lanternjaw" && p.state !== "den") amber(ctx, p.x, p.y);
  ctx.restore();
  for (const p of s.predators)
    if (p.flaring && p.state !== "den") {
      ctx.save();
      circle(ctx, p.x, p.y, C.FLARE_RADIUS);
      ctx.clip();
      terrain(ctx, s);
      ctx.restore();
      for (const d of s.drifters)
        if (distance(p, d) <= C.FLARE_RADIUS && d.lit)
          sprite(
            ctx,
            s,
            "drifter",
            d.mind && d.travel ? Math.floor(s.playTime * 8) % 8 : 0,
            d.x,
            d.y,
          );
    }
  for (const cloud of s.inkClouds) {
    glow(ctx, cloud.x, cloud.y, cloud.radius, "#000108fa");
    ctx.strokeStyle = "#111426";
    circle(ctx, cloud.x, cloud.y, cloud.radius * 0.8);
    ctx.stroke();
  }
  for (const pulse of s.pulses) {
    const ds = distances(s, pulse.ox, pulse.oy);
    const color =
      pulse.tint === "cyan"
        ? "#65fff2"
        : pulse.tint === "violet"
          ? "#c093ff"
          : "#ff9e51";
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const d = ds[y * C.GRID_COLS + x],
          behind = pulse.front - d;
        if (behind < -0.3 || behind > 1.25 || d > pulse.range) continue;
        const c = center(x, y);
        ctx.globalAlpha = Math.max(0, 1 - Math.abs(behind) / 1.4);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        glow(ctx, c.x, c.y, 21, `${color}35`);
        // Each crest travels along a flood edge, including around bends and
        // across the wrap seam. No line is ever drawn through a rock tile.
        for (const dir of options(s, { tx: x, ty: y }, true)) {
          const n = neighbor(s, x, y, dir);
          if (ds[n.ty * C.GRID_COLS + n.tx] !== d + 1) continue;
          const [dx, dy] = VECTORS[dir];
          const travel = Math.max(0, Math.min(1, behind));
          let px = c.x + dx * C.TILE * travel;
          const py = c.y + dy * C.TILE * travel;
          const width = C.GRID_COLS * C.TILE;
          if (px < C.GRID_ORIGIN_X) px += width;
          if (px >= C.GRID_ORIGIN_X + width) px -= width;
          line(
            ctx,
            px - dy * 11,
            py + dx * 11,
            px + dy * 11,
            py - dx * 11,
            color,
          );
        }
      }
    ctx.globalAlpha = 1;
  }
  for (const p of s.predators) {
    if (p.state === "den") continue;
    if (p.flareCharging || p.flaring || p.fadeLeft > 0) {
      const frame = p.flareCharging
        ? Math.min(2, Math.floor((1 - p.flareTime / C.FLARE_CHARGE) * 3))
        : p.flaring
          ? 3 + Math.min(2, Math.floor((1 - p.flareTime / C.FLARE_BLOOM) * 3))
          : p.fadeLeft > 0.175
            ? 6
            : 7;
      sprite(ctx, s, "flare-bloom", frame, p.x, p.y, C.FLARE_RADIUS * 2);
    }
    if (p.lit) {
      const frame =
        p.kind === "lanternjaw" && p.state === "wander"
          ? 8 + (p.mind && p.travel ? Math.floor(s.playTime * 8) % 8 : 0)
          : facing(p.dir) +
            (p.mind && p.travel ? Math.floor(s.playTime * 7) % 2 : 0);
      const passive =
        distance(center(p.tx, p.ty), s.forager) <= s.visionRadius &&
        lineOfSight(s, s.forager, center(p.tx, p.ty));
      const bloom = s.predators.some(
        (other) => other.flaring && distance(other, p) <= C.FLARE_RADIUS,
      );
      if (p.markLeft > 0 && !passive && !bloom && !p.alert && !p.flareCharging)
        ctx.globalAlpha = Math.min(1, p.markLeft / C.SONAR_MARK_TIME);
      sprite(ctx, s, p.kind, frame, p.x, p.y);
      ctx.globalAlpha = 1;
    }
    if (p.alert) {
      const progress = 1 - p.alertLeft / C.ALERT_TIME;
      ctx.strokeStyle = p.kind === "gloamfin" ? "#c6a0ff" : "#ffcb90";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1 - progress;
      const r = 16 + progress * 34;
      circle(ctx, p.x, p.y, r);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        line(
          ctx,
          p.x + Math.cos(a) * r,
          p.y + Math.sin(a) * r,
          p.x + Math.cos(a) * (r + 9),
          p.y + Math.sin(a) * (r + 9),
          ctx.strokeStyle,
        );
      }
      ctx.globalAlpha = 1;
    }
  }
  glow(ctx, f.x, f.y, 34 + s.brightness * 10, "#6bffe947");
  sprite(
    ctx,
    s,
    "glimmerfin",
    facing(f.dir) + (f.moving ? Math.floor(s.playTime * 9) % 2 : 0),
    f.x,
    f.y,
  );
  ctx.restore();
  // An instrument frame makes the boundary readable without exposing hidden terrain.
  ctx.strokeStyle = "#16353d";
  ctx.lineWidth = 1;
  ctx.strokeRect(63.5, 79.5, 1153, 577);
  for (const x of [64, 1216])
    for (const y of [80, 656]) {
      line(ctx, x, y, x + (x === 64 ? 15 : -15), y, "#49727a");
      line(ctx, x, y, x, y + (y === 80 ? 15 : -15), "#49727a");
    }
}
function gauge(
  ctx: Context,
  label: string,
  key: string,
  x: number,
  ready: boolean,
  cooldown: number,
  max: number,
  color: string,
): void {
  text(ctx, key, x, 688, 13, DIM);
  text(ctx, label, x + 60, 683, 13, ready ? color : DIM);
  ctx.fillStyle = "#15272e";
  ctx.fillRect(x + 60, 699, 134, 3);
  ctx.fillStyle = color;
  ctx.fillRect(x + 60, 699, 134 * (1 - Math.min(1, cooldown / max)), 3);
  text(
    ctx,
    ready ? "READY" : `${cooldown.toFixed(1)}s`,
    x + 214,
    687,
    12,
    ready ? color : DIM,
  );
}
function hud(ctx: Context, s: ReadState): void {
  text(ctx, C.TITLE_TEXT, 64, 33, 23);
  text(ctx, C.DIVE_LABEL, 66, 59, 11, DIM);
  text(ctx, String(s.score).padStart(6, "0"), 640, 39, 48, "#d4f6ed", "center");
  text(ctx, "PLANKTON", 1216, 24, 11, DIM, "right");
  text(ctx, `${s.planktonRemaining} REMAIN`, 1216, 48, 16, CYAN, "right");
  text(ctx, `DEPTH ${s.depth}`, 64, 686, 16, "#b7d0cd");
  for (let i = 0; i < s.lives; i++)
    sprite(ctx, s, "glimmerfin", 6, 217 + i * 29, 686, 24);
  gauge(
    ctx,
    "SONAR",
    "SPACE",
    414,
    s.sonar.ready,
    s.sonar.cooldown,
    C.SONAR_COOLDOWN,
    CYAN,
  );
  gauge(
    ctx,
    "INK",
    "SHIFT",
    756,
    s.ink.ready,
    s.ink.cooldown,
    C.INK_COOLDOWN,
    "#b6a2eb",
  );
  text(ctx, s.muted ? "M · MUTED" : "M · SOUND", 1216, 682, 11, DIM, "right");
  text(ctx, "ESC · PAUSE", 1216, 703, 11, DIM, "right");
}
function menu(ctx: Context, s: ReadState): void {
  menuItems(s).forEach((item, i) => {
    const r = menuRect(s, i);
    if (!r) return;
    const selected = s.menuIndex === i;
    ctx.fillStyle = selected ? "#102e34" : "#07151ddd";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = selected ? "#6cd5ca" : "#17323b";
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (selected) {
      ctx.fillStyle = CYAN;
      ctx.fillRect(r.x, r.y, 3, r.h);
    }
    text(
      ctx,
      item,
      r.x + 25,
      r.y + r.h / 2,
      17,
      selected ? "#d4fff4" : "#789a9f",
    );
    text(
      ctx,
      selected ? "→" : "·",
      r.x + r.w - 25,
      r.y + r.h / 2,
      21,
      selected ? CYAN : DIM,
      "right",
    );
  });
}
function title(ctx: Context, s: ReadState): void {
  // Original bathymetric chart motif, drawn as contours beneath the specimen.
  const x = 923,
    y = 340;
  for (let ring = 0; ring < 11; ring++) {
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const r =
        92 +
        ring * 22 +
        Math.sin(a * 3 + ring * 0.32) * 13 +
        Math.cos(a * 5) * 5;
      const px = x + Math.cos(a) * r,
        py = y + Math.sin(a) * r * 0.85;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = ring % 3 === 0 ? "#163c43" : "#0b252e";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  glow(ctx, x, y, 200, "#1d947d25");
  ctx.save();
  circle(ctx, x, y, 130);
  ctx.clip();
  ctx.translate(x - 640, y - 384);
  terrain(ctx, s, true);
  ctx.restore();
  for (let i = 0; i < 32; i++) {
    const a = (i * Math.PI) / 16;
    const r = 215;
    line(
      ctx,
      x + Math.cos(a) * r,
      y + Math.sin(a) * r,
      x + Math.cos(a) * (r + (i % 4 ? 5 : 12)),
      y + Math.sin(a) * (r + (i % 4 ? 5 : 12)),
      "#28505a",
    );
  }
  glow(ctx, x, y, 66, "#50ffd34d");
  sprite(ctx, s, "glimmerfin", 6, x, y, 96);
  amber(ctx, x + 130, y - 95);
  sprite(ctx, s, "drifter", 2, x + 130, y - 95, 32);
  text(ctx, "01 / THE FORAGER", x, y + 259, 12, DIM, "center");
  text(ctx, "ABYSSAL FIELD NOTES     /     001", 132, 137, 12, DIM);
  text(ctx, C.TITLE_TEXT, 125, 251, 94, "#d1f9ec");
  text(ctx, C.TAGLINE_TEXT, 134, 326, 18, "#72c6bd");
  line(ctx, 134, 367, 185, 367, "#79d4c7");
  text(ctx, "A little light. A long way down.", 204, 367, 13, DIM);
  menu(ctx, s);
  text(ctx, "↑ ↓  SELECT     ENTER  DESCEND", 134, 578, 11, DIM);
  line(ctx, 64, 641, 1216, 641);
  text(ctx, "BIOLUMINESCENT MAZE CHASE", 64, 676, 11, DIM);
  text(
    ctx,
    `${C.DIVE_LABEL} DIVE  /  LIGHT IS A LIABILITY`,
    1216,
    676,
    11,
    DIM,
    "right",
  );
}
function howto(ctx: Context, s: ReadState): void {
  text(ctx, "FIELD GUIDE / 001", 100, 81, 12, DIM);
  text(ctx, "LEARN THE DARK", 100, 130, 42, "#d1f9ec");
  text(ctx, "Eat the lights. Read the water. Keep moving.", 100, 183, 17, CYAN);
  line(ctx, 100, 222, 1180, 222);
  const rows = [
    ["MOVE", "ARROWS / WASD", "Hold to swim. Turn early at a junction."],
    ["SONAR", "SPACE", "Trace passages and expose hunters. Sound travels."],
    ["INK", "SHIFT", "Break a light hunter's gaze. Sound still finds you."],
    ["PAUSE / SOUND", "ESC or P / M", "Take a breath. Silence the dive."],
  ];
  rows.forEach(([name, key, copy], i) => {
    const y = 268 + i * 70;
    text(ctx, name, 100, y, 13, DIM);
    text(ctx, key, 280, y, 14);
    text(ctx, copy, 100, y + 27, 12, "#8fa9ac");
  });
  const species = [
    [
      "lanternjaw",
      "LANTERNJAW",
      "Hunts your light.",
      "An amber glimmer may have teeth.",
    ],
    [
      "gloamfin",
      "GLOAMFIN",
      "Hunts your sound.",
      "A violet ping means you are being heard.",
    ],
    [
      "flarefish",
      "FLAREFISH",
      "Hunts by sudden light.",
      "Get clear before its flare blooms.",
    ],
  ];
  species.forEach(([sheet, name, sense, copy], i) => {
    const y = 277 + i * 91;
    sprite(ctx, s, sheet, 6, 704, y, 48);
    text(ctx, name, 750, y - 9, 17, i === 1 ? "#c2a0f0" : AMBER);
    text(ctx, sense, 750, y + 16, 13, "#b0c7c7");
    text(ctx, copy, 750, y + 38, 11, DIM);
  });
  line(ctx, 100, 561, 1180, 561);
  text(
    ctx,
    "Your glow reveals rock. Sonar remembers the paths beyond it.",
    100,
    597,
    14,
    "#b0c7c7",
  );
  text(
    ctx,
    "Eating widens your window — and makes you easier to find. Clear every mote to descend.",
    100,
    625,
    13,
    DIM,
  );
  text(
    ctx,
    "ENTER / ESC / TAP ANYWHERE  →  RETURN",
    1180,
    675,
    12,
    CYAN,
    "right",
  );
}
export function drawGame(s: ReadState, ctx: Context): void {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  if (s.screen === "title") {
    title(ctx, s);
    return;
  }
  if (s.screen === "howto") {
    howto(ctx, s);
    return;
  }
  if (s.screen !== "gameover") {
    mazeView(ctx, s);
    hud(ctx, s);
  }
  if (s.screen === "playing") return;
  if (s.screen === "countdown" || s.screen === "cleared") {
    ctx.fillStyle = "#041018dd";
    ctx.fillRect(360, 269, 560, 152);
    ctx.strokeStyle = "#25474a";
    ctx.strokeRect(360, 269, 560, 152);
    text(
      ctx,
      s.screen === "countdown" ? "DIVE" : `DEPTH ${s.depth} CLEARED`,
      640,
      320,
      36,
      "#d1f9ec",
      "center",
    );
    text(
      ctx,
      s.screen === "countdown"
        ? `${Math.max(1, Math.ceil(2 - s.screenTime))}  /  INTO THE ABYSS`
        : `+${C.SCORE_CLEAR}  /  DESCENDING`,
      640,
      376,
      15,
      CYAN,
      "center",
    );
    return;
  }
  if (s.screen === "paused") {
    ctx.fillStyle = "#02080ebe";
    ctx.fillRect(64, 80, 1152, 576);
  }
  glow(ctx, 640, 270, 240, "#14544425");
  text(
    ctx,
    s.screen === "paused" ? "SUSPENDED" : "THE DARK TAKES YOU",
    640,
    231,
    s.screen === "paused" ? 42 : 38,
    "#d1f9ec",
    "center",
  );
  text(
    ctx,
    s.screen === "paused"
      ? "THE TRENCH CAN WAIT"
      : `${String(s.score).padStart(6, "0")} POINTS   /   DEPTH ${s.depth}`,
    640,
    290,
    16,
    DIM,
    "center",
  );
  menu(ctx, s);
}
