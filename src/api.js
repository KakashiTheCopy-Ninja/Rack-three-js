// Thin data layer. Replace the bodies with fetch() calls to Shopify Storefront API, Stripe, etc.
import { PRODUCTS } from './data.js';

export async function getProducts() { return PRODUCTS; }

export async function placeOrder(order) {
  await new Promise(r => setTimeout(r, 900)); // pretend network
  return { id: 'RK-' + Math.random().toString(36).slice(2, 8).toUpperCase(), ...order };
}
