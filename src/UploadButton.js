import { FileStorage } from './FileStorage.js';
import { DirectoryFilePicker } from './DirectoryFilePicker.js';

export class UploadButton {
    constructor(buttonId, onChange) {
        this.button = document.getElementById(buttonId);
        this.button.addEventListener('click', () => this.handleClick());
        this.onChange = onChange;

        this.directoryHandle = null; // Хранилище для Directory Handle в памяти
        this.selectedFileName = null;
        this.currentFile = null;
        this.currentFileHandle = null;

        // FileStorage для персистентности directoryHandle
        this.fileStorage = new FileStorage();
        this.storageKey = 'uploadDirectoryHandle'; // Ключ для IndexedDB
        this.fileStorage.init(); // Асинхронная инициализация, но можно вызывать методы

        this.filePicker = new DirectoryFilePicker();
    }

    // --- Получение/запрос Directory Handle ---
    async ensureDirectoryHandle() {
        // 1. Проверка хэндла в памяти
        if (this.directoryHandle && await this.fileStorage.verifyPermission(this.directoryHandle, 'read')) {
            // console.log('Using Directory Handle from memory.');
            return this.directoryHandle;
        }
        this.directoryHandle = null; // Сброс, если невалидный

        // 2. Попытка загрузки из IndexedDB
        try {
            // console.log('Attempting to load Directory Handle from storage...');
            const storedHandle = await this.fileStorage.getFileHandle(this.storageKey);
            if (storedHandle) {
                // console.log('Directory Handle found in storage, verifying permission...');
                if (await this.fileStorage.verifyPermission(storedHandle, 'read')) {
                    // console.log('Permission verified. Using stored Directory Handle.');
                    this.directoryHandle = storedHandle;
                    return this.directoryHandle;
                } else {
                    console.warn('Permission for stored Directory Handle lost/revoked. Requesting anew...');
                    await this.fileStorage.deleteHandle(this.storageKey);
                }
            } else {
                // console.log('No Directory Handle found in storage.');
            }
        } catch (err) {
            console.error('Error loading Directory Handle from storage:', err);
        }

        // 3. Запрос у пользователя
        // console.log('Requesting directory selection from user...');
        try {
            const dirHandle = await window.showDirectoryPicker({ mode: 'read' });

            // Проверяем/запрашиваем разрешение и сохраняем
            if (await this.fileStorage.verifyPermission(dirHandle, 'read')) {
                await this.fileStorage.saveFileHandle(this.storageKey, dirHandle);
                this.directoryHandle = dirHandle; // Сохраняем в памяти
                // console.log('Directory selected, permission granted and handle stored.');
                return this.directoryHandle;
            } else {
                console.error('User did not grant read permission for the directory.');
                alert('Read permission for the folder is required to select files.');
                return null;
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Error requesting directory picker:', err);
                alert('An error occurred while selecting the folder.');
            } else {
                // console.log('User aborted directory selection.');
            }
            return null; // Ошибка или отмена пользователем
        }
    }
    // --- Конец ensureDirectoryHandle ---

    // --- Показ кастомного файлового пикера ---
    async showCustomFilePicker(dirHandle) {
        if (!dirHandle) {
            console.warn('showCustomFilePicker called without a directory handle.');
            return;
        }

        try {
            const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.mp4', '.webm', '.mov'];
            
            // Используем пикер, ожидаем FileSystemFileHandle или null
            const selectedFileHandle = await this.filePicker.show(dirHandle, allowedExtensions, this.selectedFileName);

            if (selectedFileHandle) {
                // console.log(`User selected file handle:`, selectedFileHandle.name);
                await this._processSelectedFileHandle(selectedFileHandle);
            } else {
                // console.log('User cancelled custom file picker.');
            }

        } catch (err) {
            // Ошибки чтения директории теперь обрабатываются внутри DirectoryFilePicker,
            // но можем перехватить ошибки промиса show(), если они будут
            console.error('Error occurred during file picker operation:', err);
            alert('An unexpected error occurred while trying to select a file.');
            // Сброс хэндла при NotAllowedError остается актуальным, если он произойдет *до* вызова show()
            // или если сам show() его выбросит (хотя сейчас он ловит внутри)
            if (err.name === 'NotAllowedError') {
                 console.warn('Permission might have been lost before showing picker. Resetting handle.');
                 this.directoryHandle = null;
                 await this.fileStorage.deleteHandle(this.storageKey);
            }
        }
    }
    // --- Конец showCustomFilePicker ---

    // --- НОВЫЙ МЕТОД: Обработка выбранного FileSystemFileHandle ---
    async _processSelectedFileHandle(fileHandle) {
        if (!fileHandle || fileHandle.kind !== 'file') {
            console.warn('Invalid file handle received.', fileHandle);
            return;
        }

        try {
            // console.log('Processing selected file handle:', fileHandle.name);
            const file = await fileHandle.getFile();
            // console.log('File object obtained:', file);

            // TODO: Определить и сохранить относительный путь для восстановления?
            // Пока сохраняем только имя.
            this.selectedFileName = fileHandle.name; 
            this.currentFile = file;
            this.currentFileHandle = fileHandle; // Сохраняем хэндл

            // console.log(`File "${fileHandle.name}" processed successfully.`);

            if (this.onChange) {
                // Передаем File и имя файла, как и раньше
                await this.onChange(file, { fileName: fileHandle.name }); 
            }

        } catch (err) {
            console.error(`Error processing file handle "${fileHandle?.name || 'unknown'}":`, err);
            alert(`Could not process the selected file "${fileHandle?.name || 'unknown'}".`);
            this.resetInternalState(); // Сброс файла
            if (this.onChange) await this.onChange(null, null);
        }
    }
    // --- Конец _processSelectedFileHandle ---

