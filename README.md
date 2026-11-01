# The Rack — 3D clothing-rack store (Three.js)

Run: `python3 -m http.server 8123` then open http://localhost:8123 (any static server works; no build step).

- Templates: Boutique / Streetwear / Pastel Studio (header dropdown or `?theme=street`). Edit `src/themes.js` + the `[data-theme]` blocks in `style.css`.
- Products: `src/data.js`. Backend hooks (`getProducts`, `placeOrder`): `src/api.js` — swap for Shopify Storefront API / Stripe.
- Garment shapes, fabric details and the print engine: `src/garments.js`.
- Controls: cursor to the screen edges slides the rail, hover pulls a piece out, click opens it. Drag/scroll/arrow keys also work. `/` focuses search.

## 3D garment models (Blender)
`blender/` holds the generator that makes every garment: flat sewing pattern -> cloth drape on a hanger -> thickness -> hood and drawstrings -> bones and weights -> `models/<style>.glb`.
Run it with Blender's Python (`pip install bpy` or `blender -b -P blender/make_garments.py -- <style>`). Styles live in `blender/styles.py` (chest, length, sleeve length/angle, neck, stiffness...).
Styles: tee_classic, tee_boxy, tee_long, sweat_crew, sweat_oversized, hoodie_pullover, hoodie_oversized. A product picks one with `style` (see `src/data.js`); the "Add product" form has a 3D model picker.
Bones driven in `src/model.js` (`drive()`): spine1-3, sleeveL1/2, sleeveR1/2, hood1/2.
