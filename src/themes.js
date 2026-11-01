// Each theme is a store "template": 3D scene look + UI look (CSS vars live in style.css).
export const THEMES = {
  boutique: {
    name: 'Boutique', logo: 'The Rack', tagline: 'Slow fashion, hung with care.',
    bg: 0xe6e3dd, wall: 0xdcd9d2, floor: 0xb4b0a7, rail: 0xb8944f, wood: 0xb78a58, metal: 0xc9ccd0,
    env: 0.45, key: 2.3, sign: '#6b4f1d', signGlow: false, ui: 'light',
  },
  street: {
    name: 'Streetwear', logo: 'RACK//DROP', tagline: 'Limited drops. Heavy fabric.',
    bg: 0x0b0b0d, wall: 0x2a2a31, floor: 0x141417, rail: 0x9a9aa4, wood: 0x26262a, metal: 0xb4b4be,
    env: 0.3, key: 2.8, sign: '#c6ff3d', signGlow: true, ui: 'dark',
  },
  pastel: {
    name: 'Pastel Studio', logo: 'softwear', tagline: 'Cozy colours for easy days.',
    bg: 0xfde7ee, wall: 0xf7d9e3, floor: 0xeab8cc, rail: 0xb9a6ff, wood: 0xf6efe9, metal: 0xd9d4ff,
    env: 0.6, key: 2.3, sign: '#7a5cff', signGlow: false, ui: 'light',
  },
};
