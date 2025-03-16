export class FileStorage {
    constructor() {
        this.dbName = 'ColorEditorDB';
        this.storeName = 'files';
        this.version = 1;
    }

    async init() {
        if (this.db) {
            return;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }

    async saveFileHandle(key, fileHandle) {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(fileHandle, key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async getFileHandle(key) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);

            request.onerror = () => resolve(null);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async verifyPermission(fileHandle) {
        const options = {
            mode: 'read'
        };
        
        // Проверяем разрешение
        if ((await fileHandle.queryPermission(options)) === 'granted') {
            return true;
        }
        
        // Запрашиваем разрешение
        if ((await fileHandle.requestPermission(options)) === 'granted') {
            return true;
        }
        
        return false;
    }
} 