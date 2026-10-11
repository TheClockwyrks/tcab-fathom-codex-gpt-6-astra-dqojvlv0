import "./style.css";
import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import { freshState, updateGame } from "./simulation";
import { debugApi } from "./debug";
import { drawGame } from "./render";

export const BACKGROUND = "#03060c";
export type Direction = "up" | "down" | "left" | "right";
export type Screen =
  | "title"
  | "howto"
  | "countdown"
  | "playing"
  | "paused"
  | "cleared"
  | "gameover";
export type PredatorKind = C.PredatorKind;
export interface Body {
  x: number;
  y: number;
  tx: number;
  ty: number;
  dir: Direction;
}
export interface Forager extends Body {
  moving: boolean;
}
export interface Drifter extends Body {
  lit: boolean;
  mind: boolean;
  travel: boolean;
}
export interface Predator extends Drifter {
  kind: PredatorKind;
  state: "den" | "wander" | "chase" | "search";
  released: boolean;
  speed: number;
  alert: boolean;
  detectRange: number | null;
  hearingRange: number | null;
  hearingLock: boolean | null;
  flareCharging: boolean | null;
  flaring: boolean | null;
  flareRadius: number | null;
  fix: { tx: number; ty: number } | null;
  linger: number;
  alertLeft: number;
  markLeft: number;
  chaseSpeed: number;
  pingIn: number;
  pingGap: number;
  searchTime: number;
  searchPing: boolean;
  flareIn: number;
  flareTime: number;
  fadeLeft: number;
  releaseAt: number | null;
}
export interface Pulse {
  source: "forager" | "gloamfin";
  tint: "cyan" | "violet" | "orange";
  ox: number;
  oy: number;
  front: number;
  range: number;
  owner: number | null;
  caught: boolean;
}
export interface InkCloud {
  x: number;
  y: number;
  radius: number;
  remaining: number;
}
export interface FathomState {
  version: number;
  screen: Screen;
  menuIndex: number | null;
  titleIndex: number;
  depth: number;
  score: number;
  lives: number;
  muted: boolean;
  planktonRemaining: number;
  drifterIn: number;
  brightness: number;
  brightHold: number;
  visionRadius: number;
  windowRadius: number;
  sonar: { ready: boolean; cooldown: number; range: number };
  ink: { ready: boolean; cooldown: number };
  grid: {
    cols: number;
    rows: number;
    tile: number;
    originX: number;
    originY: number;
  };
  tiles: string[];
  plankton: string[];
  visibility: string[];
  forager: Forager;
  drifters: Drifter[];
  predators: Predator[];
  pulses: Pulse[];
  inkClouds: InkCloud[];
  simTime: number;
  // All clocks, queued edges and random state travel with the value, never a closure.
  accumulator: number;
  screenTime: number;
  playTime: number;
  random: number;
  desired: Direction;
  held: Direction[];
  pendingSonar: boolean;
  pendingInk: boolean;
  pointerDown: Record<number, number>;
  start: { tx: number; ty: number };
  tileMarks: number[];
  art: Record<string, ImageBitmap[]>;
}
export type ReadState = DeepReadonly<FathomState>;
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface FathomDebugApi {
  version: number;
  reset(s: ReadState): FathomState;
  snapshot(s: ReadState): FathomSnapshot;
  reconcile(s: ReadState): FathomState;
  setScreen(s: ReadState, value: Screen): FathomState;
  setMenuIndex(s: ReadState, index: number): FathomState;
  setTitleIndex(s: ReadState, index: number): FathomState;
  menuItemRect(s: ReadState, index: number): Rect | null;
  setScore(s: ReadState, points: number): FathomState;
  setLives(s: ReadState, n: number): FathomState;
  setDepth(s: ReadState, d: number): FathomState;
  setMaze(s: ReadState, rows: string[]): FathomState;
  setPlankton(
    s: ReadState,
    tx: number,
    ty: number,
    present: boolean,
  ): FathomState;
  clearPlankton(s: ReadState): FathomState;
  clearFog(s: ReadState): FathomState;
  setForagerTile(s: ReadState, tx: number, ty: number): FathomState;
  setForagerDir(s: ReadState, dir: Direction): FathomState;
  setBrightness(s: ReadState, g: number): FathomState;
  setBrightHold(s: ReadState, seconds: number): FathomState;
  clearPredators(s: ReadState): FathomState;
  addPredator(
    s: ReadState,
    kind: PredatorKind,
    tx: number,
    ty: number,
  ): FathomState;
  setPredatorTile(
    s: ReadState,
    index: number,
    tx: number,
    ty: number,
  ): FathomState;
  setPredatorDir(s: ReadState, index: number, dir: Direction): FathomState;
  setPredatorState(
    s: ReadState,
    index: number,
    value: "den" | "wander" | "chase",
  ): FathomState;
  setPredatorReleased(s: ReadState, index: number, value: boolean): FathomState;
  setPredatorMind(s: ReadState, index: number, value: boolean): FathomState;
  setPredatorTravel(s: ReadState, index: number, value: boolean): FathomState;
  spawnDrifter(s: ReadState, tx: number, ty: number): FathomState;
  clearDrifters(s: ReadState): FathomState;
  setDrifterMind(s: ReadState, index: number, value: boolean): FathomState;
  setDrifterTravel(s: ReadState, index: number, value: boolean): FathomState;
  setDrifterIn(s: ReadState, seconds: number): FathomState;
  setSonarCooldown(s: ReadState, seconds: number): FathomState;
  setInkCooldown(s: ReadState, seconds: number): FathomState;
}
export type FathomSnapshot = Omit<
  FathomState,
  | "art"
  | "accumulator"
  | "screenTime"
  | "playTime"
  | "random"
  | "desired"
  | "held"
  | "pendingSonar"
  | "pendingInk"
  | "pointerDown"
  | "start"
  | "tileMarks"
  | "predators"
  | "drifters"
  | "pulses"
