const BACKUP_KEY_PREFIX = 'smartClass.backup.';

function hasChromeSyncStorage() {
  return (
    typeof globalThis !== 'undefined' &&
    globalThis.chrome &&
    globalThis.chrome.storage &&
    globalThis.chrome.storage.sync &&
    typeof globalThis.chrome.storage.sync.get === 'function' &&
    typeof globalThis.chrome.storage.sync.set === 'function' &&
    typeof globalThis.chrome.storage.sync.remove === 'function'
  );
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

async function chromeGet(keys) {
  return await new Promise(resolve => {
    globalThis.chrome.storage.sync.get(keys, items => resolve(items || {}));
  });
}

async function chromeGetAll() {
  return await chromeGet(null);
}

async function chromeSet(obj) {
  return await new Promise(resolve => {
    globalThis.chrome.storage.sync.set(obj, () => resolve());
  });
}

async function chromeRemove(keys) {
  return await new Promise(resolve => {
    globalThis.chrome.storage.sync.remove(keys, () => resolve());
  });
}

function localGet(keys) {
  const out = {};
  if (typeof globalThis === 'undefined' || !globalThis.localStorage) return out;

  if (keys === null) {
    for (let i = 0; i < globalThis.localStorage.length; i++) {
      const k = globalThis.localStorage.key(i);
      if (!k) continue;
      const raw = globalThis.localStorage.getItem(k);
      const parsed = raw == null ? null : safeJsonParse(raw);
      out[k] = parsed;
    }
    return out;
  }

  const list = Array.isArray(keys) ? keys : [keys];
  list.forEach(k => {
    const raw = globalThis.localStorage.getItem(k);
    const parsed = raw == null ? null : safeJsonParse(raw);
    out[k] = parsed;
  });
  return out;
}

function localSet(obj) {
  if (typeof globalThis === 'undefined' || !globalThis.localStorage) return;
  Object.entries(obj).forEach(([k, v]) => {
    globalThis.localStorage.setItem(k, JSON.stringify(v));
  });
}

function localRemove(keys) {
  if (typeof globalThis === 'undefined' || !globalThis.localStorage) return;
  const list = Array.isArray(keys) ? keys : [keys];
  list.forEach(k => globalThis.localStorage.removeItem(k));
}

async function storageGet(keys) {
  if (hasChromeSyncStorage()) return await chromeGet(keys);
  return localGet(keys);
}

async function storageGetAll() {
  if (hasChromeSyncStorage()) return await chromeGetAll();
  return localGet(null);
}

async function storageSet(obj) {
  if (hasChromeSyncStorage()) return await chromeSet(obj);
  return localSet(obj);
}

async function storageRemove(keys) {
  if (hasChromeSyncStorage()) return await chromeRemove(keys);
  return localRemove(keys);
}

export function getBackupStorageKind() {
  return hasChromeSyncStorage() ? 'sync' : 'local';
}

export function makeBackupKey(name) {
  return `${BACKUP_KEY_PREFIX}${name}`;
}

export function isBackupKey(key) {
  return typeof key === 'string' && key.startsWith(BACKUP_KEY_PREFIX);
}

export function nameFromBackupKey(key) {
  return key.slice(BACKUP_KEY_PREFIX.length);
}

export async function listBackups() {
  const all = await storageGetAll();
  const backups = Object.entries(all)
    .filter(([k]) => isBackupKey(k))
    .map(([k, v]) => {
      const name = nameFromBackupKey(k);
      const savedAt = v?.savedAt || null;
      return {
        key: k,
        name,
        savedAt,
        record: v ?? null
      };
    })
    .sort((a, b) => {
      const at = a.savedAt ? Date.parse(a.savedAt) : 0;
      const bt = b.savedAt ? Date.parse(b.savedAt) : 0;
      return bt - at;
    });

  return backups;
}

export async function getBackupRecord(name) {
  const key = makeBackupKey(name);
  const result = await storageGet([key]);
  return result?.[key] ?? null;
}

export async function saveBackupRecord(name, payload) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('missing_name');

  const key = makeBackupKey(trimmed);
  const record = {
    schemaVersion: 1,
    name: trimmed,
    savedAt: new Date().toISOString(),
    payload
  };

  await storageSet({ [key]: record });
  return record;
}

export async function deleteBackupRecord(name) {
  const key = makeBackupKey(name);
  await storageRemove([key]);
}

