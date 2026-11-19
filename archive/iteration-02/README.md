# entity

One floating cube. All imported images and videos. Black background.

```sh
npm install
npm start
```

Open http://127.0.0.1:4173.

- Drag to rotate; scrolling or pinching zooms into the cube.
- Select any tile to view its image or play its video.
- The gentle initial rotation stops when you interact. There are no visible labels, buttons, or controls. Tap opened media to return to the cube.
- Keyboard: arrows rotate, +/- zoom, Enter opens the center tile, Home resets, Escape closes media; Space pauses/resumes video.

All 2,491 media files appear across the six faces, including Live Photo companions. Original files remain untouched. Image viewing uses generated JPEG previews; original video playback depends on the browser's codec support.

The old dashboard sources are kept under `archive/iteration-01/`; they are not loaded or served.

## Rebuild cube textures

Uses the existing local catalog and previews:

```sh
.venv/bin/python scripts/build-cube.py
```

The six atlases and index live in `media/cube/` and are excluded from Git, along with original media and other derived assets. Three.js is bundled locally under `app/vendor/` with its license; no CDN is used.

## Checks

```sh
npm run check
node scripts/qa-cube.mjs
```

Browser checks require a running local server and Chrome in its standard macOS location. Physical-device touch and every source video codec are not covered by automated checks.
