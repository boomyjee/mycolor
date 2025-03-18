import { gl, render, resizeCanvasToDisplaySize } from './main.js';

// Функция для создания 3D текстуры из данных LUT
export async function create3DLutTexture(url) {
    try {
        const response = await fetch(url);
        const lutData = new Float32Array(await response.json());
        
        // Предполагаем, что размер LUT - куб (например, 32x32x32)
        const size = Math.round(Math.cbrt(lutData.length/4));
        
        // Создаем текстуру
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_3D, texture);
        
        // Загружаем данные в текстуру напрямую как float
        gl.texImage3D(
            gl.TEXTURE_3D,
            0,                // уровень мипмапа
            gl.RGBA16F,       // внутренний формат (32-битный float)
            size,           // ширина
            size,           // высота
            size,           // глубина
            0,              // граница
            gl.RGBA,         // формат
            gl.FLOAT,       // тип данных
            lutData         // данные
        );

        // Устанавливаем параметры текстуры
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        
        return texture;
    } catch (error) {
        console.error('Ошибка создания LUT текстуры:', error);
        return null;
    }
}

export function generateLUT(size = 64) {
    // Создаем фреймбуфер для рендеринга
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    // Создаем текстуру для результата
    const renderTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, renderTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size * size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, renderTexture, 0);

    // Создаем входную текстуру со всеми возможными цветами
    const inputTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, inputTexture);
    
    // Создаем массив с входными цветами
    const inputData = new Uint8Array(size * size * size * 4);
    const step = 1 / (size - 1);
    
    for (let b = 0; b < size; b++) {
        for (let g = 0; g < size; g++) {
            for (let r = 0; r < size; r++) {
                const index = (b * size * size + g * size + r) * 4;
                inputData[index] = Math.round(r * step * 255);     // R
                inputData[index + 1] = Math.round(g * step * 255); // G
                inputData[index + 2] = Math.round(b * step * 255); // B
                inputData[index + 3] = 255;                        // A
            }
        }
    }

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size * size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, inputData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // Рендерим все цвета за один проход
    render({
        targetFramebuffer: framebuffer,
        targetViewport: [0, 0, size * size, size],
        inputTexture: inputTexture,
        flipTexture: true
    });

    // Читаем результат
    const pixels = new Uint8Array(size * size * size * 4);
    gl.readPixels(0, 0, size * size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Преобразуем результат в формат LUT
    const lutData = [];
    for (let i = 0; i < size * size * size; i++) {
        lutData.push([
            pixels[i * 4] / 255,
            pixels[i * 4 + 1] / 255,
            pixels[i * 4 + 2] / 255
        ]);
    }

    // Очищаем
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(renderTexture);
    gl.deleteTexture(inputTexture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Восстанавливаем viewport
    resizeCanvasToDisplaySize(gl.canvas);

    return lutData;
}

export function exportLUTAsCube(lutData, size = 64) {
    let content = '# Created by GLSL Color Editor\n';
    content += 'LUT_3D_SIZE ' + size + '\n\n';

    // Добавляем значения LUT
    lutData.forEach(color => {
        content += color.map(v => v.toFixed(6)).join(' ') + '\n';
    });

    // Создаем и скачиваем файл
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'color_grade.cube';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
} 