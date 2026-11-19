---
name: entity
description: A floating media cube on black.
colors:
  background: "#000000"
  foreground: "#eeeeee"
  muted: "#999999"
typography:
  body:
    fontFamily: '"Geist Serif", Georgia, serif'
    fontSize: "12px"
  metadata:
    fontFamily: '"Geist Mono", monospace'
    fontSize: "10px"
---

# entity

## Overview

The user's correction is the visual authority: one floating 3D cube centered on a black screen. Keep it simple. The prior A/B/C dashboard, navigation rail, chronology controls, palette tools, headings, and photo grid are retired.

## Colors

Pure black canvas. Actual media supplies color. Quiet neutral text for the initial interaction hint and selected filename.

## Typography

Retain local Geist Serif and Geist Mono. No large headings or decorative copy.

## Layout

The cube is centered in the full viewport and scales to fit its narrower dimension. Six tiled faces contain every image and video. The cube has no visible interface elements, including loading text, hints, hover labels, reset buttons, tile highlights, or video badges. The full-screen viewer displays only the selected media; tapping returns to the cube. Keyboard navigation and screen-reader descriptions remain available.

## Components

- Three.js cube: slow initial rotation, stopped by any manipulation; reduced motion respected.
- Drag to orbit. Wheel or pinch to zoom. Sharper image tiles load near the camera. Select to open media.
- Viewer: image preview or video without visible controls. Tap or Escape returns to the cube; Space toggles video playback; arrow keys change media.
- Keyboard: arrows orbit, plus/minus zoom, Enter opens the central tile, Home resets.

## Do's and Don'ts

- Keep all originals and generated media local.
- Keep the cube as the sole visual focus.
- Do not restore the dashboard, rails, tool panels, or month buckets without a new request.
