import type { UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import type {
  FathomState,
  ReadState,
  Predator,
  PredatorKind,
  Screen,
  Direction,
} from "./game";
import {
  center,
  DIRECTIONS,
  distance,
  distances,
  layer,
  lineOfSight,
  locate,
  maze,
  move,
  neighbor,
  open,
  opposite,
  route,
  sameTile,
  segmentDistance,
  tile,
  wander,
  write,
} from "./world";
import { menuItems, menuRect } from "./menus";

/** Clone mutable simulation data, sharing only immutable image resources. */
export function copy(s: ReadState): FathomState {
  return {
    ...s,
    art: s.art as FathomState["art"],
    grid: { ...s.grid },
    sonar: { ...s.sonar },
    ink: { ...s.ink },
    forager: { ...s.forager },
    start: { ...s.start },
    tiles: [...s.tiles],
    plankton: [...s.plankton],
    visibility: [...s.visibility],
    tileMarks: [...s.tileMarks],
    predators: s.predators.map((p) => ({
      ...p,
      fix: p.fix ? { ...p.fix } : null,
    })),
    drifters: s.drifters.map((d) => ({ ...d })),
    pulses: s.pulses.map((p) => ({ ...p })),
    inkClouds: s.inkClouds.map((c) => ({ ...c })),
    held: [...s.held],
    pointerDown: { ...s.pointerDown },
  };
}
export function predator(kind: PredatorKind, tx: number, ty: number): Predator {
  return {
    ...center(tx, ty),
    kind,
    dir: "up",
    state: "wander",
    released: true,
    mind: true,
    travel: true,
    lit: false,
    speed: C.PREDATOR_SPEED,
    alert: false,
    detectRange: null,
    hearingRange: null,
    hearingLock: kind === "gloamfin" ? false : null,
    flareCharging: kind === "flarefish" ? false : null,
    flaring: kind === "flarefish" ? false : null,
    flareRadius: kind === "flarefish" ? 0 : null,
    fix: null,
    linger: 0,
    alertLeft: 0,
    markLeft: 0,
    chaseSpeed: C.GLOAMFIN_CHASE_SPEED,
    pingIn: C.GLOAMFIN_PING_INTERVAL,
    pingGap: C.GLOAMFIN_PING_MIN_GAP,
    searchTime: 0,
    searchPing: false,
    flareIn: C.FLARE_INTERVAL,
    flareTime: 0,
    fadeLeft: 0,
    releaseAt: null,
  };
}
export function roster(s: FathomState): void {
  const kinds = [
    ...C.DEN_ORDER,
    ...C.ROSTER_ADD_ORDER.slice(0, Math.min(s.depth, C.ROSTER_CAP_DEPTH) - 1),
  ];
  const den: { tx: number; ty: number }[] = [];
  s.tiles.forEach((row, ty) =>
    [...row].forEach((v, tx) => {
      if (v === "d") den.push({ tx, ty });
    }),
  );
  s.predators = kinds.map((kind, i) => {
    const pos = den[i % den.length] ?? { tx: 17, ty: 8 };
    const p = predator(kind, pos.tx, pos.ty);
    p.state = "den";
    p.released = false;
    p.releaseAt = i * C.DEN_RELEASE_GAP;
    return p;
  });
  s.playTime = 0;
}
export function reconcileMutable(s: FathomState): void {
  s.visionRadius = C.VISION_MIN + C.VISION_GAIN * s.brightness;
  s.windowRadius = C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * s.brightness;
  s.sonar.range = Math.max(
    C.SONAR_RANGE_MIN,
    C.SONAR_RANGE_BASE - (s.depth - 1),
  );
  s.sonar.ready = s.sonar.cooldown === 0;
  s.ink.ready = s.ink.cooldown === 0;
  s.planktonRemaining = s.plankton.reduce(
    (n, row) => n + [...row].filter((v) => v === "*").length,
    0,
  );
  locate(s.forager);
  s.drifters.forEach(locate);
  for (const p of s.predators) {
    locate(p);
    p.detectRange =
      p.kind === "gloamfin"
        ? null
        : C.LANTERN_RANGE_BASE + C.LANTERN_RANGE_GAIN * s.brightness;
    p.hearingRange = p.kind === "gloamfin" ? C.GLOAMFIN_HEAR : null;
    p.speed =
      p.kind === "lanternjaw" && p.state === "wander"
        ? C.DRIFTER_SPEED
        : p.kind === "gloamfin" && p.state === "chase"
          ? p.chaseSpeed
          : C.PREDATOR_SPEED;
  }
}
export function freshState(
  art: FathomState["art"],
  muted = false,
): FathomState {
  const tiles = maze();
  const s: FathomState = {
    version: C.FATHOM_DEBUG_VERSION,
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    depth: 1,
    score: 0,
    lives: C.START_LIVES,
    muted,
    planktonRemaining: 0,
    drifterIn: C.DRIFTER_INTERVAL,
    brightness: 0,
    brightHold: 0,
    visionRadius: C.VISION_MIN,
    windowRadius: C.KINDLE_VISION_MIN,
    sonar: { ready: true, cooldown: 0, range: C.SONAR_RANGE_BASE },
    ink: { ready: true, cooldown: 0 },
    grid: {
      cols: C.GRID_COLS,
      rows: C.GRID_ROWS,
      tile: C.TILE,
      originX: C.GRID_ORIGIN_X,
      originY: C.GRID_ORIGIN_Y,
    },
    tiles,
    plankton: tiles.map((row) => row.replace(/[^.]/g, "-").replace(/\./g, "*")),
    visibility: layer("u"),
    forager: { ...center(17, 16), dir: "left", moving: false },
    drifters: [],
    predators: [],
    pulses: [],
    inkClouds: [],
    simTime: 0,
    accumulator: 0,
    screenTime: 0,
    playTime: 0,
    random: 0xface1234,
    desired: "left",
    held: [],
    pendingSonar: false,
    pendingInk: false,
    pointerDown: {},
    start: { tx: 17, ty: 16 },
    tileMarks: Array(C.GRID_COLS * C.GRID_ROWS).fill(0),
    art,
  };
  roster(s);
  reconcileMutable(s);
  return s;
}
export function enter(s: FathomState, screen: Screen): void {
  const previous = s.screen;
  s.screen = screen;
  s.screenTime = 0;
  s.menuIndex =
    screen === "title"
      ? s.titleIndex
      : screen === "paused" || screen === "gameover"
        ? 0
        : null;
  if (screen === "playing" && previous !== "paused") s.playTime = 0;
  s.pointerDown = {};
}
function newDive(s: FathomState, screen: Screen): FathomState {
  const next = freshState(s.art, s.muted);
  next.titleIndex = s.titleIndex;
  next.simTime = s.simTime;
  next.accumulator = s.accumulator;
  enter(next, screen);
  return next;
}
function resetLife(s: FathomState): void {
  s.forager = { ...center(s.start.tx, s.start.ty), dir: "left", moving: false };
  s.desired = "left";
  s.brightness = 0;
  s.brightHold = 0;
  roster(s);
  s.drifters = [];
  s.drifterIn = C.DRIFTER_INTERVAL;
  s.pulses = [];
  s.inkClouds = [];
  s.tileMarks.fill(0);
  s.sonar.cooldown = 0;
  s.ink.cooldown = 0;
  s.pendingSonar = false;
  s.pendingInk = false;
  enter(s, "countdown");
}
export function acquire(s: FathomState, p: Predator): void {
  if (p.state !== "chase") {
    if (p.kind !== "lanternjaw") {
      p.alertLeft = C.ALERT_TIME;
      p.alert = true;
    }
    p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
  }
  p.state = "chase";
  p.fix = { tx: s.forager.tx, ty: s.forager.ty };
  p.linger = C.LINGER_TIME;
  if (p.kind === "flarefish") {
    if (p.flaring) p.fadeLeft = 0.35;
    p.flareCharging = false;
    p.flaring = false;
    p.flareRadius = 0;
  }
  const d = route(s, p, p.fix);
  if (d === opposite(p.dir)) p.dir = d;
}
function drop(p: Predator): void {
  p.state = "wander";
  p.fix = null;
  p.linger = 0;
  if (p.kind === "flarefish") {
    p.flareIn = C.FLARE_INTERVAL;
    p.flareCharging = false;
    p.flaring = false;
    p.flareRadius = 0;
  }
}
function ping(
  s: FathomState,
  p: Predator,
  index: number,
  orange: boolean,
  cues: Set<string>,
): void {
  s.pulses.push({
    source: "gloamfin",
    tint: orange ? "orange" : "violet",
    ox: p.tx,
    oy: p.ty,
    front: -1e-9,
    range: C.GLOAMFIN_PING_RANGE,
    owner: index,
    caught: false,
  });
  p.pingIn = C.GLOAMFIN_PING_INTERVAL;
  p.pingGap = 0;
  cues.add(C.CUES.predatorPing);
}
const down = (n: number, dt = C.TICK_DT): number =>
  Math.max(0, n - dt < 1e-9 ? 0 : n - dt);
function hunters(s: FathomState, cues: Set<string>): void {
  const gate = findGate(s);
  const denExists = s.tiles.some((row) => row.includes("d"));
  s.predators.forEach((p, index) => {
    p.markLeft = down(p.markLeft);
    if (!p.mind) return;
    p.alertLeft = down(p.alertLeft);
    p.alert = p.kind !== "lanternjaw" && p.alertLeft > 0;
    p.fadeLeft = down(p.fadeLeft);
    if (p.state === "den") {
      if (!denExists || !gate) return;
      if (p.releaseAt !== null && s.playTime + 1e-9 >= p.releaseAt)
        p.released = true;
      if (!p.released) return;
      const exit = DIRECTIONS.map((d) => neighbor(s, gate.tx, gate.ty, d)).find(
        (n) => tile(s, n.tx, n.ty) === ".",
      );
      if (p.travel && exit)
        move(
          s,
          p,
          C.PREDATOR_SPEED * C.TICK_DT,
          () => route(s, p, exit, true),
          true,
        );
      if (tile(s, p.tx, p.ty) === ".") p.state = "wander";
      return;
    }
    if (p.kind === "gloamfin") {
      const wasLocked = p.hearingLock;
      p.hearingLock = distance(p, s.forager) <= C.GLOAMFIN_HEAR;
      p.pingIn = down(p.pingIn);
      p.pingGap += C.TICK_DT;
      if (p.hearingLock) acquire(s, p);
      else {
        if (wasLocked) p.pingIn = 0;
        if (
          p.state === "chase" &&
          p.fix &&
          sameTile(p, p.fix) &&
          !sameTile(p, s.forager)
        ) {
          p.state = "search";
          p.searchTime = 0;
          p.searchPing = false;
        }
        if (p.state === "search") {
          p.searchTime += C.TICK_DT;
          if (
            p.searchTime + 1e-9 >= C.GLOAMFIN_SEARCH_DELAY &&
            !p.searchPing &&
            p.pingGap + 1e-9 >= C.GLOAMFIN_PING_MIN_GAP
          ) {
            ping(s, p, index, true, cues);
            p.searchPing = true;
          }
          if (p.searchTime + 1e-9 >= C.GLOAMFIN_GIVEUP) drop(p);
        }
        if (p.pingIn === 0 && p.pingGap + 1e-9 >= C.GLOAMFIN_PING_MIN_GAP)
          ping(s, p, index, false, cues);
      }
      if (p.state === "chase")
        p.chaseSpeed = Math.min(
          C.GLOAMFIN_CHASE_SPEED,
          p.chaseSpeed +
            ((C.GLOAMFIN_CHASE_SPEED - C.GLOAMFIN_CORNER_SPEED) * C.TICK_DT) /
              C.GLOAMFIN_RAMP_TIME,
        );
    } else {
      const blind = s.inkClouds.some(
        (c) => segmentDistance(c, p, s.forager) <= c.radius,
      );
      if (blind) {
        if (p.state === "chase") drop(p);
      } else if (
        (distance(p, s.forager) <= (p.detectRange ?? 0) &&
          lineOfSight(s, p, s.forager)) ||
        (p.flaring && distance(p, s.forager) <= C.FLARE_RADIUS)
      )
        acquire(s, p);
      else if (p.state === "chase") {
        p.linger = down(p.linger);
        if (p.linger === 0) drop(p);
      }
      if (p.kind === "flarefish" && p.state === "wander") {
        if (p.flareCharging || p.flaring) {
          p.flareTime = down(p.flareTime);
          if (p.flareTime === 0) {
            if (p.flareCharging) {
              p.flareCharging = false;
              p.flaring = true;
              p.flareRadius = C.FLARE_RADIUS;
              p.flareTime = C.FLARE_BLOOM;
              cues.add(C.CUES.flare);
            } else {
              p.flaring = false;
              p.flareRadius = 0;
              p.fadeLeft = 0.35;
              p.flareIn = C.FLARE_INTERVAL;
            }
          }
        } else {
          p.flareIn = down(p.flareIn);
          if (p.flareIn === 0) {
            p.flareCharging = true;
            p.flareTime = C.FLARE_CHARGE;
          }
        }
        // The first bloom tick also has a live sense.
        if (p.flaring && !blind && distance(p, s.forager) <= C.FLARE_RADIUS)
          acquire(s, p);
      }
    }
    p.speed =
      p.kind === "lanternjaw" && p.state === "wander"
        ? C.DRIFTER_SPEED
        : p.kind === "gloamfin" && p.state === "chase"
          ? p.chaseSpeed
          : C.PREDATOR_SPEED;
    if (p.travel)
      move(s, p, p.speed * C.TICK_DT, () => {
        let d: Direction | null;
        if (p.state === "chase" && p.fix) d = route(s, p, p.fix);
        else if (
          p.state === "search" &&
          p.fix &&
          Math.abs(p.tx - p.fix.tx) + Math.abs(p.ty - p.fix.ty) >=
            C.GLOAMFIN_SEARCH_ROAM
        )
          d = route(s, p, p.fix);
        else d = wander(s, p);
        if (
          d &&
          p.kind === "gloamfin" &&
          p.state === "chase" &&
          d !== p.dir &&
          d !== opposite(p.dir)
        )
          p.chaseSpeed = C.GLOAMFIN_CORNER_SPEED;
        return d;
      });
  });
}
export function findGate(s: ReadState): { tx: number; ty: number } | null {
  const ty = s.tiles.findIndex((row) => row.includes("g"));
  return ty < 0 ? null : { tx: s.tiles[ty].indexOf("g"), ty };
}
function pulses(s: FathomState): void {
  for (const pulse of s.pulses) {
    const before = pulse.front;
    pulse.front += C.SONAR_WAVE_SPEED * C.TICK_DT;
    const ds = distances(s, pulse.ox, pulse.oy);
    const reached = (tx: number, ty: number) => {
      const d = ds[ty * C.GRID_COLS + tx];
      return d > before && d <= pulse.front && d <= pulse.range;
    };
    if (pulse.source === "forager") {
      for (let y = 0; y < C.GRID_ROWS; y++)
        for (let x = 0; x < C.GRID_COLS; x++)
          if (reached(x, y)) {
            s.tileMarks[y * C.GRID_COLS + x] = C.SONAR_MARK_TIME;
            for (const dir of DIRECTIONS) {
              const n = neighbor(s, x, y, dir);
              if (
                n.tx >= 0 &&
                n.tx < C.GRID_COLS &&
                n.ty >= 0 &&
                n.ty < C.GRID_ROWS &&
                tile(s, n.tx, n.ty) === "#"
              )
                s.tileMarks[n.ty * C.GRID_COLS + n.tx] = C.SONAR_MARK_TIME;
            }
          }
      for (const p of s.predators)
        if (
          p.state !== "den" &&
          reached(p.tx, p.ty) &&
          p.kind !== "lanternjaw"
        ) {
          p.markLeft = C.SONAR_MARK_TIME;
          if (p.kind === "gloamfin" && p.mind) acquire(s, p);
        }
    } else if (!pulse.caught && reached(s.forager.tx, s.forager.ty)) {
      pulse.caught = true;
      const p = pulse.owner === null ? null : s.predators[pulse.owner];
      if (p?.mind && p.state !== "den") acquire(s, p);
    }
  }
  s.pulses = s.pulses.filter((p) => p.front <= p.range);
}
export function lighting(s: FathomState): void {
  const flares = s.predators.filter((p) => p.flaring && p.state !== "den");
  const passive = (b: { tx: number; ty: number }) => {
    const c = center(b.tx, b.ty);
    return (
      distance(c, s.forager) <= s.visionRadius + 1e-9 &&
      lineOfSight(s, s.forager, c)
    );
  };
  const bloom = (b: { x: number; y: number }) =>
    flares.some((p) => distance(p, b) <= C.FLARE_RADIUS);
  s.visibility = s.visibility.map((row, y) =>
    [...row]
      .map((v, x) => {
        const lit =
          passive({ tx: x, ty: y }) ||
          bloom(center(x, y)) ||
          s.tileMarks[y * C.GRID_COLS + x] > 0;
        return lit ? "l" : v === "u" ? "u" : "r";
      })
      .join(""),
  );
  for (const p of s.predators)
    p.lit =
      p.state !== "den" &&
      (passive(p) ||
        bloom(p) ||
        p.alert ||
        (p.kind !== "lanternjaw" && p.markLeft > 0) ||
        p.flareCharging === true);
  for (const d of s.drifters) d.lit = passive(d) || bloom(d);
}
function contact(s: FathomState, cues: Set<string>): boolean {
  if (!s.predators.some((p) => p.state !== "den" && sameTile(p, s.forager)))
    return false;
  cues.add(C.CUES.caught);
  if (s.lives === 0) enter(s, "gameover");
  else {
    s.lives--;
    resetLife(s);
  }
  return true;
}
function eat(s: FathomState, cues: Set<string>): void {
  const f = s.forager;
  if (tile(s, f.tx, f.ty) === "." && s.plankton[f.ty]?.[f.tx] === "*") {
    write(s.plankton, f.tx, f.ty, "-");
    s.planktonRemaining--;
    s.score += C.SCORE_PLANKTON;
    s.brightness = Math.min(1, s.brightness + C.BRIGHT_PER_EAT);
    s.brightHold = C.BRIGHT_HOLD;
    cues.add(C.CUES.eat);
    if (s.planktonRemaining === 0) {
      s.score += C.SCORE_CLEAR;
      enter(s, "cleared");
      cues.add(C.CUES.descend);
    }
  }
  s.drifters = s.drifters.filter((d) => {
    if (!sameTile(d, f)) return true;
    s.score += C.SCORE_DRIFTER;
    return false;
  });
}
function tick(s: FathomState, cues: Set<string>): FathomState {
  s.simTime += C.TICK_DT;
  if (s.screen === "countdown" || s.screen === "cleared") {
    s.screenTime += C.TICK_DT;
    if (s.screen === "countdown") lighting(s);
    if (s.screenTime + 1e-9 >= 2) {
      if (s.screen === "countdown") enter(s, "playing");
      else {
        const next = newDive(s, "countdown");
        next.depth = s.depth + 1;
        next.score = s.score;
        next.lives = s.lives;
        roster(next);
        reconcileMutable(next);
        return next;
      }
    }
    return s;
  }
  if (s.screen !== "playing") return s;
  s.playTime += C.TICK_DT;
  s.sonar.cooldown = down(s.sonar.cooldown);
  s.ink.cooldown = down(s.ink.cooldown);
  const decayTime = Math.max(0, C.TICK_DT - s.brightHold);
  s.brightHold = down(s.brightHold);
  s.brightness *= 0.5 ** (decayTime / C.BRIGHT_HALFLIFE);
  s.tileMarks = s.tileMarks.map((n) => down(n));
  s.inkClouds = s.inkClouds
    .map((c) => ({ ...c, remaining: down(c.remaining) }))
    .filter((c) => c.remaining > 0);
  if (s.pendingSonar && s.sonar.cooldown === 0) {
    s.pulses.push({
      source: "forager",
      tint: "cyan",
      ox: s.forager.tx,
      oy: s.forager.ty,
      front: -1e-9,
      range: s.sonar.range,
      owner: null,
      caught: false,
    });
    s.sonar.cooldown = C.SONAR_COOLDOWN;
    cues.add(C.CUES.sonar);
  }
  if (s.pendingInk && s.ink.cooldown === 0) {
    s.inkClouds.push({
      x: s.forager.x,
      y: s.forager.y,
      radius: C.INK_RADIUS,
      remaining: C.INK_LIFE,
    });
    s.ink.cooldown = C.INK_COOLDOWN;
    cues.add(C.CUES.ink);
  }
  s.pendingSonar = false;
  s.pendingInk = false;
  if (contact(s, cues)) {
    reconcileMutable(s);
    lighting(s);
    return s;
  }
  eat(s, cues);
  if (s.screen !== "playing") {
    reconcileMutable(s);
    lighting(s);
    return s;
  }
  const f = s.forager;
  if (s.held.length && s.desired === opposite(f.dir)) f.dir = s.desired;
  f.moving =
    s.held.length > 0 &&
    move(s, f, C.FORAGER_SPEED * C.TICK_DT, () => {
      const n = neighbor(s, f.tx, f.ty, s.desired);
      if (open(s, n.tx, n.ty)) return s.desired;
      const ahead = neighbor(s, f.tx, f.ty, f.dir);
      return open(s, ahead.tx, ahead.ty) ? f.dir : null;
    });
  // Resolve entering a tile before another body can leave it on this tick.
  // Eating also updates the light that hunters sense on this same tick.
  if (contact(s, cues)) {
    reconcileMutable(s);
    lighting(s);
    return s;
  }
  eat(s, cues);
  reconcileMutable(s);
  if (s.screen !== "playing") {
    lighting(s);
    return s;
  }
  hunters(s, cues);
  pulses(s);
  for (const d of s.drifters)
    if (d.mind && d.travel)
      move(
        s,
        d,
        C.DRIFTER_SPEED * C.TICK_DT,
        () => wander(s, d),
        tile(s, d.tx, d.ty) === "g",
      );
  s.drifterIn = down(s.drifterIn);
  if (
    s.drifterIn === 0 &&
    s.drifters.length < C.DRIFTER_MAX &&
    s.planktonRemaining > 0
  ) {
    const gate = findGate(s);
    if (gate) {
      s.drifters.push({
        ...center(gate.tx, gate.ty),
        dir: "up",
        lit: false,
        mind: true,
        travel: true,
      });
      s.drifterIn = C.DRIFTER_INTERVAL;
    }
  }
  if (!contact(s, cues)) eat(s, cues);
  reconcileMutable(s);
  lighting(s);
  return s;
}
function confirmMenu(s: FathomState): FathomState {
  if (s.screen === "title") {
    s.titleIndex = s.menuIndex ?? 0;
    if (s.menuIndex === 0) return newDive(s, "countdown");
    enter(s, "howto");
  } else if (s.screen === "paused") {
    if (s.menuIndex === 0) enter(s, "playing");
    else return newDive(s, s.menuIndex === 1 ? "countdown" : "title");
  } else if (s.screen === "gameover")
    return newDive(s, s.menuIndex === 0 ? "countdown" : "title");
  return s;
}
export function updateGame(
  state: ReadState,
  api: UpdateApi,
  dt: number,
): FathomState {
  let s = copy(state);
  const input = api.input;
  if (input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
  s.muted = api.audio.muted();
  const screen = s.screen;
  if (screen === "playing") {
    if (input.pressed("pause")) enter(s, "paused");
    else {
      const held = DIRECTIONS.filter((d) => input.value(d) > 0);
      const newest = held.filter((d) => !s.held.includes(d));
      if (newest.length) s.desired = newest[newest.length - 1];
      else if (held.length && !held.includes(s.desired))
        s.desired = held[held.length - 1];
      s.held = held;
      s.pendingSonar ||= input.pressed("a");
      s.pendingInk ||= input.pressed("b");
    }
  } else if (
    screen === "paused" &&
    (input.pressed("pause") || input.pressed("back"))
  )
    enter(s, "playing");
  else if (
    screen === "howto" &&
    (input.pressed("confirm") || input.pressed("back"))
  )
    s = newDive(s, "title");
  else if (menuItems(s).length) {
    const count = menuItems(s).length;
    if (input.pressed("up"))
      s.menuIndex = ((s.menuIndex ?? 0) + count - 1) % count;
    if (input.pressed("down")) s.menuIndex = ((s.menuIndex ?? 0) + 1) % count;
    if (input.pressed("back") && screen === "gameover") s = newDive(s, "title");
    else if (input.pressed("confirm")) s = confirmMenu(s);
  }
  if (s.screen === screen && (menuItems(s).length || screen === "howto"))
    for (const sample of input.pointerSamples()) {
      const index =
        screen === "howto"
          ? -2
          : menuItems(s).findIndex((_, i) => {
              const r = menuRect(s, i);
              return (
                r &&
                sample.x >= r.x &&
                sample.x <= r.x + r.w &&
                sample.y >= r.y &&
                sample.y <= r.y + r.h
              );
            });
      if (index >= 0 && sample.type !== "up") s.menuIndex = index;
      if (sample.type === "down") s.pointerDown[sample.id] = index;
      if (sample.type === "up") {
        const match = s.pointerDown[sample.id] === index;
        delete s.pointerDown[sample.id];
        if (match && index !== -1) {
          if (screen === "howto") s = newDive(s, "title");
          else {
            s.menuIndex = index;
            s = confirmMenu(s);
          }
          break;
        }
      }
    }
  s.accumulator += dt;
  while (s.accumulator + 1e-10 >= C.TICK_DT) {
    s.accumulator = Math.max(0, s.accumulator - C.TICK_DT);
    const cues = new Set<string>();
    s = tick(s, cues);
    for (const cue of cues) api.audio.play(cue);
  }
  return s;
}
