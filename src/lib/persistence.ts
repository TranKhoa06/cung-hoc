const DATABASE = 'cung-hoc-v1';
let database: Promise<IDBDatabase> | undefined;
function open() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('store');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Không mở được bộ nhớ trình duyệt. Hãy cho phép lưu dữ liệu hoặc đổi trình duyệt.'));
  });
  return database;
}
export async function readLocal<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction('store', 'readonly').objectStore('store').get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}
export async function writeLocal(key: string, value: unknown) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('store', 'readwrite');
    transaction.objectStore('store').put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Không lưu được dữ liệu. Bộ nhớ thiết bị có thể đã đầy. Hãy xuất bản sao lưu.'));
    transaction.onabort = () => reject(new Error('Lưu dữ liệu bị gián đoạn. Vui lòng thử lại.'));
  });
}
