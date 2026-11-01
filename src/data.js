// Seed catalogue: your real shirts. Add more from the "Add product" button on the rack (stored in this browser).
export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
export const CUSTOM_FEE = 12;
export const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'tee', label: 'Shirts' },
  { id: 'sweat', label: 'Sweatshirts' },
  { id: 'hoodie', label: 'Hoodies' },
];
// Blender-made 3D garment styles per product type (models/<id>.glb)
export const STYLE_OPTIONS = {
  tee: [{ id: 'tee_classic', label: 'Classic tee' }, { id: 'tee_boxy', label: 'Boxy oversized tee' }, { id: 'tee_long', label: 'Long-sleeve tee' }],
  sweat: [{ id: 'sweat_crew', label: 'Crewneck' }, { id: 'sweat_oversized', label: 'Oversized' }],
  hoodie: [{ id: 'hoodie_pullover', label: 'Pullover hoodie' }, { id: 'hoodie_oversized', label: 'Oversized hoodie' }],
};
export const DEFAULT_STYLE = { tee: 'tee_classic', sweat: 'sweat_crew', hoodie: 'hoodie_pullover' };
export const TYPE_LABEL = { tee: 'Shirt', sweat: 'Sweatshirt', hoodie: 'Hoodie' };

export const PRODUCTS = [
  { id: 'snowflake-maroon', type: 'sweat', style: 'sweat_oversized', name: 'Snowflake Wreath Sweatshirt', price: 52, photo: 'assets/snowflake-maroon.webp',
    fabric: 'Unisex heavy-blend crewneck, soft fleece inside',
    blurb: 'A delicate wreath of embroidered-look snowflakes on a deep winter maroon. Quiet, cosy and giftable.' },
  { id: 'tree-heliconia', type: 'sweat', style: 'sweat_crew', name: 'Patchwork Christmas Tree Sweatshirt', price: 56, photo: 'assets/tree-heliconia.webp',
    fabric: 'Unisex heavy-blend crewneck, soft fleece inside',
    blurb: 'A plaid patchwork tree with pink coquette bows and a gold star. The loud, cheerful one.' },
  { id: 'tree-sand', type: 'sweat', style: 'sweat_crew', name: 'Patchwork Christmas Tree Sweatshirt (Sand)', price: 56, photo: 'assets/tree-sand.webp',
    fabric: 'Unisex heavy-blend crewneck, soft fleece inside',
    blurb: 'The plaid patchwork tree with pink bows on a neutral sand base that lets the print do the talking.' },
  { id: 'tree-lightpink', type: 'sweat', style: 'sweat_oversized', name: 'Patchwork Christmas Tree Sweatshirt (Pink)', price: 56, photo: 'assets/tree-lightpink.webp',
    fabric: 'Unisex heavy-blend crewneck, soft fleece inside',
    blurb: 'Soft pink base, plaid tree, little pink bows. The most coquette of the three.' },
  { id: 'tee-raccoon', type: 'tee', style: 'tee_boxy', name: 'Who Woke Me Up Tee', price: 38, photo: 'assets/tee-raccoon.webp',
    fabric: 'Garment-dyed heavyweight cotton tee',
    blurb: 'One very angry raccoon and a very fair question. Oversized, washed-in comfort fit.' },
];

// Fabric colours offered on every product. `hex: null` = the photographed colour.
export const GARMENT_COLORS = [
  { name: 'Original', hex: null },
  { name: 'Ivory', hex: '#efebe1' }, { name: 'Black', hex: '#1b1b1f' }, { name: 'Charcoal', hex: '#44464e' },
  { name: 'Navy', hex: '#203358' }, { name: 'Royal', hex: '#2f5fb0' }, { name: 'Sky', hex: '#8ec5e8' },
  { name: 'Forest', hex: '#2f5d46' }, { name: 'Olive', hex: '#6d7143' }, { name: 'Sand', hex: '#d2bf9b' },
  { name: 'Mustard', hex: '#d9a62e' }, { name: 'Orange', hex: '#d9783a' }, { name: 'Red', hex: '#b3322d' },
  { name: 'Maroon', hex: '#5f2937' }, { name: 'Hot pink', hex: '#e86278' }, { name: 'Pink', hex: '#f0c3d3' },
  { name: 'Lilac', hex: '#a99be0' }, { name: 'Grey', hex: '#8b8d93' },
];
export const MOCKUP_COLORS = ['Ivory', 'Black', 'Navy', 'Forest', 'Sand', 'Pink'];

export const FONTS = {
  impact: { label: 'Bold', css: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif' },
  serif: { label: 'Serif', css: 'Georgia, "Times New Roman", serif' },
  sans: { label: 'Clean', css: '"Helvetica Neue", Arial, sans-serif' },
  mono: { label: 'Mono', css: '"Courier New", monospace' },
  script: { label: 'Script', css: '"Brush Script MT", "Segoe Script", cursive' },
};
export const PRINT_COLORS = ['#f2efe8', '#18181b', '#c6ff3d', '#ff5d8f', '#ffb703', '#2f6bff', '#e63946'];

// Placement presets as fractions of the garment photo (u across, v down, w = print width).
export const PLACEMENTS = {
  front: [
    { id: 'chest', label: 'Chest', u: 0.5, v: 0.4, w: 0.3 },
    { id: 'left', label: 'Left chest', u: 0.64, v: 0.28, w: 0.13 },
    { id: 'large', label: 'Large front', u: 0.5, v: 0.5, w: 0.5 },
    { id: 'hem', label: 'Lower', u: 0.5, v: 0.72, w: 0.26 },
  ],
  back: [
    { id: 'upper', label: 'Upper back', u: 0.5, v: 0.34, w: 0.4 },
    { id: 'full', label: 'Full back', u: 0.5, v: 0.5, w: 0.56 },
    { id: 'nape', label: 'Nape', u: 0.5, v: 0.13, w: 0.14 },
  ],
};
