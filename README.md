# Fathom

**Hunt in the dark.** Fathom is a bioluminescent deep-sea maze chase. Graze every plankton mote, use sonar to chart the trench, and escape three hunters that track light, sound, and sudden flares.

This is the **Kindle** dive: explored corridors remain remembered, but you can only see them through a circular window around your forager. Eating expands the window and strengthens your light. It also makes you easier to find. Amber glimmers can be food—or a Lanternjaw in disguise.

## Run locally

Requires a recent Node.js version supported by Vite 8 (Node 22.12+ recommended).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Everything runs in the browser, with no backend or external services.

## Production

```sh
npm run build
npm run preview
```

Deploy the contents of `dist/` to any static host. The build includes `index.html` and all art, and works at either the host root or a sub-path. Asset URLs are relative to the page.

## Controls

| Control | Action |
| --- | --- |
| Arrow keys / WASD | Hold to swim; select menu items with up/down |
| Space | Sonar pulse |
| Shift | Ink cloud |
| Enter / Space | Confirm menu item |
| Escape / P | Pause or resume |
| Escape | Back from a menu |
| M | Toggle sound |
| Backtick | Toggle engine diagnostics |

Menus also accept pointer and touch. Touching the game reveals the engine's directional pad and action buttons.

Clear all plankton to descend. Sonar reveals routes around corners, but Gloamfins hear it. Ink breaks the light hunters' gaze, but does not stop sound. Three reserve lives mean four attempts; eaten plankton and explored terrain survive a lost life.

## Verification and source

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The game uses the Simple 2D engine for input, audio, assets, canvas fitting, diagnostics, and the frame loop. Its 120 Hz simulation, maze navigation, fog, and hunters live in `src/simulation.ts` and `src/world.ts`. Drawing is in `src/render.ts`; `src/game.ts` declares the state and registers the game. Tests use real engine instances with scripted clocks and an in-process canvas.

The value-based debug API returned by `engine.debug` supports validated poses and serializable snapshots. For example, `engine.apply(s => engine.debug.setBrightness(s, 1))` poses brightness without advancing a tick. No debug globals are installed on the page.

The store-page description and captured gameplay are in `showcase/`.
