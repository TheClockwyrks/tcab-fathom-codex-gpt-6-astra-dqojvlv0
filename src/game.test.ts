import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
} from "@clockwyrks/simple-2d";
import type { Engine, Clock } from "@clockwyrks/simple-2d";
import { game, BACKGROUND } from "./game";
import type { FathomState, FathomDebugApi, ReadState } from "./game";
import * as C from "./constants";
import {
  center,
  distances,
  layer,
  lineOfSight,
  maze,
  neighbor,
  options,
  write,
} from "./world";
import { debugApi as d } from "./debug";
import { freshState } from "./simulation";

beforeAll(() => {
  vi.stubGlobal("fetch", async (url: string) => new Response(url));
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(await blob.text()),
  );
});
const engines: Engine<FathomState, FathomDebugApi>[] = [];
afterEach(() => {
  engines.splice(0).forEach((e) => e.destroy());
});
async function setup(clock: Clock = new ConstantClock(1000 / C.TICK_HZ)) {
  const target = new EventTarget();
  const engine = createEngine({
    canvas: createCanvas(C.STAGE_W, C.STAGE_H) as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    layout: C.LAYOUT,
    clock,
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  engines.push(engine);
  await engine.initialize();
  const key = (code: string, down = true) =>
    target.dispatchEvent(
      Object.assign(new Event(down ? "keydown" : "keyup"), {
        code,
        repeat: false,
      }),
    );
  const tap = async (code: string) => {
    key(code);
    await engine.advance(1);
    key(code, false);
  };
  const pointer = (
    type: string,
    x: number,
    y: number,
    id = 1,
    device = "mouse",
  ) =>
    target.dispatchEvent(
      Object.assign(new Event(`pointer${type}`), {
        clientX: x,
        clientY: y,
        pointerId: id,
        pointerType: device,
        isPrimary: true,
        button: 0,
        buttons: type === "up" ? 0 : 1,
      }),
    );
  return { engine, key, tap, pointer };
}
function fixture(): string[] {
  const rows = layer("#");
  for (let x = 1; x <= 34; x++) write(rows, x, 8, ".");
  return rows;
}
function arena(s: ReadState): FathomState {
  let n = d.setMaze(s, fixture());
  n = d.clearPredators(n);
  n = d.clearPlankton(n);
  n = d.setForagerTile(n, 4, 8);
  return d.setScreen(n, "playing");
}

describe("maze contract", () => {
  it("is symmetric, connected, narrow, enclosed, and within all proportions", () => {
    const s = freshState({});
    const cells: { tx: number; ty: number }[] = [];
    let edges = 0;
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const t = s.tiles[y][x],
          mirror = s.tiles[y][C.GRID_COLS - 1 - x];
        if (!"dg".includes(t) && !"dg".includes(mirror)) expect(t).toBe(mirror);
        if (t === ".") {
          cells.push({ tx: x, ty: y });
          const degree = options(s, { tx: x, ty: y }).length;
          expect(degree).toBeGreaterThanOrEqual(2);
          edges += degree;
          expect([
            s.tiles[y]?.[x + 1],
            s.tiles[y + 1]?.[x],
            s.tiles[y + 1]?.[x + 1],
          ]).not.toEqual([".", ".", "."]);
        }
        if (t === "d") expect(options(s, { tx: x, ty: y })).toHaveLength(0);
      }
    const ds = distances(s, s.start.tx, s.start.ty, false);
    expect(
      cells.every((c) => Number.isFinite(ds[c.ty * C.GRID_COLS + c.tx])),
    ).toBe(true);
    expect(edges / cells.length).toBeGreaterThanOrEqual(C.MAZE_OPENNESS_MIN);
    expect(edges / cells.length).toBeLessThanOrEqual(C.MAZE_OPENNESS_MAX);
    expect(
      cells.length / ((C.GRID_COLS - 2) * (C.GRID_ROWS - 2)),
    ).toBeGreaterThanOrEqual(C.MAZE_DENSITY_MIN);
    const unseen = new Set(
      cells
        .filter((c) => options(s, c).length === 2)
        .map((c) => c.ty * C.GRID_COLS + c.tx),
    );
    const runs: number[] = [];
    while (unseen.size) {
      const queue = [unseen.values().next().value!];
      unseen.delete(queue[0]);
      for (let i = 0; i < queue.length; i++) {
        const b = {
          tx: queue[i] % C.GRID_COLS,
          ty: Math.floor(queue[i] / C.GRID_COLS),
        };
        for (const dir of options(s, b)) {
          const n = neighbor(s, b.tx, b.ty, dir),
            id = n.ty * C.GRID_COLS + n.tx;
          if (unseen.delete(id)) queue.push(id);
        }
      }
      runs.push(queue.length);
    }
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
    expect(mean).toBeGreaterThanOrEqual(C.MAZE_MAZING_MIN);
    expect(mean).toBeLessThanOrEqual(C.MAZE_MAZING_MAX);
    expect(s.tiles.join("").match(/g/g)).toHaveLength(1);
    expect(s.tiles.join("").match(/d/g)).toHaveLength(12);
    expect(
      s.tiles.filter((row) => row[0] === "." && row[35] === "."),
    ).toHaveLength(1);
    const fromStart = distances(s, s.start.tx, s.start.ty);
    expect(
      s.predators.every((p) =>
        Number.isFinite(fromStart[p.ty * C.GRID_COLS + p.tx]),
      ),
    ).toBe(true);
  });
});

describe("engine and menus", () => {
  it("initializes the full contract and diagnostics, retaining old states by value", async () => {
    const { engine, tap } = await setup();
    const before = engine.debug.snapshot(engine.state);
    expect(before.screen).toBe("title");
    expect(before.predators.map((p) => p.kind)).toEqual(C.DEN_ORDER);
    expect(before.visibility.every((row) => /^u+$/.test(row))).toBe(true);
    expect(engine.diagnostics().every((v) => !v.error)).toBe(true);
    await tap("Enter");
    expect(engine.state.screen).toBe("countdown");
    expect(before.screen).toBe("title");
    await engine.advance(239);
    expect(engine.state.screen).toBe("playing");
    expect(engine.state.predators.every((p) => !p.released)).toBe(true);
    await engine.advance(1);
    expect(engine.state.predators[0].released).toBe(true);
  });
  it("remembers the how-to selection, wraps menus, and returns by keyboard", async () => {
    const { engine, tap } = await setup();
    await tap("ArrowUp");
    expect(engine.state.menuIndex).toBe(1);
    await tap("Space");
    expect(engine.state.screen).toBe("howto");
    await tap("Escape");
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(1);
    expect(engine.state.titleIndex).toBe(1);
  });
  it("Escape pauses and resumes once and frozen world clocks do not move", async () => {
    const { engine, tap } = await setup();
    engine.apply(arena);
    engine.apply((s) => d.setSonarCooldown(s, 1));
    await tap("Escape");
    const cooldown = engine.state.sonar.cooldown;
    const time = engine.state.simTime;
    await engine.advance(60);
    expect(engine.state.screen).toBe("paused");
    expect(engine.state.sonar.cooldown).toBe(cooldown);
    expect(engine.state.simTime).toBeGreaterThan(time);
    await tap("Escape");
    expect(engine.state.screen).toBe("playing");
  });
  it("pointer and touch confirmations require both edges in the same item", async () => {
    const { engine, pointer } = await setup();
    await engine.advance(1);
    const a = d.menuItemRect(engine.state, 0)!,
      b = d.menuItemRect(engine.state, 1)!;
    pointer("down", a.x + 4, a.y + 4);
    pointer("up", b.x + 4, b.y + 4);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    pointer("down", b.x + 4, b.y + 4, 2, "touch");
    pointer("up", b.x + 4, b.y + 4, 2, "touch");
    await engine.advance(1);
    expect(engine.state.screen).toBe("howto");
    pointer("down", 40, 40);
    pointer("up", 40, 40);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
  });
  it("restart resets the dive and mute is a persistent runtime preference", async () => {
    const { engine, tap } = await setup();
    engine.apply(arena);
    engine.apply((s) => d.setScore(s, 987));
    await tap("KeyM");
    await tap("KeyP");
    engine.apply((s) => d.setMenuIndex(s, 1));
    await tap("Enter");
    expect(engine.state.score).toBe(0);
    expect(engine.state.muted).toBe(true);
    expect(engine.state.screen).toBe("countdown");
    engine.apply(d.reset);
    expect(engine.state.muted).toBe(true);
  });
});

describe("fixed-step travel and gameplay", () => {
  it("covers identical distance under different frame partitions", async () => {
    const a = await setup(new ConstantClock(1000 / 60)),
      b = await setup(new SequenceClock([5, 25, 10, 10]));
    a.engine.apply(arena);
    b.engine.apply(arena);
    a.key("ArrowRight");
    b.key("ArrowRight");
    await a.engine.advance(60);
    await b.engine.advance(80);
    expect(a.engine.state.forager.x).toBeCloseTo(
      center(4, 8).x + C.FORAGER_SPEED,
      8,
    );
    expect(d.snapshot(a.engine.state)).toEqual(d.snapshot(b.engine.state));
  });
  it("stops without a held action and reverses between centers", async () => {
    const { engine, key } = await setup();
    engine.apply(arena);
    const x = engine.state.forager.x;
    key("ArrowRight");
    await engine.advance(10);
    key("ArrowRight", false);
    await engine.advance(10);
    const stopped = engine.state.forager.x;
    expect(engine.state.forager.moving).toBe(false);
    key("ArrowLeft");
    await engine.advance(10);
    expect(engine.state.forager.x).toBeCloseTo(x, 8);
    expect(stopped).toBeGreaterThan(x);
  });
  it("buffers perpendicular turns and stays on center lines", async () => {
    const { engine, key } = await setup();
    engine.apply(arena);
    const rows = fixture();
    for (let y = 4; y < 8; y++) write(rows, 6, y, ".");
    engine.apply((s) => d.setMaze(s, rows));
    key("ArrowRight");
    await engine.advance(40);
    key("ArrowUp");
    await engine.advance(50);
    expect(engine.state.forager.x).toBeCloseTo(center(6, 8).x);
    expect(engine.state.forager.y).toBeLessThan(center(6, 8).y);
  });
  it("wraps continuously through the tunnel in one ordinary step", async () => {
    const { engine, key } = await setup();
    engine.apply(arena);
    const rows = fixture();
    write(rows, 0, 8, ".");
    write(rows, 35, 8, ".");
    engine.apply((s) => d.setMaze(s, rows));
    engine.apply((s) => d.setForagerTile(s, 0, 8));
    key("ArrowLeft");
    await engine.advance(30);
    expect(engine.state.forager.x).toBeCloseTo(center(35, 8).x);
    expect(engine.state.forager.ty).toBe(8);
  });
  it("does not move a body enclosed or left on rock by a fixture", async () => {
    const { engine, key } = await setup();
    engine.apply(arena);
    engine.apply((s) => d.setMaze(s, layer("#")));
    key("ArrowRight");
    const x = engine.state.forager.x;
    await engine.advance(120);
    expect(engine.state.forager.x).toBe(x);
  });
  it("eats exactly once, holds brightness then halves it", async () => {
    const { engine } = await setup();
    engine.apply(arena);
    engine.apply((s) => d.setPlankton(s, 4, 8, true));
    engine.apply((s) => d.setPlankton(s, 30, 8, true));
    await engine.advance(1);
    expect(engine.state.score).toBe(C.SCORE_PLANKTON);
    expect(engine.state.brightness).toBe(C.BRIGHT_PER_EAT);
    await engine.advance(120);
    expect(engine.state.brightness).toBeCloseTo(C.BRIGHT_PER_EAT);
    await engine.advance(108);
    expect(engine.state.brightness).toBeCloseTo(C.BRIGHT_PER_EAT / 2);
    expect(engine.state.windowRadius).toBeCloseTo(
      C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * engine.state.brightness,
    );
  });
  it("awards a clear and descends without losing score or reserves", async () => {
    const { engine } = await setup();
    engine.apply(arena);
    engine.apply((s) => d.setPlankton(s, 4, 8, true));
    await engine.advance(1);
    expect(engine.state.screen).toBe("cleared");
    expect(engine.state.score).toBe(C.SCORE_CLEAR + C.SCORE_PLANKTON);
    await engine.advance(240);
    expect(engine.state.screen).toBe("countdown");
    expect(engine.state.depth).toBe(2);
    expect(engine.state.predators).toHaveLength(4);
    expect(engine.state.tiles).toEqual(maze());
    expect(engine.state.visibility.every((row) => /^u+$/.test(row))).toBe(true);
  });
  it("an empty posed board does not clear itself", async () => {
    const { engine } = await setup();
    engine.apply(arena);
    await engine.advance(120);
    expect(engine.state.screen).toBe("playing");
  });
  it("contact spends reserves, preserves the maze, and eventually ends the run", async () => {
    const { engine } = await setup();
    engine.apply(arena);
    engine.apply((s) => d.addPredator(s, "lanternjaw", 4, 8));
    engine.apply((s) => d.setPredatorMind(s, 0, false));
    await engine.advance(1);
    expect(engine.state.lives).toBe(C.START_LIVES - 1);
    expect(engine.state.screen).toBe("countdown");
    expect(engine.state.planktonRemaining).toBe(0);
    engine.apply(arena);
    engine.apply((s) => d.setLives(s, 0));
    engine.apply((s) => d.addPredator(s, "gloamfin", 4, 8));
    await engine.advance(1);
    expect(engine.state.screen).toBe("gameover");
    expect(engine.state.lives).toBe(0);
  });
  it("eats a stationary drifter for its bonus without changing brightness", async () => {
    const { engine } = await setup();
    engine.apply(arena);
    engine.apply((s) => d.spawnDrifter(s, 4, 8));
    engine.apply((s) => d.setDrifterMind(s, 0, false));
    await engine.advance(1);
    expect(engine.state.score).toBe(C.SCORE_DRIFTER);
    expect(engine.state.drifters).toHaveLength(0);
    expect(engine.state.brightness).toBe(0);
  });
});

describe("sensing and hunters", () => {
  it("light reveals the first wall but never the tiles behind it", async () => {
    const { engine } = await setup();
    engine.apply(arena);
    engine.apply(d.clearFog);
    await engine.advance(1);
    expect(engine.state.visibility[7][4]).toBe("l");
    expect(engine.state.visibility[6][4]).toBe("u");
    expect(engine.state.visibility[8][7]).toBe("l");
    expect(engine.state.visibility[8][8]).toBe("u");
    expect(lineOfSight(engine.state, center(4, 8), center(4, 6))).toBe(false);
  });
  it("memory survives moving beyond the outer circle", async () => {
    const { engine } = await setup();
    engine.apply(arena);
    await engine.advance(1);
    engine.apply((s) => d.setForagerTile(s, 30, 8));
    await engine.advance(1);
    expect(engine.state.visibility[8][4]).toBe("r");
  });
  it("sonar arrives later, bends around corners, marks hunters and is heard on arrival", async () => {
    const { engine, tap } = await setup();
    engine.apply(arena);
    engine.apply((s) => d.addPredator(s, "gloamfin", 10, 8));
    engine.apply((s) => d.setPredatorTravel(s, 0, false));
    await tap("Space");
    expect(engine.state.predators[0].state).toBe("wander");
    await engine.advance(51);
    expect(engine.state.predators[0].state).toBe("chase");
    expect(engine.state.predators[0].alert).toBe(true);
    expect(engine.state.predators[0].lit).toBe(true);
  });
  it("sonar does not expose either amber body", async () => {
    const { engine, tap } = await setup();
    engine.apply(arena);
    engine.apply((s) => d.addPredator(s, "lanternjaw", 10, 8));
    engine.apply((s) => d.setPredatorMind(s, 0, false));
    engine.apply((s) => d.spawnDrifter(s, 10, 8));
    engine.apply((s) => d.setDrifterMind(s, 0, false));
    await tap("Space");
    await engine.advance(60);
    expect(engine.state.predators[0].lit).toBe(false);
    expect(engine.state.drifters[0].lit).toBe(false);
    expect(engine.state.visibility[8][10]).toBe("l");
  });
  it("ink immediately breaks light fixes but not close hearing", async () => {
    const { engine, tap } = await setup();
    engine.apply(arena);
    engine.apply((s) => d.addPredator(s, "lanternjaw", 6, 8));
    engine.apply((s) => d.addPredator(s, "gloamfin", 5, 8));
    for (const i of [0, 1])
      engine.apply((s) => d.setPredatorTravel(s, i, false));
    await engine.advance(1);
    expect(engine.state.predators.every((p) => p.state === "chase")).toBe(true);
    await tap("ShiftLeft");
    expect(engine.state.predators[0].state).toBe("wander");
    expect(engine.state.predators[1].hearingLock).toBe(true);
    expect(engine.state.inkClouds[0].radius).toBe(C.INK_RADIUS);
  });
  it("a light fix lingers for two seconds after sight is lost", async () => {
    const { engine } = await setup();
    engine.apply(arena);
    engine.apply((s) => d.addPredator(s, "lanternjaw", 7, 8));
    engine.apply((s) => d.setPredatorTravel(s, 0, false));
    await engine.advance(1);
    expect(engine.state.predators[0].speed).toBe(C.PREDATOR_SPEED);
    engine.apply((s) => d.setForagerTile(s, 30, 8));
    await engine.advance(239);
    expect(engine.state.predators[0].state).toBe("chase");
    await engine.advance(1);
    expect(engine.state.predators[0].state).toBe("wander");
    expect(engine.state.predators[0].speed).toBe(C.DRIFTER_SPEED);
  });
  it("Gloamfin hearing crosses rock and ink, and its ping reveals nothing", async () => {
    const { engine } = await setup();
    engine.apply(arena);
    engine.apply((s) => d.addPredator(s, "gloamfin", 20, 8));
    engine.apply((s) => d.setPredatorTravel(s, 0, false));
    await engine.advance(481);
    expect(engine.state.pulses.some((p) => p.tint === "violet")).toBe(true);
    expect(engine.state.visibility[8][20]).toBe("u");
    expect(engine.state.predators[0].lit).toBe(false);
  });
  it("Flarefish charges, blooms through rock, then fades with remembered terrain", async () => {
    const { engine } = await setup();
    engine.apply(arena);
    engine.apply((s) => d.addPredator(s, "flarefish", 20, 8));
    engine.apply((s) => d.setPredatorTravel(s, 0, false));
    await engine.advance(840);
    expect(engine.state.predators[0].flareCharging).toBe(true);
    await engine.advance(60);
    expect(engine.state.predators[0].flaring).toBe(true);
    expect(engine.state.visibility[6][20]).toBe("l");
    await engine.advance(120);
    expect(engine.state.predators[0].flaring).toBe(false);
    expect(engine.state.visibility[6][20]).toBe("r");
  });
  it("a Flarefish bloom can lock through rock", async () => {
    const { engine } = await setup();
    engine.apply(arena);
    const rows = fixture();
    write(rows, 10, 6, ".");
    engine.apply((s) => d.setMaze(s, rows));
    engine.apply((s) => d.setForagerTile(s, 10, 6));
    engine.apply((s) => d.addPredator(s, "flarefish", 10, 8));
    engine.apply((s) => d.setPredatorTravel(s, 0, false));
    await engine.advance(901);
    expect(engine.state.predators[0].state).toBe("chase");
    expect(engine.state.predators[0].flaring).toBe(false);
    expect(engine.state.predators[0].alert).toBe(true);
  });
  it("mind-off hunters stay fixed while travel-off hunters still sense", async () => {
    const { engine } = await setup();
    engine.apply(arena);
    engine.apply((s) => d.addPredator(s, "lanternjaw", 6, 8));
    engine.apply((s) => d.setPredatorMind(s, 0, false));
    await engine.advance(60);
    expect(engine.state.predators[0].state).toBe("wander");
    expect(engine.state.predators[0].x).toBe(center(6, 8).x);
    engine.apply((s) => d.setPredatorMind(s, 0, true));
    engine.apply((s) => d.setPredatorTravel(s, 0, false));
    await engine.advance(1);
    expect(engine.state.predators[0].state).toBe("chase");
    expect(engine.state.predators[0].x).toBe(center(6, 8).x);
  });
});

describe("debug contracts", () => {
  it("reconcile is idempotent, pure, and cannot reveal, eat or tick", () => {
    const s = freshState({});
    const changed = {
      ...s,
      brightness: 1,
      depth: 9,
      sonar: { ...s.sonar, cooldown: 2 },
      forager: { ...s.forager, ...center(5, 11), tx: 0 },
    };
    const r = d.reconcile(changed);
    expect(r.forager.tx).toBe(5);
    expect(r.visionRadius).toBe(C.VISION_MIN + C.VISION_GAIN);
    expect(r.sonar.range).toBe(C.SONAR_RANGE_MIN);
    expect(r.sonar.ready).toBe(false);
    expect(r.simTime).toBe(0);
    expect(r.score).toBe(0);
    expect(r.visibility).toEqual(s.visibility);
    expect(changed.forager.tx).toBe(0);
    expect(d.reconcile(r)).toEqual(r);
  });
  it("poses unbounded allowed figures, and refuses invalid domains loudly", () => {
    const s = freshState({});
    expect(d.setSonarCooldown(s, 99).sonar.cooldown).toBe(99);
    expect(d.setDepth(s, 99).predators).toHaveLength(6);
    expect(d.setLives(s, 99).lives).toBe(99);
    for (const operation of [
      () => d.setBrightness(s, 1.1),
      () => d.setScore(s, -1),
      () => d.setLives(s, 1.5),
      () => d.setPredatorMind(s, 3, false),
      () => d.setMaze(s, ["."]),
      () => d.setForagerTile(s, 0, 0),
      () => d.setDrifterIn(s, 26),
      () => d.setMenuIndex(d.setScreen(s, "playing"), 0),
    ])
      expect(operation).toThrow(RangeError);
  });
  it("fixtures preserve all unrelated layers and clearFog stays clear after reconcile", () => {
    const s = freshState({});
    const rows = fixture();
    const n = d.setMaze(s, rows);
    expect(n.tiles).toEqual(rows);
    expect(n.plankton).toEqual(s.plankton);
    expect(n.forager).toEqual(s.forager);
    const clear = d.reconcile(d.clearFog(n));
    expect(clear.visibility.every((row) => /^u+$/.test(row))).toBe(true);
  });
  it("the den releases by live time and paused time cannot consume a slot", async () => {
    const { engine } = await setup();
    engine.apply((s) => d.setScreen(s, "playing"));
    engine.apply(d.clearPlankton);
    engine.apply((s) => d.setForagerTile(s, 1, 16));
    engine.apply((s) => d.setPredatorTravel(s, 0, false));
    engine.apply((s) => d.setPredatorTravel(s, 1, false));
    await engine.advance(599);
    expect(engine.state.predators[0].released).toBe(true);
    expect(engine.state.predators[1].released).toBe(false);
    engine.apply((s) => d.setScreen(s, "paused"));
    await engine.advance(120);
    expect(engine.state.predators[1].released).toBe(false);
    engine.apply((s) => d.setScreen(s, "playing"));
    await engine.advance(1);
    expect(engine.state.predators[1].released).toBe(true);
  });
});

describe("cadence, search, and cue integration", () => {
  it("admits drifters at the gate, caps natural admissions, and allows debug extras", async () => {
    const { engine } = await setup();
    engine.apply((s) => d.setScreen(s, "playing"));
    engine.apply(d.clearPredators);
    engine.apply((s) => d.setDrifterIn(s, 0));
    await engine.advance(1);
    expect(engine.state.drifters).toHaveLength(1);
    expect(engine.state.drifters[0].ty).toBe(6);
    await engine.advance(61);
    expect(engine.state.drifters[0].ty).toBe(5);
    engine.apply((s) => d.setDrifterIn(s, 0));
    await engine.advance(1);
    expect(engine.state.drifters).toHaveLength(C.DRIFTER_MAX);
    engine.apply((s) => d.setDrifterIn(s, 0));
    await engine.advance(1);
    expect(engine.state.drifters).toHaveLength(C.DRIFTER_MAX);
    engine.apply((s) => d.spawnDrifter(s, 1, 1));
    expect(engine.state.drifters).toHaveLength(C.DRIFTER_MAX + 1);
  });
  it("no-gate fixtures neither admit drifters nor release den occupants", async () => {
    const { engine } = await setup();
    engine.apply((s) => d.setMaze(s, fixture()));
    engine.apply((s) => d.setForagerTile(s, 4, 8));
    engine.apply((s) => d.setScreen(s, "playing"));
    engine.apply((s) => d.setDrifterIn(s, 0));
    await engine.advance(120);
    expect(engine.state.drifters).toHaveLength(0);
    expect(
      engine.state.predators.every(
        (p) => p.state === "den" && !p.lit && !p.released,
      ),
    ).toBe(true);
  });
  it("an empty sound fix triggers search, one orange ping, then gives up", async () => {
    const { engine } = await setup();
    engine.apply(arena);
    engine.apply((s) => d.setForagerTile(s, 10, 8));
    engine.apply((s) => d.addPredator(s, "gloamfin", 10, 8));
    engine.apply((s) => d.setPredatorState(s, 0, "chase"));
    engine.apply((s) => d.setForagerTile(s, 30, 8));
    engine.apply((s) => d.setPredatorTravel(s, 0, false));
    await engine.advance(1);
    expect(engine.state.predators[0].state).toBe("search");
    await engine.advance(143);
    expect(engine.state.pulses.some((p) => p.tint === "orange")).toBe(true);
    await engine.advance(457);
    expect(engine.state.predators[0].state).toBe("wander");
  });
  it("chases around rock on a shortest route and slows at a corner", async () => {
    const { engine } = await setup();
    engine.apply(arena);
    const rows = layer("#");
    for (let x = 4; x <= 8; x++) {
      write(rows, x, 6, ".");
      write(rows, x, 8, ".");
    }
    write(rows, 8, 7, ".");
    engine.apply((s) => d.setMaze(s, rows));
    engine.apply((s) => d.setForagerTile(s, 4, 6));
    engine.apply((s) => d.addPredator(s, "gloamfin", 5, 8));
    engine.apply((s) => d.setPredatorDir(s, 0, "right"));
    engine.apply((s) => d.setPredatorState(s, 0, "chase"));
    await engine.advance(90);
    expect(engine.state.predators[0].tx).toBe(8);
    expect(engine.state.predators[0].dir).toBe("up");
    expect(engine.state.predators[0].speed).toBeLessThan(
      C.GLOAMFIN_CHASE_SPEED,
    );
    for (let i = 0; i < 50; i++) {
      await engine.advance(1);
      const p = engine.state.predators[0];
      expect(engine.state.tiles[p.ty][p.tx]).toBe(".");
    }
  });
  it("sonar bends around a corner and cannot enter a sealed passage", async () => {
    const { engine, tap } = await setup();
    engine.apply(arena);
    const rows = fixture();
    for (let y = 4; y <= 7; y++) write(rows, 8, y, ".");
    write(rows, 10, 4, ".");
    engine.apply((s) => d.setMaze(s, rows));
    await tap("Space");
    await engine.advance(77);
    expect(engine.state.visibility[4][8]).toBe("l");
    expect(engine.state.visibility[4][10]).toBe("u");
  });
  it("plays each event cue once per tick even when muted", async () => {
    const { engine, tap } = await setup();
    const cues: { cue: string; gain: number }[] = [];
    engine.events.on("cue:played", (cue) => cues.push(cue));
    engine.apply(arena);
    await tap("KeyM");
    engine.apply((s) => d.setPlankton(s, 4, 8, true));
    engine.apply((s) => d.setPlankton(s, 30, 8, true));
    await engine.advance(1);
    await tap("Space");
    await tap("ShiftLeft");
    expect(cues.map((c) => c.cue)).toEqual([
      C.CUES.eat,
      C.CUES.sonar,
      C.CUES.ink,
    ]);
    expect(cues.every((c) => c.gain === 0)).toBe(true);
    engine.apply((s) => d.addPredator(s, "gloamfin", 20, 8));
    engine.apply((s) => d.addPredator(s, "gloamfin", 20, 8));
    for (const i of [0, 1])
      engine.apply((s) => d.setPredatorTravel(s, i, false));
    await engine.advance(480);
    expect(cues.filter((c) => c.cue === C.CUES.predatorPing)).toHaveLength(1);
  });
  it("reset restores the complete opening observable state", async () => {
    const { engine, tap } = await setup();
    const original = d.snapshot(engine.state);
    engine.apply(arena);
    engine.apply((s) => d.setDepth(s, 7));
    engine.apply((s) => d.setScore(s, 600));
    await tap("Space");
    await tap("ShiftLeft");
    engine.apply(d.reset);
    expect(d.snapshot(engine.state)).toEqual(original);
  });
});

it("contact is resolved when the forager enters, before a hunter can leave", async () => {
  const { engine, key } = await setup();
  engine.apply(arena);
  engine.apply((s) => d.addPredator(s, "lanternjaw", 5, 8));
  engine.apply((s) => d.setPredatorDir(s, 0, "right"));
  engine.apply((s) =>
    d.reconcile({
      ...s,
      forager: {
        ...s.forager,
        x: center(4, 8).x + C.TILE / 2 - 0.5,
        dir: "right",
      },
      predators: s.predators.map((p) => ({
        ...p,
        x: center(5, 8).x + C.TILE / 2 - 0.5,
      })),
    }),
  );
  key("ArrowRight");
  await engine.advance(1);
  expect(engine.state.lives).toBe(C.START_LIVES - 1);
  expect(engine.state.screen).toBe("countdown");
});
