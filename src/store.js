// Products you add are kept in this browser (IndexedDB). Swap for a real backend (Supabase, Shopify) to share them.
const DB = 'rack-store', TABLE = 'products';
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(TABLE, { keyPath: 'id' });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const run = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const tx = db.transaction(TABLE, mode), out = fn(tx.objectStore(TABLE)); tx.oncomplete = () => res(out.result); tx.onerror = () => rej(tx.error); }); };
export async function loadUserProducts() { try { return (await run('readonly', s => s.getAll())) || []; } catch { return []; } }
export async function saveUserProduct(p) { try { await run('readwrite', s => s.put(p)); return true; } catch { return false; } }
export async function deleteUserProduct(id) { try { await run('readwrite', s => s.delete(id)); } catch { /* ignore */ } }