    // --- Загрузка конкретного файла (ТЕПЕРЬ НЕ ИСПОЛЬЗУЕТСЯ напрямую из showCustomFilePicker) ---
    /* 
       Метод selectFile(dirHandle, fileName) больше не вызывается напрямую 
       из showCustomFilePicker. Его логика перенесена в _processSelectedFileHandle,
       которая работает с FileSystemFileHandle. 
       Оставим его пока закомментированным или удалим позже, если он не нужен
       для других целей (например, для setValue, но там тоже нужна доработка).
    */
    /*
    async selectFile(dirHandle, fileName) {
       // ... старый код ... 
    }
    */
    // --- Конец selectFile ---

    // --- Обработчик клика по кнопке ---
    async handleClick() {
        // console.log('Upload button clicked.');
        // Убеждаемся, что есть хэндл директории
        const dirHandle = await this.ensureDirectoryHandle();
        if (dirHandle) {
            // Показываем выбор файла
            await this.showCustomFilePicker(dirHandle);
        } else {
            // console.log('Directory handle could not be ensured. File picker not shown.');
        }
    }
    // --- Конец handleClick ---

    // --- Получение состояния --- 
    getValue() {
        // Возвращаем только имя файла для сохранения состояния
        return { fileName: this.selectedFileName };
    }
    // --- Конец getValue ---

    // --- Сброс состояния --- 
    // Внутренний сброс (только файл)
    resetInternalState() {
        // console.log('Resetting internal file state (filename, file, filehandle).');
        this.selectedFileName = null;
        this.currentFile = null;
        this.currentFileHandle = null;
    }

    // Полный сброс (файл + хэндл директории)
    async reset() {
        // console.log('Performing full reset (file state + directory handle).');
        this.resetInternalState();
        this.directoryHandle = null;
        try {
            await this.fileStorage.deleteHandle(this.storageKey);
            // console.log('Directory handle deleted from storage.');
        } catch (e) {
            console.error('Error deleting directory handle from storage during reset:', e);
        }
        // Уведомляем основное приложение
        if (this.onChange) {
            // Не ждем завершения onChange, чтобы не блокировать
            Promise.resolve(this.onChange(null, null));
        }
    }
    // --- Конец reset --- 

    // --- Установка состояния (восстановление) ---
    async setValue(state) {
        const fileName = state?.fileName;
        // console.log(`setValue called with state:`, state);

        if (!fileName) {
            // console.log('setValue: No fileName provided. Resetting internal state.');
            this.resetInternalState();
            if (this.onChange) await this.onChange(null, null);
            return;
        }

        // console.log(`setValue: Attempting to restore file "${fileName}". Ensuring directory handle...');
        // Убеждаемся, что есть хэндл директории (может запросить у пользователя!)
        const dirHandle = await this.ensureDirectoryHandle();

        if (dirHandle) {
            // console.log(`setValue: Directory handle ensured. Attempting to get file handle for "${fileName}"...`);
            // !!! ПРОБЛЕМА: Мы не знаем, в какой подпапке файл. 
            // Простой getFileHandle от корневой папки не сработает для вложенных.
            // Варианты: 
            // 1. Сохранять полный относительный путь в состоянии.
            // 2. Всегда показывать filePicker при восстановлении, чтобы пользователь сам выбрал.
            // 3. Пытаться рекурсивно найти файл по имени (медленно и ненадежно).
            
            // Пока что оставляем старую логику, которая будет работать только для файлов в корне
            // TODO: Пересмотреть логику восстановления для вложенных папок
            try {
                 const fileHandle = await dirHandle.getFileHandle(fileName, { create: false });
                 await this._processSelectedFileHandle(fileHandle); // Используем новый метод
            } catch (err) {
                 console.warn(`setValue: Could not get file handle for "${fileName}" directly from root. Maybe it's in a subfolder or deleted?`, err);
                 this.resetInternalState(); 
                 if (this.onChange) await this.onChange(null, null); 
            }
        } else {
            // Если хэндл не получен (ошибка или отказ пользователя при запросе)
            console.warn('setValue: Could not ensure directory handle. File will not be restored.');
            this.resetInternalState(); // Сбрасываем состояние файла
            if (this.onChange) await this.onChange(null, null); // Уведомляем, что файл не загружен
        }
    }
    // --- Конец setValue ---

    // --- Метод для принудительной смены базовой папки ---
    async forceChangeDirectory() {
        console.warn('Force changing directory...'); // Используем warn для заметности
        try {
            // 1. Всегда запрашиваем новую папку у пользователя
            const newDirHandle = await window.showDirectoryPicker({ mode: 'read' });

            // 2. Проверяем/запрашиваем разрешение и сохраняем
            if (await this.fileStorage.verifyPermission(newDirHandle, 'read')) {
                await this.fileStorage.saveFileHandle(this.storageKey, newDirHandle); // Перезаписываем старый хэндл
                this.directoryHandle = newDirHandle; // Обновляем в памяти
                // console.log('New directory selected, permission granted and handle stored.');

                // 3. Сбрасываем выбор файла, т.к. папка новая
                this.resetInternalState();
                if (this.onChange) await this.onChange(null, null); // Уведомляем об отсутствии файла

                // 4. Сразу открыть пикер для новой папки
                await this.showCustomFilePicker(this.directoryHandle);

                return true; // Успешно сменили
            } else {
                console.error('User did not grant read permission for the newly selected directory.');
                alert('Разрешение на чтение для новой папки не предоставлено.');
                return false;
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Error requesting directory picker during change:', err);
                alert('Произошла ошибка при выборе новой папки.');
            } else {
                // console.log('User aborted directory selection during change.');
            }
            return false; // Ошибка или отмена
        }
    }
    // --- Конец forceChangeDirectory ---
} 