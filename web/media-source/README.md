# Wordless EcoScan hero

The current hero is `public/media/ecoscan-wordless.mp4`: 20 seconds, 1200×800, 60fps, silent H.264. It contains no captions, words, numbers, logos, or app screenshots.

Visual story:
- Floating T-shirt, jeans, jacket and shoes enter a scan frame.
- Garments align; confirmation marks and different-sized cloud shapes suggest recognition and estimated production impact.
- The T-shirt remains inside moving circular arrows, suggesting another wear.
- Leaf tokens flow toward a pink gift, representing illustrative rewards.
- Garments return to the opening arrangement for a loop.

Clouds and leaves are conceptual imagery, not measured emissions. All factual explanation and caveats stay in HTML outside the video, including the screen-reader description.

## Assets and rendering
`wordless-assets.png` is an original six-object sheet generated with the built-in image-generation tool, then refined by the same tool for transparent padding. No stock clothing footage is used.
`render_wordless.py` composites the assets frame-by-frame with smooth quintic interpolation, periodic bobbing, moving scan lines, reuse arrows, leaf trajectories and petals. The script never renders text.
`ecoscan-wordless-poster.jpg` is the reduced-motion / loading still.

Rebuild:
```powershell
pip install pillow imageio-ffmpeg
python web/media-source/render_wordless.py
```
Or pass `--ffmpeg C:/path/to/ffmpeg.exe`.
These are authoring dependencies only, not website dependencies.

Generation prompt:
Create a premium 3D product asset sheet with a truly transparent background. Exactly SIX isolated objects in a precise 3-column by 2-row grid, each object fully inside its own equal cell with generous transparent padding. Top row left: a plain warm ivory cotton T-shirt front view with realistic soft folds, no hanger. Top row middle: a pair of muted blue denim jeans front view. Top row right: a sage green casual jacket front view. Bottom row left: a pair of cream and pale blush sneakers at three-quarter angle. Bottom row middle: a pale baby-pink gift box with elegant dark sage ribbon and bow at three-quarter angle. Bottom row right: a sculptural sage green leaf-shaped token medallion, no writing. All six share soft studio lighting, tactile realistic material, rounded refined 3D forms, subtle attached shadows only. Each item isolated, no overlaps between cells, no scene, no floor, no people, no labels, no letters, no numbers, no logos, no watermarks. Landscape sheet. Assets for a smooth wordless clothing sustainability motion film.

Refinement prompt:
Edit this asset sheet for actual animation compositing. Preserve the six object identities and their order in a 3-column by 2-row grid. Make EVERY object 25% smaller within its cell, with at least 60 pixels of fully transparent padding around every object. Remove ALL background haze, gradients, ground surfaces, glow, and cast shadows. Transparent empty pixels around clean object cutouts. ONLY six isolated objects. Top left shirt, top middle jeans, top right jacket, bottom left shoes, bottom middle gift, bottom right leaf token. Keep tactile materials and natural lighting on objects themselves. No words or numbers. Each object must fit entirely within its own 512 by512 cell in a1536 by1024 canvas.

Earlier story film and source artwork are retained but no longer used by the hero.
