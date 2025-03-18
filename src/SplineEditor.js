import { gl } from './main.js';

export function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export class SplineEditor {
    constructor(elementId, options = {}) {
        this.container = document.getElementById(elementId);
        this.canvas = this.container.querySelector('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.points = options.points || [];
        this.firstIsLast = options.firstIsLast || false;
        this.circular = options.circular || false;
        this.defaultPoints = this.points.map(point => ({...point})); // Сохраняем копию начальных точек
        this.selectedPoint = null;
        this.onChange = options.onChange || (() => {});
        this.texture = null;
        this.textureSize = 1024;
        this.textureData = new Uint8Array(this.textureSize * 4);
        this.stopColorFunction = options.stopColorFunction || false;

        this.handleMove = this.handleMove.bind(this);
        this.handleUp = this.handleUp.bind(this);
        
        // Привязываем методы к контексту
        this.setupCanvas = this.setupCanvas.bind(this);
        this.render = this.render.bind(this);

        // Создаем IntersectionObserver для отслеживания видимости
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.setupCanvas();
                    this.render();
                }
            });
        }, {
            threshold: 0.1 // Триггер когда хотя бы 10% элемента видимо
        });

        // Начинаем наблюдение за контейнером
        this.observer.observe(this.container);
        
        this.setupCanvas();
        this.setupListeners();
        this.updateTexture();
        this.render();
    }

    setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
    }

    setupListeners() {
        this.canvas.addEventListener('mousedown', (e) => {
            const point = this.mouseToPoint(e.clientX, e.clientY);
            
            const selectedPoint = this.points.find(p => 
                Math.abs(p.x - point.x) < 0.08 && Math.abs(p.y - point.y) < 0.08
            );
            
            if (selectedPoint) {
                this.selectedPoint = selectedPoint;
                document.addEventListener('mousemove', this.handleMove);
                document.addEventListener('mouseup', this.handleUp);
            }
        });
    }

    handleMove(e) {
        if (!this.selectedPoint) return;
        
        const point = this.mouseToPoint(e.clientX, e.clientY);
        const index = this.points.indexOf(this.selectedPoint);

        let isFirstOrLastPoint = index === 0 || index === this.points.length - 1;
        
        if (!isFirstOrLastPoint || this.circular) {
            const prevX = this.points[index === 0 ? this.points.length - 1 : index - 1].x;
            const nextX = this.points[index === this.points.length - 1 ? 0 : index + 1].x;

            if (this.circular) {
                this.selectedPoint.x = this.clampAngle(point.x, prevX, nextX);
            } else {
                this.selectedPoint.x = Math.max(prevX, Math.min(nextX, point.x));
            }
        }
        this.selectedPoint.y = Math.max(0, Math.min(1, point.y));

        if (isFirstOrLastPoint && this.firstIsLast) { 
            this.points[0].y = this.selectedPoint.y;
            this.points[this.points.length - 1].y = this.selectedPoint.y;
        }
        
        this.updateTexture();
        this.render();
    }

    handleUp() {
        this.selectedPoint = null;
        document.removeEventListener('mousemove', this.handleMove);
        document.removeEventListener('mouseup', this.handleUp);
    }

    render() {
        const { width, height } = this.canvas.getBoundingClientRect();
        this.ctx.clearRect(0, 0, width, height);
        
        var gradient;
        if (this.circular) {
            gradient = this.ctx.createConicGradient(-Math.PI/2+this.points[0].x*Math.PI*2,width / 2, height / 2);
            let gradientPoints = [...this.points];
            gradientPoints.push({x:this.points[0].x+1, y:this.points[0].y,last:true});
            gradientPoints.forEach(point => {
                const x = point.x;
                const value = point.y;
                const [r, g, b] = this.stopColorFunction ? this.stopColorFunction(x,value) : hsvToRgb(x, value, 0.3);
                let stopX = ((x - this.points[0].x) % 1.0 + 1.0) % 1.0;
                if (point.last) {
                    stopX = 1;
                }
                gradient.addColorStop(stopX, `rgba(${r}, ${g}, ${b}, 1.0)`);
            });
    
        } else {
            gradient = this.ctx.createLinearGradient(0, 0, width, 0);
            let gradientPoints = [...this.points];
            gradientPoints.forEach(point => {
                const x = point.x;
                const value = point.y;
                const [r, g, b] = this.stopColorFunction ? this.stopColorFunction(x,value) : hsvToRgb(x, value, 0.3);
                gradient.addColorStop(x, `rgba(${r}, ${g}, ${b}, 1.0)`);
            });
    
        }
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, width, height);
        
        // Отрисовка сетки
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;

        if (this.circular) {
            // Рисуем круговые линии сетки
            for (let i = 1; i <= 4; i++) {
                const radius = (i / 4) * Math.min(width, height) / 2;
                this.ctx.beginPath();
                this.ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
                this.ctx.stroke();
            }

            // Рисуем радиальные линии сетки
            for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2;
                const radius = Math.min(width, height) / 2;
                this.ctx.beginPath();
                this.ctx.moveTo(width / 2, height / 2);
                this.ctx.lineTo(
                    width / 2 + radius * Math.cos(angle),
                    height / 2 + radius * Math.sin(angle)
                );
                this.ctx.stroke();
            }
        } else {
            for (let i = 0; i <= 4; i++) {
                const y = i * height / 4;
                this.ctx.beginPath();
                this.ctx.moveTo(0, y);
                this.ctx.lineTo(width, y);
                this.ctx.stroke();
            }
            
            for (let i = 0; i <= 4; i++) {
                const x = i * width / 4;
                this.ctx.beginPath();
                this.ctx.moveTo(x, 0);
                this.ctx.lineTo(x, height);
                this.ctx.stroke();
            }
        }
        
        
        // Сначала преобразуем все точки в экранные координаты
        const points = [...this.points];
        const screenPoints = points.map(point => ({
            ...point,
            screen: this.pointToScreen(point, width, height)
        }));

        if (this.circular) {
            screenPoints.push(screenPoints[0]);
        }
        
        // Отрисовка кривой
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        
        this.ctx.moveTo(screenPoints[0].screen.x, screenPoints[0].screen.y);
        
        for (let i = 1; i < screenPoints.length; i++) {
            const prev = screenPoints[i - 1];
            const curr = screenPoints[i];
            
            // Вычисляем направление касательной как вектор к соседним точкам
            const tension = 0.2; // Коэффициент натяжения кривой
            
            // Для первой точки сегмента
            let prevDx = 0, prevDy = 0;
            if (i > 1) {
                // Если есть предыдущая точка, используем её для направления
                prevDx = (curr.screen.x - screenPoints[i - 2].screen.x) * tension;
                prevDy = (curr.screen.y - screenPoints[i - 2].screen.y) * tension;
            } else {
                // Для первой точки используем только направление к следующей
                prevDx = (curr.screen.x - prev.screen.x) * tension;
                prevDy = (curr.screen.y - prev.screen.y) * tension;
            }
            
            // Для второй точки сегмента
            let nextDx = 0, nextDy = 0;
            if (i < screenPoints.length - 1) {
                // Если есть следующая точка, используем её для направления
                nextDx = (screenPoints[i + 1].screen.x - prev.screen.x) * tension;
                nextDy = (screenPoints[i + 1].screen.y - prev.screen.y) * tension;
            } else {
                // Для последней точки используем только направление от предыдущей
                nextDx = (curr.screen.x - prev.screen.x) * tension;
                nextDy = (curr.screen.y - prev.screen.y) * tension;
            }

            if (this.circular) {
                this.ctx.lineTo(curr.screen.x, curr.screen.y);
            } else {
                this.ctx.bezierCurveTo(
                    prev.screen.x + prevDx,
                    prev.screen.y + prevDy,
                    curr.screen.x - nextDx,
                    curr.screen.y - nextDy,
                    curr.screen.x,
                    curr.screen.y
                );
            }
        }
        this.ctx.stroke();
        
        // Отрисовка точек
        screenPoints.forEach(point => {
            this.ctx.beginPath();
            this.ctx.fillStyle = point.color || '#fff';
            this.ctx.arc(
                point.screen.x,
                point.screen.y,
                5,
                0,
                Math.PI * 2
            );
            this.ctx.fill();
        });
    }

    updateTexture() {
        if (!this.onChange) return;

        const imageData = new ImageData(this.textureSize, 1);
        const data = imageData.data;
        
        const points = [...this.points].sort((a, b) => a.x - b.x);
        
        for (let x = 0; x < this.textureSize; x++) {
            const normalizedX = x / (this.textureSize - 1);
            
            let leftPoint = points[0];
            let rightPoint = points[points.length - 1];
            
            for (let i = 0; i < points.length - 1; i++) {
                if (normalizedX >= points[i].x && normalizedX <= points[i + 1].x) {
                    leftPoint = points[i];
                    rightPoint = points[i + 1];
                    break;
                }
            }
            
            let value;
            if (leftPoint === rightPoint) {
                value = leftPoint.y;
            } else {
                const t = (normalizedX - leftPoint.x) / (rightPoint.x - leftPoint.x);
                {
                    // Кубическая интерполяция Эрмита для остальных сплайнов
                    const t2 = t * t;
                    const t3 = t2 * t;
                    const h1 = 2 * t3 - 3 * t2 + 1;
                    const h2 = -2 * t3 + 3 * t2;
                    value = h1 * leftPoint.y + h2 * rightPoint.y;
                }
            }
            
            const pixelIndex = x * 4;
            const colorValue = Math.round(value * 255);
            data[pixelIndex] = colorValue;
            data[pixelIndex + 1] = colorValue;
            data[pixelIndex + 2] = colorValue;
            data[pixelIndex + 3] = 255;

            this.textureData[pixelIndex] = colorValue;
            this.textureData[pixelIndex + 1] = colorValue;
            this.textureData[pixelIndex + 2] = colorValue;
            this.textureData[pixelIndex + 3] = 255;
        }
        
        if (!this.texture) {
            this.texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }
        
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            this.textureSize,
            1,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            data
        );
        
        if (this.onChange) {
            this.onChange(this.texture);
        }
    }

    getTexture() {
        return this.texture;
    }

    // Получить текущие точки сплайна
    getValue() {
        return this.points.map(point => ({...point}));
    }

    // Установить новые точки сплайна
    setValue(newPoints) {
        if (newPoints === undefined) {
            this.reset();
            return;
        }
        this.points = newPoints.map(point => ({...point}));
        this.updateTexture();
        this.render();
    }

    reset() {
        this.setValue(this.defaultPoints);
    }

    // Преобразование координат из пространства точек в пространство экрана
    pointToScreen(point, width, height) {
        if (this.circular) {
            const angle = (point.x * Math.PI * 2) - Math.PI / 2; // Начинаем с -90 градусов (сверху)
            const radius = point.y * Math.min(width, height) / 2;
            const centerX = width / 2;
            const centerY = height / 2;
            return {
                x: centerX + radius * Math.cos(angle),
                y: centerY + radius * Math.sin(angle),
                color: point.color
            };
        }
        return {
            x: point.x * width,
            y: (1 - point.y) * height,
            color: point.color
        };
    }

    // Преобразование координат из пространства экрана в пространство точек
    screenToPoint(x, y, width, height) {
        if (this.circular) {
            const centerX = width / 2;
            const centerY = height / 2;
            const dx = x - centerX;
            const dy = y - centerY;
            let angle = Math.atan2(dy, dx) + Math.PI / 2; // Добавляем 90 градусов
            if (angle < 0) angle += Math.PI * 2;
            const radius = Math.sqrt(dx * dx + dy * dy);
            const maxRadius = Math.min(width, height) / 2;
            return {
                x: angle / (Math.PI * 2),
                y: Math.min(1, Math.max(0, radius / maxRadius))
            };
        }
        return {
            x: x / width,
            y: 1 - y / height
        };
    }

    // Преобразование координат мыши в пространство точек
    mouseToPoint(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        return this.screenToPoint(x, y, rect.width, rect.height);
    }

    // Ограничение угла между минимальным и максимальным значением
    clampAngle(angle, min, max) {
        // Нормализуем углы к диапазону [0, 2π]
        const normalizedAngle = angle % 1.0;
        const normalizedMin = min % 1.0;
        const normalizedMax = max % 1.0;
        
        let result = normalizedAngle;
        
        if (normalizedAngle < 0) {
            result += 1.0;
        }
        
        // Если минимальный угол больше максимального, это означает, что диапазон пересекает 0
        if (normalizedMin > normalizedMax) {
            if (result > normalizedMin || result < normalizedMax) {
                return result;
            }
            // Выбираем ближайшую границу
            return (result - normalizedMin < normalizedMax - result) ? normalizedMax : normalizedMin;
        } else {
            if (result < normalizedMin) {
                return normalizedMin;
            }
            if (result > normalizedMax) {
                return normalizedMax;
            }
            return result;
        }
    }

    // Добавляем метод для очистки при уничтожении компонента
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
        // Удаляем другие слушатели событий если они есть
        document.removeEventListener('mousemove', this.handleMove);
        document.removeEventListener('mouseup', this.handleUp);
    }
} 