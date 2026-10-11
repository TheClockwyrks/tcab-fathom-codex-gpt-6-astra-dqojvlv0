import * as C from "./constants";
import type {
  FathomDebugApi,
  FathomSnapshot,
  FathomState,
  ReadState,
  Direction,
} from "./game";
import {
  copy,
  enter,
  freshState,
  predator,
  reconcileMutable,
  roster,
} from "./simulation";
import { center, DIRECTIONS, layer, tile, write } from "./world";
import { menuItems, menuRect } from "./menus";
function requireValue(ok: boolean): void {
  if (!ok) throw new RangeError("Invalid Fathom debug pose");
}
function number(n: number, min = 0, max = Infinity, whole = false): void {
  requireValue(
    Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (!whole || Number.isInteger(n)),
  );
}
function direction(d: Direction): void {
  requireValue(DIRECTIONS.includes(d));
}
function bool(b: boolean): void {
  requireValue(typeof b === "boolean");
}
function cell(s: ReadState, tx: number, ty: number, den = false): void {
  number(tx, 0, C.GRID_COLS - 1, true);
  number(ty, 0, C.GRID_ROWS - 1, true);
  requireValue((den ? ".dg" : ".").includes(tile(s, tx, ty)));
}
function pose(s: ReadState, change: (n: FathomState) => void): FathomState {
  const n = copy(s);
  change(n);
  reconcileMutable(n);
  return n;
}
function indexOf(s: ReadState, index: number, drifter = false): void {
  number(index, 0, (drifter ? s.drifters : s.predators).length - 1, true);
}
function snapshot(s: ReadState): FathomSnapshot {
  return {
    version: s.version,
    screen: s.screen,
    menuIndex: s.menuIndex,
    titleIndex: s.titleIndex,
    depth: s.depth,
    score: s.score,
    lives: s.lives,
    muted: s.muted,
    planktonRemaining: s.planktonRemaining,
    drifterIn: s.drifterIn,
    brightness: s.brightness,
    brightHold: s.brightHold,
    visionRadius: s.visionRadius,
    windowRadius: s.windowRadius,
    sonar: { ...s.sonar },
    ink: { ...s.ink },
    grid: { ...s.grid },
    tiles: [...s.tiles],
    plankton: [...s.plankton],
    visibility: [...s.visibility],
    forager: { ...s.forager },
    simTime: s.simTime,
    drifters: s.drifters.map((d) => ({
      x: d.x,
      y: d.y,
      tx: d.tx,
      ty: d.ty,
      lit: d.lit,
      mind: d.mind,
      travel: d.travel,
    })),
    predators: s.predators.map((p) => ({
      kind: p.kind,
      x: p.x,
      y: p.y,
      tx: p.tx,
      ty: p.ty,
      dir: p.dir,
      state: p.state,
      released: p.released,
      mind: p.mind,
      travel: p.travel,
      speed: p.speed,
      alert: p.alert,
      lit: p.lit,
      detectRange: p.detectRange,
      hearingRange: p.hearingRange,
      hearingLock: p.hearingLock,
      flareCharging: p.flareCharging,
      flaring: p.flaring,
      flareRadius: p.flareRadius,
    })),
    pulses: s.pulses.map((p) => ({
      source: p.source,
      tint: p.tint,
      ox: p.ox,
      oy: p.oy,
      front: p.front,
      range: p.range,
    })),
    inkClouds: s.inkClouds.map((c) => ({ ...c })),
  };
}
export const debugApi: FathomDebugApi = {
  version: C.FATHOM_DEBUG_VERSION,
  reset: (s) => freshState(s.art as FathomState["art"], s.muted),
  snapshot,
  reconcile: (s) => pose(s, () => {}),
  setScreen: (s, value) => {
    requireValue(
      [
        "title",
        "howto",
        "countdown",
        "playing",
        "paused",
        "cleared",
        "gameover",
      ].includes(value),
    );
    return pose(s, (n) => enter(n, value));
  },
  setMenuIndex: (s, index) => {
    number(index, 0, menuItems(s).length - 1, true);
    return pose(s, (n) => {
      n.menuIndex = index;
    });
  },
  setTitleIndex: (s, index) => {
    number(index, 0, C.TITLE_ITEMS.length - 1, true);
    return pose(s, (n) => {
      n.titleIndex = index;
    });
  },
  menuItemRect: menuRect,
  setScore: (s, value) => {
    number(value, 0, Infinity, true);
    return pose(s, (n) => {
      n.score = value;
    });
  },
  setLives: (s, value) => {
    number(value, 0, Infinity, true);
    return pose(s, (n) => {
      n.lives = value;
    });
  },
  setDepth: (s, value) => {
    number(value, 1, Infinity, true);
    return pose(s, (n) => {
      n.depth = value;
      roster(n);
    });
  },
  setMaze: (s, rows) => {
    requireValue(
      Array.isArray(rows) &&
        rows.length === C.GRID_ROWS &&
        rows.every(
          (row) =>
            typeof row === "string" &&
            row.length === C.GRID_COLS &&
            /^[#.dg]+$/.test(row),
        ),
    );
    const all = rows.join("");
    if (/[dg]/.test(all))
      requireValue([...all].filter((c) => c === "g").length === 1);
    return pose(s, (n) => {
      n.tiles = [...rows];
    });
  },
  setPlankton: (s, tx, ty, present) => {
    cell(s, tx, ty);
    bool(present);
    return pose(s, (n) => write(n.plankton, tx, ty, present ? "*" : "-"));
  },
  clearPlankton: (s) =>
    pose(s, (n) => {
      n.plankton = layer("-");
    }),
  clearFog: (s) =>
    pose(s, (n) => {
      n.visibility = layer("u");
      n.tileMarks.fill(0);
    }),
  setForagerTile: (s, tx, ty) => {
    cell(s, tx, ty);
    return pose(s, (n) => {
      Object.assign(n.forager, center(tx, ty), { moving: false });
      n.held = [];
    });
  },
  setForagerDir: (s, dir) => {
    direction(dir);
    return pose(s, (n) => {
      n.forager.dir = dir;
      n.desired = dir;
      n.forager.moving = false;
      n.held = [];
    });
  },
  setBrightness: (s, value) => {
    number(value, 0, 1);
    return pose(s, (n) => {
      n.brightness = value;
    });
  },
  setBrightHold: (s, value) => {
    number(value, 0, C.BRIGHT_HOLD);
    return pose(s, (n) => {
      n.brightHold = value;
    });
  },
  clearPredators: (s) =>
    pose(s, (n) => {
      n.predators = [];
    }),
  addPredator: (s, kind, tx, ty) => {
    requireValue(C.DEN_ORDER.includes(kind));
    cell(s, tx, ty);
    return pose(s, (n) => {
      n.predators.push(predator(kind, tx, ty));
    });
  },
  setPredatorTile: (s, i, tx, ty) => {
    indexOf(s, i);
    cell(s, tx, ty, true);
    return pose(s, (n) => {
      Object.assign(n.predators[i], center(tx, ty));
    });
  },
  setPredatorDir: (s, i, dir) => {
    indexOf(s, i);
    direction(dir);
    return pose(s, (n) => {
      n.predators[i].dir = dir;
    });
  },
  setPredatorState: (s, i, value) => {
    indexOf(s, i);
    requireValue(["den", "wander", "chase"].includes(value));
    const p = s.predators[i];
    requireValue((value === "den" ? "dg" : ".").includes(tile(s, p.tx, p.ty)));
    return pose(s, (n) => {
      const p = n.predators[i];
      p.state = value;
      p.fix = value === "chase" ? { tx: n.forager.tx, ty: n.forager.ty } : null;
      p.linger = value === "chase" ? C.LINGER_TIME : 0;
      p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
    });
  },
  setPredatorReleased: (s, i, value) => {
    indexOf(s, i);
    bool(value);
    return pose(s, (n) => {
      n.predators[i].released = value;
    });
  },
  setPredatorMind: (s, i, value) => {
    indexOf(s, i);
    bool(value);
    return pose(s, (n) => {
      n.predators[i].mind = value;
    });
  },
  setPredatorTravel: (s, i, value) => {
    indexOf(s, i);
    bool(value);
    return pose(s, (n) => {
      n.predators[i].travel = value;
    });
  },
  spawnDrifter: (s, tx, ty) => {
    cell(s, tx, ty);
    return pose(s, (n) => {
      n.drifters.push({
        ...center(tx, ty),
        dir: "up",
        lit: false,
        mind: true,
        travel: true,
      });
    });
  },
  clearDrifters: (s) =>
    pose(s, (n) => {
      n.drifters = [];
    }),
  setDrifterMind: (s, i, value) => {
    indexOf(s, i, true);
    bool(value);
    return pose(s, (n) => {
      n.drifters[i].mind = value;
    });
  },
  setDrifterTravel: (s, i, value) => {
    indexOf(s, i, true);
    bool(value);
    return pose(s, (n) => {
      n.drifters[i].travel = value;
    });
  },
  setDrifterIn: (s, value) => {
    number(value, 0, C.DRIFTER_INTERVAL);
    return pose(s, (n) => {
      n.drifterIn = value;
    });
  },
  setSonarCooldown: (s, value) => {
    number(value);
    return pose(s, (n) => {
      n.sonar.cooldown = value;
    });
  },
  setInkCooldown: (s, value) => {
    number(value);
    return pose(s, (n) => {
      n.ink.cooldown = value;
    });
  },
};
