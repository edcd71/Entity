# entity

A media workspace with a full-bleed image grid, a scrolling control rail, and a
collapsible Entity title card. The older particle-sphere experiment remains available.

```sh
npm install
npm start
```

Open [Entity's photo grid](http://127.0.0.1:4173/app/grid.html).
On this Mac, double-click **Entity.app** on the Desktop to start the server and
open that grid in a new Chrome window every time, without a Terminal window. It reuses an existing Entity
server and waits for a new server to be ready before opening Chrome. On first
launch, allow macOS's Documents access request: the project is stored there.

`npm run launch` runs the same launcher from a terminal. `npm run install:launcher`
creates the Desktop app for this checkout; it refuses to overwrite an existing
`Entity.app`. If the project moves, move the old launcher aside and reinstall it.
The launcher uses the title's tiled Geist Serif **E** on Entity blue. Editable SVG,
PNG, and macOS ICNS assets live in `assets/branding/`. Rebuild with
`npm run build:launcher-icon`; update the Desktop icon with `npm run apply:launcher-icon`.
Launcher-started server logs are saved in `.entity-runtime/server-4173.log`.
The server stays running after the launcher or Chrome closes. Verify startup,
reuse, simultaneous launches, and port conflicts with `node scripts/qa-launcher.mjs`.

Opening `app/grid.html` directly from Finder redirects to this local web URL;
the server must be running (use the Desktop launcher or `npm start`). The app's modules, styles, and media
requests require HTTP and cannot load from a `file://` address.
The older sphere remains at http://127.0.0.1:4173, with Moonlight lighting as the default.

The **Photo grid** link opens an eight-row horizontal contact sheet at `/app/grid.html`. A wheel,
trackpad, or touch swipe moves through the grid. Use the arrow keys to move between
images and Enter to enlarge one. Escape returns to the same place.

The controls occupy a separate, vertically scrolling rail between the blue title
card and the images. The image grid and controls scroll independently. Click the
splitter between the card and rail, or drag it left, to hide the card and snap the
controls to the left edge. The splitter moves to the rail's right edge; click it
again or drag right to restore the card. Dragging also adjusts the card width.
The layout is remembered across reloads. Focus the splitter and use Left/Right
to resize, Home to dock, End to restore, or Enter/Space to toggle; Escape cancels
an active drag. On compact screens the rail starts docked, expands when a tool
opens, and restores the title card as a dismissible drawer.

All ten controls use the hold ring and Rail 08 opening/closing spring.
Drag a control's top grip to float it anywhere in the browser; the rest of its
frame supports touch scrolling within the rail. On Demand UI’s Date Range
control starts collapsed. Hold its caret for 540 ms to open or close it. Drag a
node or use the wheel beside it to change its year. The grid includes both
endpoint years. With the track focused, Up and Down adjust the latest year.
Hold Shift to adjust the earliest year. Page Up and Page Down step five years.

Hold the clock button to open Time. Drag the two handles around its 24-hour dial
to choose a capture-time range, clockwise from S (start) to E (end). Midnight is
at the top; ranges can cross midnight, such as 22:00–06:00. Handles preview in
15-minute steps and apply the filter on release, with the grid's tiling animation.
Arrow keys adjust one minute, Shift adjusts 15 minutes, and Page Up/Down adjust
one hour. Reset, or matching endpoints, selects all day. Times use the recorded
camera clock without converting to the browser's time zone. Photos without a
usable time remain in All day and are excluded when a time range is active.
Time combines with date, location, and color controls and shares their hold ring,
opening/closing spring, keyboard activation, and draggable frame.

Move a mouse or pen across the photos to lift and tilt the nearby thumbnails
with the same Three.js response as the Entity title. One shared renderer handles
the local group and rests when the pointer stops. Clicking still opens the photo;
touch keeps native swiping and tapping. Scrolling, filtering, and opening a photo
restore the original image elements. Hover stays paused through scrolling and
resumes when scrolling settles and the pointer moves again. WebGL failure leaves
the grid usable.

Hold the multicolor button in the control group to open the color pad. Set the
hue, drag the loupe to sample a hex color, and release to sort the selected years
by their closest sampled photo color in CIE Lab. Clear restores capture order.

Hold the pin button to open Location. Search for a place and select it to filter
the grid; All locations clears the filter, and No location includes photos without
usable coordinates or a written city. Counts follow the selected date, time range, and moment.
The location filter combines with date/time filtering, Moments, and color sorting, and uses the
same hold ring, spring, keyboard activation, and draggable shell as the other tools.

Hold the stacked-photo button to open Moments. It groups the archive automatically
by capture time and nearby location. Browse the newest groups first, or search by
place, date, or time. Select one to show its photos; All moments clears only that
selection. Each option shows a preview, place, date, capture times, and the number
of images matching the other filters. Groups stay fixed while filters change;
an excluded selected moment remains available with a zero count so it can be cleared.

Hold the play button to open **Slideshow**, then choose **Start slideshow**.
It plays full-size previews in the current grid order, including filters and color sorting.
The filename and capture date identify each photo, and a progress bar shows the time
remaining before the next image. Pause or play, step with the arrow buttons, select a
nearby thumbnail, or enter a photo number to jump. Choose 2, 4, or 8 seconds per photo
and turn on Loop to repeat the set.
From the photo area, Left and Right step through the photos and Space pauses or plays.
Close the slideshow or press Escape to return to the grid.

Hold the four-square button to open **Pixel art** (or use Enter/Space). Choose Pixel
art to transform the whole grid, set pixel size from 2–16 px, and choose an adaptive
palette of 8, 16, or 32 colors per image. Original turns off the pixel layer. The
control shares the other tools' hold ring, spring, floating frame, and themes.
Settings are remembered locally and synchronized between Entity windows.

Pixel art is a reversible grid-only display effect. It follows all filters and
color sorting; palettes, metadata, and source files stay original.
Images are converted as they approach the viewport, with bounded concurrent work
and one cached pixel thumbnail per photo. Three.js hover keeps the pixel edges crisp.

Hold the angled-frame button to open **Syd Mead**. Turn it On, adjust Strength and
Linework, and choose Daylight or Neon. The local, procedural treatment restyles the
photo's existing shapes with broad painted forms, six-step pigment palettes,
deep cool shadows, warm highlights, directional ink contours, and glowing rim
lighting. Neon adds magenta accents and subtle highlight streaks. Two smoothing
passes suppress photographic texture; stronger contrast and restrained hatching
give the grid a more illustrated finish. Its visual reference is
[Mead's gouache concept work](https://whitney.org/exhibitions/dreamlands/art?section=48).
The default is Off; enabled defaults are 80% Strength, 45% Linework, and Daylight.

Hold the pen-nib button to open **Moebius**, the Jean Giraud-inspired grid effect.
Turn it On, adjust Strength and Linework, and choose Desert or Cosmic. It combines
fine ink contours, flat pastel washes, sparse hatching, and a light paper texture.
Desert uses warm sand, coral, sage, and pale blue; Cosmic shifts toward pink,
lavender, and turquoise. Defaults: Off, 85% Strength, 65% Linework, Desert.

All three effects can be layered: Syd Mead runs first, then Moebius, then Pixel
art. Active controls show that order. Each control turns off only its own layer;
turn all effects off to restore the photographs. All filters and hover keep the
selected treatments.
Settings persist locally and synchronize between Entity windows. The painting
pass runs in a background worker, with a local fallback when workers are unavailable.
Syd Mead also applies to the full-size detail image, using the same current
settings at the preview's native resolution. Changing photos cancels the previous
render; switching the effect off or setting Strength to zero restores the original
preview. Open detail views also follow settings changed in another Entity window.
Moebius and Pixel art stay grid-only. Original files, color cards, and metadata remain
unchanged; no photos are uploaded.

Moments are suggested groups from metadata, calculated locally. A group can span
up to eight hours, with no more than two hours between consecutive photos and GPS
positions within five kilometres of its first located photo. When GPS is missing,
matching saved place labels can be used. Photos with neither coordinates nor a
place group only with other unlocated photos within 30 minutes; they are labeled
Location unavailable. Photos without a usable capture time remain individual
moments. Every eligible photo belongs to one group, including single-photo moments.
Recorded camera times are used without browser timezone conversion.

Places are generated locally from saved original-file metadata with ExifTool's
bundled [GeoNames](https://www.geonames.org/) database
([CC BY](https://creativecommons.org/licenses/by/4.0/)). GPS coordinates are matched
to the nearest town/city within 100 km and labeled as areas, not municipal boundaries
or exact addresses. More distant coordinates retain a rounded geographic-area label;
written city metadata is used when GPS is missing. Original metadata is unchanged.
`npm run build:locations` refreshes place labels and signed coordinates in the existing grid index;
`npm run build:grid` includes this step automatically. No photo locations are sent
to an external geocoding service.

Hold the three-color button in the control group to open Theme. Choose Light,
Dark, or Blue to change the title card, controls, and detail panels. Blue is the
default, and the selected mode is saved locally and shared across open grid tabs.
The theme control uses the same spring, hold ring, and drag behavior as the other controls.

After the grid entrance, the Geist Serif title assembles diagonally as shallow
3D letter fragments. Move the pointer over the title to gently lift and tilt
nearby pieces. The locally bundled Three.js renderer uses one draw for the
lettering and stops drawing when it settles or leaves the viewport. Full motion
is enabled explicitly on this title with `data-motion="full"`. Remove that
attribute to follow Reduce Motion with a stepped reveal and no pointer tilt. If WebGL is
unavailable or loses its context, the tiled HTML title takes over.

Run `npm run build:grid` to refresh the grid from the Desktop folder recorded in
`media/import-manifest.json`. The importer reads top-level still images, reuses
matching previews by file hash, and creates thumbnails in `media/grid/`. The grid
shows retained images with capture dates from January 2022 through December 2026 in capture order.

Both builders screen original still images for readable text with macOS Vision.
Signs, clothing, product labels, and other text in a photograph count. A second
pass checks overlapping crops of images with no whole-frame detection. Measurements
are cached locally by file hash in `media/text-scan/`. The filtered indexes and
sphere atlases are generated separately from the originals.

Selecting a photo opens three independently scrollable columns in either view. The photo fills column A, sampled color cards with hex values fill B, and column C shows the metadata on Entity blue. On narrow screens use Image, Colors, and Metadata to move between columns. Both build commands
read the original files with ExifTool and write individual records under
`media/image-metadata/`. The viewer loads the selected record on demand.
Imported photos also show their ImageIO properties, archive record, and indexed
preview palette when available.

Lighting comparisons use the same sphere and interactions:

- `/?light=moonlight` shows the media as stars in diffuse rose and blue gas. Each reload generates a new arrangement of clouds, folds, and dust lanes.
- `/?light=ember`: warm amber illumination and copper haze.
- `/?light=aurora`: violet rim light with a cool teal core.

The supplied nebula photograph, credited to Miguel Claro in the image, is stored in `assets/nebula/moonlight-reference.png`. Moonlight samples its color and brightness into a 3D gas volume. The depth is an artistic interpretation of the photograph.

Lighting fades as you approach individual media. No interface controls are added.

- Drag to rotate; scroll or pinch to move into the sphere.
- Blue nodes mark media captured in 2022; selecting a node opens its media.
- Select a media particle to view its image or play its video. Tap opened media to return.
- Gentle initial rotation stops when you interact.
- Keyboard: arrows rotate, +/- zoom, Enter opens a particle near the center, Home resets, Escape closes media; Space pauses/resumes video.

The sphere includes retained still images and all video files, including Live Photo companions. Original files remain untouched. Image viewing uses generated JPEG previews; original video playback depends on the browser's codec support.

The renderer is `app/sphere.js`. It reuses the six generated image atlases in `media/cube/` to keep texture memory bounded; those filenames describe the earlier packing pipeline, not the current geometry. Higher-resolution previews load near the camera. Three.js is bundled locally under `app/vendor/` with its license; no CDN is used.

Earlier dashboard and cube source is kept in `archive/iteration-01/` and `archive/iteration-02/`; it is not loaded or served.

## Rebuild media atlases

```sh
npm run build:cube
```

Uses the existing local catalog and previews. The atlases and index are excluded from Git, along with original media and other derived assets.

## Checks

```sh
npm run check
node scripts/qa-entry.mjs
node scripts/qa-sphere.mjs
node scripts/qa-grid.mjs
node scripts/qa-title.mjs
node scripts/qa-theme.mjs
node scripts/qa-grid-hover.mjs
node scripts/qa-location.mjs
node scripts/qa-time.mjs
node scripts/qa-moments.mjs
node scripts/qa-moments-control.mjs
node scripts/qa-slideshow.mjs
node scripts/qa-pixel-art.mjs
node scripts/qa-mead.mjs
node scripts/qa-mead-detail.mjs
node scripts/qa-moebius.mjs
node scripts/qa-workspace.mjs
python3 scripts/qa-locations.py
```

Browser checks require a running local server and Chrome in its standard macOS location. They cover desktop/mobile layout, rotation, zoom, media selection, playback, pinch gestures, and reduced motion. Physical-device touch and every source video codec are not covered.

To preserve an intermittent error, leave the affected Entity tab selected and capture
its current rendered page before refreshing:

```sh
osascript scripts/capture-entity-state.applescript /Users/ecariss/Documents/ChatGPT/entity/.qa/entity-error.mhtml
```

The destination directory must exist. Chrome saves this local archive asynchronously;
wait for the file to finish writing before inspecting it. The archive includes the
rendered HTML, loaded styles, and loaded images. It does not include the console
history or live WebGL/canvas pixels. It neither reloads the tab nor changes browser
permissions. Keep captures local because they contain personal media.
