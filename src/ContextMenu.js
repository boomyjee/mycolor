export class ContextMenu {
    constructor(options = {}) {
        this.items = options.items || [];
        this.element = null;
        this.visible = false;
        this.position = { x: 0, y: 0 };
        
        // Создаем DOM элемент меню
        this.create();
        
        // Привязываем обработчики
        this.handleClickOutside = this.handleClickOutside.bind(this);
        document.addEventListener('click', this.handleClickOutside);
        document.addEventListener('contextmenu', this.handleClickOutside);
    }

    create() {
        // Создаем элемент меню
        this.element = document.createElement('div');
        this.element.className = 'context-menu';
        document.body.appendChild(this.element);
    }

    setItems(items) {
        this.items = items;
        this.render();
    }

    render() {
        this.element.innerHTML = '';
        
        this.items.forEach((item, index) => {
            if (item.separator) {
                const separator = document.createElement('div');
                separator.className = 'context-menu-separator';
                this.element.appendChild(separator);
                return;
            }

            const menuItem = document.createElement('div');
            menuItem.className = 'context-menu-item';
            if (item.disabled) menuItem.classList.add('disabled');

            // Добавляем иконку если есть
            if (item.icon) {
                const icon = document.createElement('span');
                icon.className = 'menu-icon';
                icon.innerHTML = item.icon;
                menuItem.appendChild(icon);
            }

            // Добавляем текст
            const text = document.createElement('span');
            text.textContent = item.label;
            menuItem.appendChild(text);

            // Добавляем сочетание клавиш если есть
            if (item.shortcut) {
                const shortcut = document.createElement('span');
                shortcut.className = 'shortcut';
                shortcut.textContent = item.shortcut;
                menuItem.appendChild(shortcut);
            }

            if (!item.disabled) {
                menuItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.hide();
                    item.action && item.action();
                });
            }

            this.element.appendChild(menuItem);
        });
    }

    show(x, y) {
        this.position = { x, y };
        this.render();
        
        // Устанавливаем позицию
        this.element.style.left = x + 'px';
        this.element.style.top = y + 'px';
        
        // Проверяем выход за пределы экрана
        const rect = this.element.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (rect.right > viewportWidth) {
            this.element.style.left = (x - rect.width) + 'px';
        }
        if (rect.bottom > viewportHeight) {
            this.element.style.top = (y - rect.height) + 'px';
        }

        // Показываем меню
        this.visible = true;
        this.element.classList.add('visible');
    }

    hide() {
        this.visible = false;
        this.element.classList.remove('visible');
    }

    handleClickOutside(e) {
        if (this.visible && !this.element.contains(e.target)) {
            this.hide();
        }
    }

    destroy() {
        document.removeEventListener('click', this.handleClickOutside);
        document.removeEventListener('contextmenu', this.handleClickOutside);
        this.element.remove();
    }
} 