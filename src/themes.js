// Each theme is a store "template": 3D scene look + UI look (CSS vars live in style.css).
export const THEMES = {
  boutique: {
    name: 'Boutique', logo: 'The Rack', tagline: 'Slow fashion, hung with care.',
    bg: 0xefe9df, wall: 0xe7dfd1, floor: 0xcdbfa8, rail: 0xb8944f, hanger: 0xb8944f, hangerMetal: false,
    env: 0.6, key: 1.7, sign: '#6b4f1d', signGlow: false, ui: 'light',
  },
  street: {
    name: 'Streetwear', logo: 'RACK//DROP', tagline: 'Limited drops. Heavy fabric.',
    bg: 0x0b0b0d, wall: 0x15151a, floor: 0x09090b, rail: 0x9a9aa4, hanger: 0xb4b4be, hangerMetal: true,
    env: 0.3, key: 2.2, sign: '#c6ff3d', signGlow: true, ui: 'dark',
  },
  pastel: {
    name: 'Pastel Studio', logo: 'softwear', tagline: 'Cozy colours for easy days.',
    bg: 0xfde7ee, wall: 0xfbd6e2, floor: 0xf2c1d3, rail: 0xb9a6ff, hanger: 0x8f78ff, hangerMetal: false,
    env: 0.7, key: 1.6, sign: '#7a5cff', signGlow: false, ui: 'light',
  },
};
