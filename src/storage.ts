import type { Board } from './model';
const database = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('storyboard', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('boards');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
export async function readBoard(): Promise<Board | undefined> {
  const db = await database;
  return new Promise((resolve, reject) => {
    const r = db.transaction('boards').objectStore('boards').get('current');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function saveBoard(board: Board) {
  const db = await database;
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('boards', 'readwrite');
    tx.objectStore('boards').put(board, 'current');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
