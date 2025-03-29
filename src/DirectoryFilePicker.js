export class DirectoryFilePicker {
    constructor() {
        this.rootDirectoryHandle = null; // + Корневой хэндл
        this.currentDirectoryHandle = null; // + Текущий хэндл
        this.currentPathSegments = []; // + Массив сегментов пути ["папка1", "вложенная"]

        this.container = null;
        this.pathElement = null; // + Элемент для отображения пути
        this.fileListElement = null;
        this.resolvePromise = null;
        this.rejectPromise = null;
        this.thumbnailObserver = null; // + IntersectionObserver для превью

        this._createDOM();
    }

    _createDOM() {
        this.container = document.createElement('div');
        this.container.className = 'dfp-overlay';

        const modal = document.createElement('div');
        modal.className = 'dfp-modal';

        // + Элемент для пути и кнопки "Вверх"
        const pathContainer = document.createElement('div');
        pathContainer.className = 'dfp-path-container';
        const upButton = document.createElement('button');
        upButton.innerHTML = '&uarr;'; // Стрелка вверх
        upButton.className = 'dfp-up-btn';
        upButton.title = 'На уровень вверх';
        upButton.addEventListener('click', () => this._handleNavigateUp());
        this.pathElement = document.createElement('span');
        this.pathElement.className = 'dfp-path';
        pathContainer.appendChild(upButton);
        pathContainer.appendChild(this.pathElement);
        // - 

        this.fileListElement = document.createElement('ul');
        this.fileListElement.className = 'dfp-list';
        // Обработчик клика на список (делегирование событий)
        this.fileListElement.addEventListener('click', (event) => {
            const targetLi = event.target.closest('li[data-name]'); // Ищем li с data-name
            if (!targetLi) return;

            const name = targetLi.dataset.name;
            const kind = targetLi.dataset.kind;

            if (kind === 'file') {
                // Нужен fileHandle, а не просто имя
                this._handleFileSelectionRequest(name); 
            } else if (kind === 'directory') {
                this._handleNavigateDown(name);
            }
        });

        modal.appendChild(pathContainer); // + Добавляем путь
        modal.appendChild(this.fileListElement);
        this.container.appendChild(modal);

        // Закрытие по клику на оверлей
        this.container.addEventListener('click', (event) => {
            if (event.target === this.container) {
                this._handleCancel();
            }
        });

        document.body.appendChild(this.container);
    }

    show(rootDirectoryHandle, allowedExtensions = [], currentSelection = null) {
        // Сохраняем переданные параметры
        this.rootDirectoryHandle = rootDirectoryHandle;
        this.currentDirectoryHandle = rootDirectoryHandle; // Начинаем с корня
        this.allowedExtensions = allowedExtensions.map(ext => ext.toLowerCase());
        this.currentSelectionName = currentSelection; // Сохраняем имя текущего файла
        this.currentPathSegments = []; // Сбрасываем путь

        return new Promise(async (resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;

            this.container.classList.add('visible');
            await this._renderDirectoryContent(); // Отображаем корень
        });
    }

    async _renderDirectoryContent() {
        if (!this.currentDirectoryHandle) return;

        // Обновляем путь и состояние кнопки "Вверх"
        this._updatePathUI(); 

        this.fileListElement.innerHTML = '<li class="loading">Загрузка файлов...</li>';

        let entries = { files: [], directories: [] };
        try {
            for await (const entry of this.currentDirectoryHandle.values()) {
                if (entry.kind === 'file' && this.allowedExtensions.some(ext => entry.name.toLowerCase().endsWith(ext))) {
                    entries.files.push(entry.name);
                } else if (entry.kind === 'directory') {
                    entries.directories.push(entry.name);
                }
            }
            entries.files.sort();
            entries.directories.sort();

            this.fileListElement.innerHTML = ''; // Очищаем

            if (entries.directories.length === 0 && entries.files.length === 0) {
                this.fileListElement.innerHTML = '<li class="empty">Папка пуста или нет подходящих файлов.</li>';
                return;
            }

            // Сначала папки
            entries.directories.forEach(name => {
                const li = document.createElement('li');
                li.dataset.name = name;
                li.dataset.kind = 'directory';
                // Используем новые классы для стилизации
                li.innerHTML = `<span class="file-icon">📁</span><span class="file-name">${name}</span>`;
                this.fileListElement.appendChild(li);
            });

            // Потом файлы
            entries.files.forEach(name => {
                const li = document.createElement('li');
                li.dataset.name = name;
                li.dataset.kind = 'file';

                let iconHTML = '';
                const lowerName = name.toLowerCase();
                let isImage = ['.png', '.jpg', '.jpeg', '.webp'].some(ext => lowerName.endsWith(ext));
                let isVideo = ['.mp4', '.webm', '.mov'].some(ext => lowerName.endsWith(ext));

                if (isImage) {
                    // Создаем контейнер и img-заглушку для превью
                    iconHTML = `<div class="thumbnail-container"><img class="thumbnail thumbnail-placeholder" data-filename="${name}" alt="Preview"></div>`;
                    li.classList.add('file-image');
                } else if (isVideo) {
                    iconHTML = `<span class="file-icon">🎞️</span>`;
                    li.classList.add('file-video');
                } else {
                    iconHTML = `<span class="file-icon">📄</span>`; // Файлы других типов (если появятся)
                }
                
                // Собираем содержимое li
                li.innerHTML = `${iconHTML}<span class="file-name">${name}</span>`;

                // Подсветка выбранного (если в текущей папке)
                if (this.currentPathSegments.length === 0 && name === this.currentSelectionName) {
                    li.classList.add('selected');
                }
                this.fileListElement.appendChild(li);
            });

            // После добавления элементов в DOM, запускаем наблюдение за превью
            this._observeThumbnails();

        } catch (err) {
            console.error("Error reading directory:", err);
            this.fileListElement.innerHTML = `<li class="error">Ошибка чтения папки: ${err.message}.</li>`;
        }
    }

    _updatePathUI() {
        const pathString = '/' + this.currentPathSegments.join('/');
        this.pathElement.textContent = pathString;
        this.pathElement.title = pathString; // Тултип для длинных путей

        // Находим кнопку "Вверх" и управляем ее видимостью/состоянием
        const upButton = this.container.querySelector('.dfp-up-btn');
        if (upButton) {
             upButton.disabled = this.currentPathSegments.length === 0;
        }
    }

    // Реализация навигации вниз
    async _handleNavigateDown(directoryName) {
        // console.log('Navigate down into:', directoryName);
        if (!this.currentDirectoryHandle) return;

        try {
            const subDirectoryHandle = await this.currentDirectoryHandle.getDirectoryHandle(directoryName, { create: false });
            this.currentPathSegments.push(directoryName); // Добавляем сегмент пути
            this.currentDirectoryHandle = subDirectoryHandle; // Обновляем текущий хэндл
            await this._renderDirectoryContent(); // Перерисовываем
        } catch (err) {
            console.error(`Error getting directory handle for "${directoryName}":`, err);
            alert(`Не удалось открыть папку "${directoryName}".`);
        }
    }

    // Реализация навигации вверх
    async _handleNavigateUp() {
        // console.log('Navigate up');
        if (this.currentPathSegments.length === 0) return; // Уже в корне

        this.currentPathSegments.pop(); // Убираем последний сегмент

        // Получаем родительский хэндл, идя от корня по обновленному пути
        let parentHandle = this.rootDirectoryHandle;
        try {
            for (const segment of this.currentPathSegments) {
                parentHandle = await parentHandle.getDirectoryHandle(segment, { create: false });
            }
            this.currentDirectoryHandle = parentHandle; // Обновляем текущий хэндл
            await this._renderDirectoryContent(); // Перерисовываем
        } catch (err) {
             console.error('Error navigating up:', err);
             alert('Произошла ошибка при переходе в родительскую папку.');
             // Попытка вернуться в корень при ошибке?
             // this.currentPathSegments = [];
             // this.currentDirectoryHandle = this.rootDirectoryHandle;
             // await this._renderDirectoryContent();
        }
    }

    // Реализация получения хэндла файла
    async _handleFileSelectionRequest(fileName) {
        // console.log('Request selection of file:', fileName);
        if (!this.currentDirectoryHandle) return;

        try {
            const fileHandle = await this.currentDirectoryHandle.getFileHandle(fileName, { create: false });
            this._handleSelection(fileHandle); // Передаем хэндл файла
        } catch (err) {
            console.error(`Error getting file handle for "${fileName}":`, err);
            alert(`Не удалось получить доступ к файлу "${fileName}".`);
        }
    }

    _handleSelection(fileHandle) {
        if (this.resolvePromise) {
            this.resolvePromise(fileHandle);
        }
        this.hide();
    }

    _handleCancel() {
        if (this.resolvePromise) {
            this.resolvePromise(null); // Возвращаем null при отмене
        }
        this.hide();
    }

    hide() {
        // + Отключаем observer при скрытии
        if (this.thumbnailObserver) {
            this.thumbnailObserver.disconnect();
            this.thumbnailObserver = null;
        }
        this.container.classList.remove('visible');
        this.fileListElement.innerHTML = ''; // Очищаем список
        this.resolvePromise = null;
        this.rejectPromise = null;
    }

    destroy() {
        // + Отключаем observer при уничтожении
        if (this.thumbnailObserver) {
            this.thumbnailObserver.disconnect();
            this.thumbnailObserver = null;
        }
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }

    // + Метод для инициализации и запуска наблюдения за превью
    _observeThumbnails() {
        // Отключаем предыдущий observer, если он был
        if (this.thumbnailObserver) {
            this.thumbnailObserver.disconnect();
        }

        const imagePlaceholders = this.fileListElement.querySelectorAll('img.thumbnail-placeholder');
        if (imagePlaceholders.length === 0) {
            return; // Нечего наблюдать
        }

        // Настройки observer'а (можно настроить rootMargin для загрузки чуть заранее)
        const options = {
            root: this.fileListElement, // Наблюдаем внутри списка
            rootMargin: '0px 0px 50px 0px', // Начать загрузку за 50px до появления
            threshold: 0.01 // Даже 1% видимости триггерит загрузку
        };

        this.thumbnailObserver = new IntersectionObserver(this._loadThumbnail.bind(this), options);

        imagePlaceholders.forEach(img => {
            this.thumbnailObserver.observe(img);
        });
    }

    // + Колбэк для IntersectionObserver - загружает видимые превью
    async _loadThumbnail(entries, observer) {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                const imgElement = entry.target;
                const fileName = imgElement.dataset.filename;
                
                // Прекращаем наблюдение за этим элементом
                observer.unobserve(imgElement);
                imgElement.classList.remove('thumbnail-placeholder'); // Убираем класс-маркер

                if (!fileName || !this.currentDirectoryHandle) continue;

                try {
                    // console.log(`Loading thumbnail for ${fileName}`);
                    const fileHandle = await this.currentDirectoryHandle.getFileHandle(fileName, { create: false });
                    const file = await fileHandle.getFile();

                    // Проверяем, что это действительно изображение (на всякий случай)
                    if (!file.type.startsWith('image/')) {
                         console.warn(`File ${fileName} is not an image, skipping thumbnail.`);
                         continue;
                    }

                    const objectURL = URL.createObjectURL(file);
                    imgElement.src = objectURL;
                    // Важно освободить память после загрузки или ошибки
                    imgElement.onload = () => URL.revokeObjectURL(objectURL);
                    imgElement.onerror = () => {
                        console.error(`Error loading image ${fileName} into thumbnail.`);
                        URL.revokeObjectURL(objectURL);
                        // Можно показать иконку ошибки или оставить заглушку
                    };

                } catch (err) {
                    console.error(`Failed to load thumbnail for ${fileName}:`, err);
                     // Можно показать иконку ошибки или оставить заглушку
                }
            }
        }
    }
} 