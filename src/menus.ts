import * as C from "./constants";
import type { ReadState, Rect } from "./game";
export function menuItems(s: Pick<ReadState, "screen">): readonly string[] {
  return s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
}
export function menuRect(
  s: Pick<ReadState, "screen">,
  index: number,
): Rect | null {
  if (!Number.isInteger(index) || index < 0 || index >= menuItems(s).length)
    return null;
  return {
    x: s.screen === "title" ? 132 : 454,
    y: (s.screen === "title" ? 414 : 360) + index * 62,
    w: 372,
    h: 50,
  };
}
