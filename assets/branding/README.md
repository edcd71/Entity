# Entity launcher mark

The uppercase **E** is outlined directly from `assets/fonts/GeistSerif-Regular.ttf`,
the same Geist Serif Regular used by the Entity title. White lettering sits on
Entity blue (`#2047df`), with the title's `.14em` tile spacing and `.012em` seams.
The rounded blue field has a transparent outer margin for the macOS Desktop and Dock.

- `entity-icon.svg`: standalone, editable vector artwork; no installed font required.
- `entity-icon.png`: transparent 1024 px master.
- `entity-icon-preview.png`: 256 px preview.
- `entity.icns`: macOS launcher icon, including 16–1024 px representations.
- `Entity.iconset/`: source PNG representations. At 16 and 32 px the seams are omitted to preserve the serif silhouette.

Rebuild with `npm run build:launcher-icon` on macOS. The Swift generator uses
CoreText and CoreGraphics to preserve the actual font outline. The TTF was copied
from the user's Geist Serif font folder; the existing font licenses are in `assets/fonts/`.
Apply to the installed Desktop app with `npm run apply:launcher-icon`. This backs
up the original launcher in `.entity-runtime/Entity-before-icon.app`, updates the
icon, signs the bundle, and refreshes its Launch Services registration. New launchers
created by `npm run install:launcher` also include this icon.
