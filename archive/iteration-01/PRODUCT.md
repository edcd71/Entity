# entity

## Purpose
A local workspace for exploring imported iPhone media through the metadata embedded in the original files. This first iteration is intended for review and course correction.

## Platform and stack
Local web application on this Mac. Buildless HTML, CSS, and JavaScript with a Node.js loopback server. Metadata and previews are derived locally; originals are preserved.

## Confirmed requirements
- Product header: `entity`, lowercase, in the supplied Geist Serif.
- Use rail 04 from the supplied Kiln Jazz archive player as the primary navigation.
- Use the imported iPhone_entity collection and build tools around its metadata.
- Preserve original files and distinguish embedded facts from unknown data.

## First iteration scope
Library, timeline with a rotating 3D cube for chronological month navigation, GPS coordinate plot, saved selections, archive inventory, metadata inspector, full preview, Live Photo playback where supported by the browser, and JSON exports. Navigation labels and structure are provisional implementation decisions for this first pass.

## Boundaries
No fabricated locations or capture dates. Dates without a time-zone offset remain without one. Original camera media, GPS coordinates, and metadata stay local. Saved selections use browser storage. Apple Photos albums, people labels, and edit history are not inferred from files. Generated previews do not apply AAE edits.

## Accepted iteration changes

- A column: rail 04 navigation. B column: centered chronological cube and media. C column: persistent desktop tools and inspector.
- Palette selection sorts media by a hex target; optional user-supplied Pantone reference labels can be saved with swatches.
- Color control pad uses a movable magnifier loupe and a hue slider. Preview-derived colors are separate from embedded camera metadata. Official Pantone code conversion is not implemented in this iteration.
