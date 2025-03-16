import { gl } from './main.js';

export class Picker2D {
    constructor(elementId, onChange, options = {}) {
        this.picker = document.getElementById(elementId);
        this.cursor = this.picker.querySelector('.cursor');
        this.xValue = document.getElementById(elementId + 'XValue');
        this.yValue = document.getElementById(elementId + 'YValue');
        this.x = 0.5;
        this.y = 0.5;
        this.angle = 0;
        this.distance = 0;
        this.onChange = onChange;
        this.circular = options.circular || false;

        if (this.circular) {
            this.picker.classList.add('circular');
            this.xValue.parentElement.firstChild.textContent = 'Angle: ';
            this.yValue.parentElement.firstChild.textContent = 'Distance: ';
        }

        this.handleMove = this.handleMove.bind(this);
        this.setupListeners();
        this.updateCursor(0.5, 0.5);
    }

    setupListeners() {
        this.picker.addEventListener('mousedown', (e) => {
            this.handleMove(e);
            document.addEventListener('mousemove', this.handleMove);
            document.addEventListener('mouseup', () => {
                document.removeEventListener('mousemove', this.handleMove);
            }, { once: true });
        });

        this.picker.addEventListener('dblclick', () => {
            this.updateCursor(0.5, 0.5);
        });
    }

    updateCursor(x, y) {
        if (this.circular) {
            const centerX = 0.5;
            const centerY = 0.5;
            const dx = x - centerX;
            const dy = y - centerY;
            
            const angle = (-Math.atan2(-dx, dy) * 180 / Math.PI + 360) % 360;
            const distance = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
            
            const radius = distance / 2;
            const radians = (90 - angle) * Math.PI / 180;
            x = centerX + radius * Math.cos(radians);
            y = centerY + radius * Math.sin(radians);

            this.xValue.textContent = Math.round(angle);
            this.yValue.textContent = distance.toFixed(2);

            this.angle = angle;
            this.distance = distance;
            
            if (this.onChange) {
                this.onChange(angle, distance);
            }
        } else {
            this.xValue.textContent = x.toFixed(2);
            this.yValue.textContent = y.toFixed(2);
            if (this.onChange) {
                this.onChange(x, y);
            }
        }

        this.cursor.style.left = `${x * 100}%`;
        this.cursor.style.top = `${(1 - y) * 100}%`;
        this.x = x;
        this.y = y;
    }

    handleMove(event) {
        const rect = this.picker.getBoundingClientRect();
        let x = (event.clientX - rect.left) / rect.width;
        let y = 1 - (event.clientY - rect.top) / rect.height;
        
        if (this.circular) {
            const centerX = 0.5;
            const centerY = 0.5;
            const dx = x - centerX;
            const dy = y - centerY;
            
            const distance = Math.sqrt(dx * dx + dy * dy) * 2;
            if (distance > 1) {
                const angle = Math.atan2(dy, dx);
                x = centerX + Math.cos(angle) * 0.5;
                y = centerY + Math.sin(angle) * 0.5;
            }
        } else {
            x = Math.max(0, Math.min(1, x));
            y = Math.max(0, Math.min(1, y));
        }
        
        this.updateCursor(x, y);
    }

    getValue() {
        if (this.circular) {
            return [this.angle, this.distance];
        } else {
            return [this.x, this.y];
        }
    }

    setValue(values) {
        if (values === undefined) {
            this.reset();
            return;
        }

        if (this.circular) {
            const [angle, distance] = values;
            // Преобразуем полярные координаты в декартовы
            const angleRad = -angle * Math.PI / 180;
            const centerX = 0.5;
            const centerY = 0.5;
            const radius = distance / 2;
            
            this.x = centerX + Math.cos(angleRad) * radius;
            this.y = centerY - Math.sin(angleRad) * radius;
        } else {
            const [x, y] = values;
            this.x = x;
            this.y = y;
        }

        // Обновляем отображение курсора
        this.updateCursor(this.x, this.y);
    }

    reset() {
        if (this.circular) {
            this.angle = 0;
            this.distance = 0;
            this.x = 0.5;
            this.y = 0.5;
        } else {
            this.x = 0.5;
            this.y = 0.5;
        }
        this.updateCursor(this.x, this.y);
    }
} 