const DB_NAME = "jarvis-secure-store";
const STORE = "secrets";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function txRequest(db, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.onabort = () => reject(tx.error);
  });
}
function toBytes(value) { return new TextEncoder().encode(value); }
function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
async function getUserKey(db, userId) {
  const id = "crypto-key:" + userId;
  let key = await txRequest(db, "readonly", store => store.get(id));
  if (!key) {
    key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await txRequest(db, "readwrite", store => store.put(key, id));
  }
  return key;
}
export async function saveProviderKey(userId, provider, secret) {
  if (!globalThis.crypto?.subtle || !globalThis.indexedDB) throw new Error("This browser does not support encrypted local key storage.");
  const db = await openDb();
  try {
    const key = await getUserKey(db, userId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, toBytes(secret));
    await txRequest(db, "readwrite", store => store.put({
      iv: toBase64(iv), cipher: toBase64(new Uint8Array(cipher)), updatedAt: new Date().toISOString()
    }, "provider:" + userId + ":" + provider));
  } finally { db.close(); }
}
export async function loadProviderKeys(userId) {
  if (!globalThis.crypto?.subtle || !globalThis.indexedDB) return {};
  const db = await openDb();
  try {
    const key = await txRequest(db, "readonly", store => store.get("crypto-key:" + userId));
    if (!key) return {};
    const all = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const rows = {};
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve(rows);
        const prefix = "provider:" + userId + ":";
        if (String(cursor.key).startsWith(prefix)) rows[String(cursor.key).slice(prefix.length)] = cursor.value;
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
    const result = {};
    for (const [provider, item] of Object.entries(all)) {
      try {
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(item.iv) }, key, fromBase64(item.cipher));
        result[provider] = new TextDecoder().decode(plain);
      } catch { /* Ignore corrupt entries; the user can reconnect this provider. */ }
    }
    return result;
  } finally { db.close(); }
}
export async function deleteProviderKey(userId, provider) {
  const db = await openDb();
  try { await txRequest(db, "readwrite", store => store.delete("provider:" + userId + ":" + provider)); }
  finally { db.close(); }
}
