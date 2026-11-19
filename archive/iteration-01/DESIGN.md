---
name: entity
description: Local media exploration through capture metadata and preview color.
colors:
  primary: "#697c54"
  accent-soft: "#e7ebdf"
  background: "#f6f6f0"
  surface: "#fcfcf8"
  ink: "#31382e"
  muted: "#697060"
  separator: "#dddfd4"
  rail: "rgba(247,251,245,.68)"
  dark-background: "#171a17"
  dark-surface: "#20241e"
  dark-ink: "#e5e8dd"
  dark-muted: "#a0a796"
  dark-separator: "#343c30"
  dark-primary: "#b7c99e"
  dark-accent-soft: "#313b29"
  dark-rail: "rgba(8,9,10,.52)"
typography:
  display:
    fontFamily: '"Geist Serif", Georgia, serif'
    fontSize: "49px"
    lineHeight: 1
    letterSpacing: "-2.5px"
  headline:
    fontFamily: '"Geist Serif", Georgia, serif'
    fontSize: "44px"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-1.5px"
  body:
    fontFamily: '"Geist Serif", Georgia, serif'
    fontSize: "15px"
  metadata:
    fontFamily: '"Geist Mono", monospace'
    fontSize: "10px"
    fontWeight: 400
    letterSpacing: ".04em"
rounded:
  swatch: "2px"
  chip: "3px"
  control: "4px"
  button: "5px"
  shell: "8px"
spacing:
  compact: "8px"
  grid-column: "16px"
  panel: "18px"
  section: "24px"
  desktop-gutter: "36px"
components:
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "10px 22px"
  button-text:
    textColor: "{colors.muted}"
    padding: "3px 0"
  navigation:
    backgroundColor: "{colors.rail}"
    rounded: "{rounded.shell}"
    width: "54px"
    padding: "18px 0 7px"
  navigation-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
  tools:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.shell}"
    width: "292px"
    padding: "20px 18px"
  swatch-reference:
    rounded: "{rounded.chip}"
---

# Design System: entity

## Overview

The implemented first iteration combines a compact source-derived navigation rail, a centered chronological media workspace, and persistent desktop tools. Real imported photographs carry the visual emphasis; serif controls and monospaced metadata keep navigation and file facts distinguishable.

This documents the current ivory/olive implementation and confirmed user choices. No brand metaphor has been selected; navigation names and order remain provisional.

**Key Characteristics:**
- Source rail 04 interactions and Stoneware glyphs.
- A / B / C workspace with a stable centered cube.
- Local fonts, actual media, explicit data provenance.

## Colors

### Primary
Muted olive marks selection, focus, and active controls; its soft companion supplies hover and selected surfaces. Dark mode uses a lighter olive with a deeper selected surface. Color values in the frontmatter follow the actual CSS, including the corrected light muted text.

### Neutral
Ivory background and surface separate the canvas from tools. Green-gray ink, muted text, and separators support file information. The rail has its own translucent light/dark fill. Sampled media colors and the hue spectrum are data/control content, not additional brand accents.

## Typography

**Display Font / Body Font:** Geist Serif, Georgia, serif. **Label/Mono Font:** Geist Mono, monospace. Local declarations: `assets/fonts/fonts.css`; the wordmark uses `GeistSerif-Regular.woff2`. Interface labels and controls retain the serif; metadata values, counts, annotations, and timecodes use mono.

The frontmatter records the desktop wordmark, main heading, body, and metadata roles. On small screens the wordmark reduces to 42px and the main heading to 34px. Tools headings use 29px; the current cube month uses 28px, reducing to 25px on mobile. Most headings use regular weight.

## Layout

A holds primary rail navigation; B holds the centered chronological cube and media; C holds tools and the inspector. Desktop B reserves 350px at the right whether or not a media item is selected. C remains present at 292px wide, 24px from the right, with independently scrolling content. The header is 120px tall with 36px side gutters.

At 960px and below, C becomes a Tools drawer and B releases its reserved right margin. At 640px and below, the header is 96px, the icon rail is 46px, and B begins 82px from the left. Navigation remains reachable when collapsed. The default media grid has four columns, three at 1200px and below, and two at 640px and below; the larger-density option uses three, two, and one respectively. Gaps are 25px vertically and 16px horizontally on desktop, 21px and 10px on mobile.

