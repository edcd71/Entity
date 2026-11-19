# entity

A single, diffuse sphere of media particles floats in the center of a black screen. The archive filters still images with detected text and includes videos and Live Photo companions. The sphere replaces the cube at the user's request. An upper-left title and a short paragraph introduce the camera roll and explain how to explore it. The sphere fills the available viewport on desktop and mobile.

The sphere rotates slowly until the first interaction. Drag to rotate, scroll or pinch to move into the cloud, and select a media particle to view its image or play its video. Soft fragments resolve into sharper photographs as they approach the camera. Tap opened media or press Escape to return. Space toggles video playback; arrow keys change media.

Keyboard navigation on the sphere: arrows rotate, plus/minus zoom, Enter opens a media particle near the center, and Home resets the view. Reduced-motion preferences disable idle rotation. Loading/error announcements are available to screen readers only.

Originals stay local and untouched. HEIC files use generated JPEG previews; videos play from their original files where the browser supports the codec. Selecting an image opens its original-file metadata in both the photo grid and the sphere.

Runtime: local Node server, Three.js with OrbitControls, six reused image atlases, instanced translucent media fragments, faint satellite grains, and a bounded cache of sharper previews. No hosted deployment.

Blue nodes flag displayed media captured in 2022. Each node stays attached to its media particle and opens the same image or video when selected. This uses the recorded capture date, not the import date or filename.

Three atmospheric lighting treatments are available: Moonlight (default), Ember, and Aurora, selected with the `light` query parameter. Soft bloom, colored rim illumination, and a diffuse halo add depth to the overview, then fade as the camera moves closer. The media viewer remains unaffected.
