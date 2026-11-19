# entity

The current product is a single, full-screen media cube on black. All 1,300 imported images and 1,191 videos are represented across its six faces, including Live Photo video companions. The user explicitly replaced the earlier dashboard with this simple interaction.

The cube is centered and rotates slowly until the first interaction. Drag to rotate, scroll or pinch to zoom, and select a tile to view the image or play the video. Arrow keys rotate; plus/minus zoom; Enter opens the center tile; Home resets. Reduced-motion preferences stop the initial rotation.

Originals stay local and untouched. HEIC files use generated JPEG previews; videos play from their original files where the browser supports the codec. File metadata and the ingestion pipeline remain available in the project, but are not part of the visible interface.

Runtime: local Node server, Three.js with OrbitControls, six generated overview textures, and a bounded set of higher-resolution tiles as the camera moves close. No hosted deployment.

The latest refinement removes all visible interface elements. Only the cube appears on the black canvas. Opened media fills the screen without controls; tap or Escape returns to the cube. Space toggles video playback. Loading/error announcements remain available to screen readers only.
