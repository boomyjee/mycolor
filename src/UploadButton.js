export class UploadButton {
    constructor(buttonId, onChange) {
        this.button = document.getElementById(buttonId);
        this.onChange = onChange;
        this.button.addEventListener('click', () => this.handleClick());
        this.currentFile = null;
        this.currentFileHandle = null;
    }

    async handleClick() {
        try {
            // Запрашиваем файл у пользователя
            const [fileHandle] = await window.showOpenFilePicker({
                types: [
                    {
                        description: 'Images & Videos',
                        accept: {
                            'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
                            'video/*': ['.mp4', '.webm', '.mov']
                        }
                    }
                ]
            });

            const file = await fileHandle.getFile();
            
            // Сохраняем текущий файл
            this.currentFile = file;
            this.currentFileHandle = fileHandle;
            
            // Вызываем колбэк с файлом и хэндлером
            if (this.onChange) {
                this.onChange(file, fileHandle);
            }
        } catch (err) {
            console.error('Ошибка при выборе файла:', err);
        }
    }

    // Получить текущий файл и его хэндлер
    getValue() {
        return this.currentFileHandle;
    }

    reset(){
        this.currentFile = null;
        this.currentFileHandle = null;
    }

    // Установить файл программно (например, для восстановления состояния)
    async setValue(fileHandle) {
        if (!fileHandle) {
            this.reset();
            if (this.onChange) {
                await this.onChange(null, null);
            }
            return;
        }
        try {
            if (fileHandle) {
                const file = await fileHandle.getFile();
                this.currentFile = file;
                this.currentFileHandle = fileHandle;
                
                if (this.onChange) {
                    await this.onChange(file, fileHandle);
                }
                return true;
            }
            return false;
        } catch (err) {
            console.error('Ошибка при установке файла:', err);
            return false;
        }
    }
} 