> & {
  predators: Omit<
    Predator,
    | "fix"
    | "linger"
    | "alertLeft"
    | "markLeft"
    | "chaseSpeed"
    | "pingIn"
    | "pingGap"
    | "searchTime"
    | "searchPing"
    | "flareIn"
    | "flareTime"
    | "fadeLeft"
    | "releaseAt"
  >[];
  drifters: Omit<Drifter, "dir">[];
  pulses: Omit<Pulse, "owner" | "caught">[];
};

export const game: Game<FathomState, FathomDebugApi> = {
  async initialize(api) {
    for (const action of C.ACTIONS)
      api.input.register(action, { keys: [...C.BINDINGS[action]] });
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        wave: i % 2 ? "triangle" : "sine",
        freq: [740, 880, 130, 330, 180, 95, 440][i],
        freqTo: [990, 180, 45, 650, 1200, 35, 880][i],
        durationMs: [65, 420, 350, 260, 600, 500, 800][i],
        gain: 0.12,
      }),
    );
    const sheets: [string, number][] = [
      ["glimmerfin", 8],
      ["lanternjaw", 16],
      ["gloamfin", 8],
      ["flarefish", 8],
      ["drifter", 8],
      ["flare-bloom", 8],
      ["trench-walls", 19],
    ];
    const art = Object.fromEntries(
      await Promise.all(
        sheets.map(async ([name, count]) => [
          name,
          await Promise.all(
            Array.from({ length: count }, (_, i) =>
              api.assets.loadImage(`${name}/${i}.png`),
            ),
          ),
        ]),
      ),
    );
    for (const key of [
      "screen",
      "depth",
      "score",
      "lives",
      "brightness",
      "visionRadius",
      "windowRadius",
      "planktonRemaining",
    ] as const)
      api.diagnostics.register(key, (s) => s[key]);
    api.diagnostics.register(
      "cooldowns",
      (s) =>
        `sonar ${s.sonar.cooldown.toFixed(2)} / ink ${s.ink.cooldown.toFixed(2)}`,
    );
    api.diagnostics.register(
      "forager",
      (s) => `${s.forager.tx},${s.forager.ty} ${s.forager.dir}`,
    );
    for (let i = 0; i < C.DEN_ORDER.length * C.ROSTER_CAP; i++)
      api.diagnostics.register(`hunter ${i + 1}`, (s) => {
        const p = s.predators[i];
        return p
          ? `${p.kind} ${p.state} ${p.tx},${p.ty} ${p.speed.toFixed(0)} alert:${p.alert}`
          : "—";
      });
    return [freshState(art), debugApi];
  },
  update: updateGame,
  render: (state, api) => drawGame(state, api.ctx),
};