The cube is 205px square on desktop and 165px on mobile. Its center follows B, not the total window. Square-to-portrait thumbnails use minimal framing, with a desktop aspect ratio of 1 / 1.12 and mobile ratio of 1 / 1.2.

## Elevation & Depth

Depth is local to floating controls and the chronological cube. The rail combines a 10px backdrop blur with the shared shadow (`0 8px 18px rgba(0,0,0,.14)`). Flyouts use `0 8px 25px #00000012`; desktop tools use a very faint `0 6px 22px #00000004`; the mobile drawer uses `0 10px 80px #0003`. The cube uses perspective, side-face brightness, and a blurred ground shadow. The loupe uses a shadow and surface-colored rim to stay legible over sampled colors.

## Shapes

Small radii distinguish controls from floating shells: swatches and chips stay compact; buttons and media frames have gently rounded corners; rail, flyouts, and tools use the shell radius. Loupe, pad cursor, and saved toggles are circular. Use thin separators and borders, with a stronger accent outline for selected media.

## Components

### Buttons
Outline actions use the surface fill, separator border, and soft accent hover. Text actions use muted ink and darken on hover. Icon buttons use a compact square hit area. Focus uses a 2px accent outline with 4px offset; disabled buttons have .35 opacity.

### Chips
Saved color references pair a sampled square with hex or user label and a separate remove button. A thin separator border and compact chip radius contain long labels with ellipsis.

### Cards / Containers
Media cards expose actual previews with filename and metadata beneath. Hover enlarges the image to 1.035; selection outlines its frame in accent. The inspector belongs inside C on desktop and inside its drawer on narrow screens. Full preview contains the media without cropping.

### Inputs / Fields
Search, selectors, hex, and reference fields use restrained underline separators and transparent fills. Hex values use mono; invalid hex reveals an explicit error message. Hue and distance controls retain accessible names. Do not treat a missing index as a successful color match.

### Navigation
Adapt rail 04 (Icon actions) from `/Users/ecariss/Desktop/Pottery/kiln-jazz-archive-player.html`. Preserve its Stoneware glyphs, compact vertical shell, sparrow label toggle, caret collapse, right-side option flyouts, pointer color shader, drag handle, and elastic active selection. Desktop icon width is 54px; label mode expands to 86px (76px on mobile). Current destinations are Library, Timeline, Places, Saved, and Archive; these names and order are first-pass implementation choices, not confirmed user taxonomy.

### Chronological cube
Timeline opens first. Adjacent capture months occupy rotating side faces; the selected month controls the media grid. Support drag, arrow buttons, keyboard arrows/Home/End, and month selection, with explicit undated media. Rotation uses a .75s eased transition; rail sizing uses .42s elastic easing. Reduced-motion preference removes transitions and animations.

### Color pad and palette sorting
C contains a saturation/brightness pad, magnifying pixel loupe, hue slider, editable hex, collection swatches, sampled file palettes, saved references, and a color-distance slider. Drag previews a color; release commits sorting. Arrow keys adjust the pad, with Shift for larger steps. Preview palettes rank using CIE Lab distance (Delta E 76); video palettes describe the generated first frame. Optional user-supplied Pantone labels are references only: no official library, matching, or code conversion is implemented.

## Do's and Don'ts

### Do:
- Do display entity in lowercase using the supplied Geist Serif.
- Do preserve source rail 04 glyphs, label toggle, collapse control, flyouts, drag handle, color shader, and active selection.
- Do keep the cube centered in B when inspecting media in C.
- Do provide keyboard controls, accessible names in icon mode, visible focus, and reduced motion.
- Do distinguish embedded metadata, missing data, and preview-derived color.

### Don't:
- Don't replace the source rail with a generic sidebar.
- Don't invent capture dates, locations, or decorative generated media.
- Don't present user-supplied Pantone references as official matches.
- Don't change originals or imply generated previews apply AAE edits.

Source of truth: `app/styles.css`, `app/colors.js`, `app/chronology.js`, and `assets/fonts/fonts.css`; confirmed constraints from `PRODUCT.md`, the prior design decisions, and `.qa/review-brief.md`. Imported originals remain in `media/originals/iphone-entity/`; `media/import-manifest.json` records verified hashes and provenance.
