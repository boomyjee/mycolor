import { SplineEditor, hsvToRgb } from './SplineEditor.js';
import { Picker2D } from './Picker2D.js';
import { Slider } from './Slider.js';
import { Checkbox } from './Checkbox.js';
import { inputSpaces, outputSpaces } from './colorSpaces.js';
import { UploadButton } from './UploadButton.js';
import { SceneManager } from './SceneManager.js';
import { create3DLutTexture, generateLUT, exportLUTAsCube } from './exportLUT.js';

// Загрузка шейдера
let vertexShaderSource = `#version 300 es
    in vec4 aVertexPosition;
    in vec2 aTextureCoord;
    
    out vec2 vUv;
    
    void main() {
        gl_Position = aVertexPosition;
        vUv = aTextureCoord;
    }
`;

let fragmentShaderSource = '';
let fragmentShaderTemplate = '';
let sceneManager;

// Загрузка фрагментного шейдера
fetch('assets/shader.glsl')
    .then(response => response.text())
    .then(async text => {
        fragmentShaderTemplate = text;
        initWebGL();
        sceneManager = new SceneManager(getInterfaceState, setInterfaceState);
    });

// Инициализация WebGL
export let gl;
let program;
let texture;
let imageAspectRatio = 1.0;

// Текстуры сплайнов
let hvsSplineTexture = null;
let svsSplineTexture = null;
let lvsSplineTexture = null;
let lvlSplineTexture = null;
let hvlSplineTexture = null;

// Коэффициенты для расчета теней и светов
const COEFFICIENTS = [
    0.7241065241966241, 0.38032959880647427, 0.34893263968361626,
    0.7835911868134677, 0.5300864625456815, 0.2766857286769332,
    0.8271730047148866, 0.6787247844882949, 0.18326072978879046,
    0.8300257270376946, 0.8174593916039772, 0.13592703408556722,
    0.7406067120307717, 0.8372307837782795, 0.34289432442093193,
    0.6539930498811265, 0.8369045991706899, 0.48298164483906014,
    0.5564548549841858, 0.8418846940401803, 0.6307019025287327,
    0.4244593376605096, 0.8383847426091521, 0.7833550941371147,
    0.360113919906843, 0.8208607739878486, 0.9081093742083968,
    0.5220658424842441, 0.7993179189046314, 0.9583201462123344,
    0.6398980209684421, 0.7601588749163941, 0.9565857000218989,
    0.7212096931791545, 0.7109022154458666, 0.9461554300141622,
    0.7302135229590574, 0.6171260999547182, 0.910414970864051,
    0.7405137392866862, 0.4942038730729897, 0.8095220428319969,
    0.7350935645049326, 0.36828980677764583, 0.6505922452623222,
    0.7225540492264427, 0.3421089635952578, 0.49381191031819593
];

const COEF_GROUPS = COEFFICIENTS.length / 3;

function calculateValues(angle, distance, baseValue) {
    var t = angle;
    var n = distance;
    var e = baseValue;
    var ag = COEFFICIENTS;
    var lg = COEF_GROUPS;

    e *= 1 - n;
    const s = (t /= 360) * lg
      , o = Math.floor(s)
      , r = 3 * o
      , a = (o + 1) % lg * 3
      , l = s - o
      , c = 1 - l;
    var res = [
        e + n * (ag[r] * c + ag[a] * l),
        e + n * (ag[r + 1] * c + ag[a + 1] * l),
        e + n * (ag[r + 2] * c + ag[a + 2] * l),
        t    
    ];
    return res;
}

// Глобальные переменные для рендеринга
let positionBuffer;
let textureCoordBuffer;
let textureCoordBufferFlipped;
let positionAttributeLocation;
let textureCoordAttributeLocation;
let samplerUniformLocation;
let uniforms;
let emptyTexture2D;
let emptyTexture3D;
let colorVolumeX = 0.5, colorVolumeY = 0.5;
let colorBalanceX = 0.5, colorBalanceY = 0.5;
let shadowsAngle = 0, shadowsDistance = 0;
let highlightsAngle = 0, highlightsDistance = 0;

// Глобальные переменные для текстур LUT
let idtLutTexture = null;
let odtLutTexture = null;

// Глобальные переменные для видео
let videoElement = null;
let videoHandle = null;
let videoDirectory = null;
let isVideoPlaying = false;
let renderStarted = false;
let renderPaused = false;

// Получаем элементы управления видео
const videoControls = {
    playPauseBtn: document.querySelector('.video-controls .play-pause-btn'),
    videoProgress: document.querySelector('.video-controls .video-progress'),
    progressBar: document.querySelector('.video-controls .video-progress-bar')
};

// Глобальные переменные для пикеров
let colorVolumePicker, colorBalancePicker, shadowsPicker, highlightsPicker;
let uploadButton; // Добавляем глобальную переменную для кнопки загрузки

// Глобальные переменные для слайдеров
let exposureSlider, contrastSlider, temperatureSlider, saturationSlider,
    separationSlider, densitySlider, lumaSlider, spectralMixSlider,
    blackPointRSlider, blackPointGSlider, blackPointBSlider,
    whitePointRSlider, whitePointGSlider, whitePointBSlider;

// Глобальные переменные для редакторов сплайнов
let hvsSplineEditor, svsSplineEditor, lvsSplineEditor, lvlSplineEditor, hvlSplineEditor;
let refractShadowsEditor, refractHighlightsEditor;
let showSeparationMaskCheckbox;

// Функция рендеринга
export function render(options = {}) {
    
    const {
        targetFramebuffer = null,
        targetViewport = null,
        inputTexture = texture,
        flipTexture = false
    } = options;

    if (renderPaused && !targetFramebuffer) {
        requestAnimationFrame(() => render());
        return;
    }

    // Если видео воспроизводится, обновляем текстуру
    if (videoElement && isVideoPlaying && !videoElement.paused) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoElement);
    }

    // Устанавливаем target framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFramebuffer);

    // Устанавливаем viewport
    if (targetViewport) {
        gl.viewport(...targetViewport);
    } else {
        resizeCanvasToDisplaySize(gl.canvas);
    }

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);

    // Установка атрибутов
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, options.flipTexture ? textureCoordBufferFlipped : textureCoordBuffer);
    gl.enableVertexAttribArray(textureCoordAttributeLocation);
    gl.vertexAttribPointer(textureCoordAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    // Установка текстур
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTexture);
    gl.uniform1i(samplerUniformLocation, 0);

    // Установка пустых текстур для остальных сэмплеров
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, emptyTexture2D);
    gl.uniform1i(gl.getUniformLocation(program, 'tMask'), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_3D, emptyTexture3D);
    gl.uniform1i(gl.getUniformLocation(program, 'tHalCSP'), 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, hvsSplineTexture || emptyTexture2D);
    gl.uniform1i(gl.getUniformLocation(program, 'hvsSpline'), 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, svsSplineTexture || emptyTexture2D);
    gl.uniform1i(gl.getUniformLocation(program, 'svsSpline'), 4);

    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, lvsSplineTexture || emptyTexture2D);
    gl.uniform1i(gl.getUniformLocation(program, 'lvsSpline'), 5);

    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, lvlSplineTexture || emptyTexture2D);
    gl.uniform1i(gl.getUniformLocation(program, 'lvlSpline'), 6);

    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, hvlSplineTexture || emptyTexture2D);
    gl.uniform1i(gl.getUniformLocation(program, 'hvlSpline'), 7);

    // Привязываем IDT LUT текстуру
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_3D, idtLutTexture || emptyTexture3D);
    gl.uniform1i(uniforms.lut_idt, 8);

    // Привязываем ODT LUT текстуру
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_3D, odtLutTexture || emptyTexture3D);
    gl.uniform1i(uniforms.lut_odt, 9);

    // Получаем значения из пикеров
    let [colorVolumeX, colorVolumeY] = colorVolumePicker.getValue();
    let [colorBalanceX, colorBalanceY] = colorBalancePicker.getValue();
    let [shadowsAngle, shadowsDistance] = shadowsPicker.getValue();
    let [highlightsAngle, highlightsDistance] = highlightsPicker.getValue();

    // Установка униформ
    gl.uniform1f(uniforms.bypass, 0.0);
    gl.uniform1f(uniforms.iExposure, exposureSlider.getValue());
    gl.uniform1f(uniforms.iContrast, contrastSlider.getValue());
    gl.uniform1f(uniforms.iTemperature, temperatureSlider.getValue());
    gl.uniform1f(uniforms.iSaturation, saturationSlider.getValue());
    gl.uniform3f(uniforms.compHSV, 0.0, 0.0, 0.0);
    const balanceX = (2 * colorBalanceX - 1) / 10;
    const balanceY = 0.5 * (2 * colorBalanceY - 1) * 0.5226 * 0.1;
    gl.uniform2f(uniforms.colorBalance, balanceX, balanceY);
    
    const shadowValues = calculateValues(shadowsAngle, shadowsDistance, 0);
    gl.uniform4f(uniforms.shadows, shadowValues[0], shadowValues[1], shadowValues[2], shadowValues[3]);
    
    const highlightValues = calculateValues(highlightsAngle, highlightsDistance, 1);
    gl.uniform4f(uniforms.highlights, highlightValues[0], highlightValues[1], highlightValues[2], highlightValues[3]);

    gl.uniform1f(uniforms.separation, separationSlider.getValue());
    gl.uniform1f(uniforms.densityMix, densitySlider.getValue());
    gl.uniform1f(uniforms.lumaMix, lumaSlider.getValue());
    gl.uniform2f(uniforms.maskProps, 0.0, 0.0);
    gl.uniform1i(uniforms.showKeyMask, 0);
    gl.uniform1i(uniforms.showSeparationMask, showSeparationMaskCheckbox.getValue() ? 1 : 0);
    gl.uniform1f(uniforms.spectralMix, spectralMixSlider.getValue());
    const volumeX = 2 * colorVolumeX;
    const volumeY = colorVolumeY < 0.5 ? Math.pow(2, colorVolumeY - 0.5) : 0.2 * (colorVolumeY - 0.5) * 2;
    gl.uniform2f(uniforms.colorVolume, volumeX, volumeY);

    const refractionShadowsValues = refractShadowsEditor.getValue();
    const refractionHighlightsValues = refractHighlightsEditor.getValue();

    for (let i=0; i<6; i++) {
        gl.uniform4f(
            uniforms[`mapVec${i}`], 
            refractionShadowsValues[i].x*360, 
            refractionShadowsValues[i].y*2, 
            refractionHighlightsValues[i].x*360, 
            refractionHighlightsValues[i].y*2
        );
    }

    // Установка значений для точек черного и белого
    const blackPointR = blackPointRSlider.getValue() * 2 - 1;
    const blackPointG = blackPointGSlider.getValue() * 2 - 1;
    const blackPointB = blackPointBSlider.getValue() * 2 - 1;
    
    const whitePointR = whitePointRSlider.getValue() * 2;
    const whitePointG = whitePointGSlider.getValue() * 2;
    const whitePointB = whitePointBSlider.getValue() * 2;

    gl.uniform3f(uniforms.blackPoint, blackPointR, blackPointG, blackPointB);
    gl.uniform3f(uniforms.whitePoint, whitePointR, whitePointG, whitePointB);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Если это основной рендер (не в текстуру), запрашиваем следующий кадр
    if (!targetFramebuffer) {
        requestAnimationFrame(() => render());
    }
}

function initWebGL() {
    const canvas = document.getElementById('glCanvas');
    gl = canvas.getContext('webgl2');

    if (!gl) {
        alert('WebGL 2.0 не поддерживается в вашем браузере');
        return;
    }

    // Создание буферов
    positionBuffer = gl.createBuffer();
    textureCoordBuffer = gl.createBuffer();
    textureCoordBufferFlipped = gl.createBuffer();

    // Установка позиций вершин
    const positions = new Float32Array([
        -1.0, -1.0,
         1.0, -1.0,
        -1.0,  1.0,
         1.0,  1.0,
    ]);

    // Установка текстурных координат
    const textureCoords = new Float32Array([
        0.0, 1.0,  // Нижний левый
        1.0, 1.0,  // Нижний правый
        0.0, 0.0,  // Верхний левый
        1.0, 0.0,  // Верхний правый
    ]);

    const textureCoordsFlipped = new Float32Array([
        0.0, 0.0,  // Нижний левый
        1.0, 0.0,  // Нижний правый
        0.0, 1.0,  // Верхний левый
        1.0, 1.0,  // Верхний правый
    ]);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, textureCoords, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBufferFlipped);
    gl.bufferData(gl.ARRAY_BUFFER, textureCoordsFlipped, gl.STATIC_DRAW);

    // Создание текстур
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Создание пустых текстур для разных типов сэмплеров
    emptyTexture2D = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, emptyTexture2D);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

    emptyTexture3D = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, emptyTexture3D);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

    // Инициализация редакторов сплайнов
    hvsSplineEditor = new SplineEditor('hvsSplineEditor', {
        points: [
            { x: 0, y: 0.5 },
            { x: 0.2, y: 0.5 },
            { x: 0.4, y: 0.5 },
            { x: 0.6, y: 0.5 },
            { x: 0.8, y: 0.5 },
            { x: 1, y: 0.5 }
        ],
        onChange: (texture) => {
            hvsSplineTexture = texture;
        },
        firstIsLast: true
    });

    svsSplineEditor = new SplineEditor('svsSplineEditor', {
        points: [
            { x: 0, y: 0.5 },
            { x: 0.33, y: 0.5 },
            { x: 0.67, y: 0.5 },
            { x: 1, y: 0.5 }
        ],
        onChange: (texture) => {
            svsSplineTexture = texture;
        },
        stopColorFunction: (x,y) => {
            return hsvToRgb(0,x+y-0.5,0.5)
        }
    });

    lvsSplineEditor = new SplineEditor('lvsSplineEditor', {
        points: [
            { x: 0, y: 0.5 },
            { x: 0.25, y: 0.5 },
            { x: 0.5, y: 0.5 },
            { x: 0.75, y: 0.5 },
            { x: 1, y: 0.5 }
        ],
        onChange: (texture) => {
            lvsSplineTexture = texture;
        },
        stopColorFunction: (x,y) => {
            return hsvToRgb(0,y,x)
        }
    });

    lvlSplineEditor = new SplineEditor('lvlSplineEditor', {
        points: [
            { x: 0, y: 0 },
            { x: 0.2, y: 0.2 },
            { x: 0.4, y: 0.4 },
            { x: 0.6, y: 0.6 },
            { x: 0.8, y: 0.8 },
            { x: 1, y: 1 }
        ],
        onChange: (texture) => {
            lvlSplineTexture = texture;
        },
        stopColorFunction: (x,y) => {
            return [y*255,y*255,y*255]
        }
    });

    hvlSplineEditor = new SplineEditor('hvlSplineEditor', {
        points: [
            { x: 0, y: 0.5 },
            { x: 0.2, y: 0.5 },
            { x: 0.4, y: 0.5 },
            { x: 0.6, y: 0.5 },
            { x: 0.8, y: 0.5 },
            { x: 1, y: 0.5 }
        ],
        onChange: (texture) => {
            hvlSplineTexture = texture;
        },
        stopColorFunction: (x,y) => {
            return hsvToRgb(x,1,y*0.5)
        },
        firstIsLast: true
    });

    refractShadowsEditor = new SplineEditor('refractShadowsEditor', {
        points: [
            { x: 0, y: 0.5, color: 'red' },
            { x: 1/6.0, y: 0.5, color: 'yellow' },
            { x: 2/6.0, y: 0.5, color: 'green' },
            { x: 3/6.0, y: 0.5, color: 'cyan'  },
            { x: 4/6.0, y: 0.5, color: 'blue' },
            { x: 5/6.0, y: 0.5, color: 'magenta' }
        ],
        circular: true
    });

    refractHighlightsEditor = new SplineEditor('refractHighlightsEditor', {
        points: [
            { x: 0, y: 0.5, color: 'red' },
            { x: 1/6.0, y: 0.5, color: 'yellow' },
            { x: 2/6.0, y: 0.5, color: 'green' },
            { x: 3/6.0, y: 0.5, color: 'cyan'  },
            { x: 4/6.0, y: 0.5, color: 'blue' },
            { x: 5/6.0, y: 0.5, color: 'magenta' }
        ],
        circular: true
    });
    

    // Инициализация 2D слайдеров
    colorVolumePicker = new Picker2D('colorVolumePicker');
    colorBalancePicker = new Picker2D('colorBalancePicker');
    shadowsPicker = new Picker2D('shadowsPicker', null, { circular: true });
    highlightsPicker = new Picker2D('highlightsPicker', null, { circular: true });

    // Инициализация слайдеров
    exposureSlider = new Slider('exposure');
    contrastSlider = new Slider('contrast');
    temperatureSlider = new Slider('temperature');
    saturationSlider = new Slider('saturation');
    separationSlider = new Slider('separation');
    showSeparationMaskCheckbox = new Checkbox('showSeparationMask');

    densitySlider = new Slider('density');
    lumaSlider = new Slider('luma');
    spectralMixSlider = new Slider('spectralMix');
    
    // Слайдеры для точек черного и белого
    blackPointRSlider = new Slider('blackPointR');
    blackPointGSlider = new Slider('blackPointG');
    blackPointBSlider = new Slider('blackPointB');
    whitePointRSlider = new Slider('whitePointR');
    whitePointGSlider = new Slider('whitePointG');
    whitePointBSlider = new Slider('whitePointB');

    const sliderGroups = {
        blackPoint: [blackPointRSlider, blackPointGSlider, blackPointBSlider],
        whitePoint: [whitePointRSlider, whitePointGSlider, whitePointBSlider]
    };

    for (const [groupName, sliders] of Object.entries(sliderGroups)) {
        const groupElement = document.querySelector('.control-group:has(#' + groupName + 'R)');
        groupElement.querySelector('h3').addEventListener('click', () => {
            groupElement.dataset.linked = groupElement.dataset.linked === 'true' ? 'false' : 'true';
        });

        sliders.forEach(slider => {
            slider.prevValue = slider.getValue();
            slider.onChange = (value,type) => {
                if (type=='input') {
                    const delta = value - slider.prevValue;
                    sliders.forEach(s => {
                        if (s !== slider && groupElement.dataset.linked === 'true') s.setValue(s.getValue() + delta);
                    });
                }
                slider.prevValue = value;
            };
        });
    };

    const inputSpaceSelect = document.getElementById('inputSpace');
    const outputSpaceSelect = document.getElementById('outputSpace');

    // Добавляем обработчики событий
    inputSpaceSelect.addEventListener('change', updateColorSpaces);
    outputSpaceSelect.addEventListener('change', updateColorSpaces);

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            const tabContent = document.getElementById(tab.dataset.tab);
            tabContent.classList.add('active');
        });
    });


    // Добавляем обработчик для кнопки экспорта
    document.getElementById('exportLutBtn').addEventListener('click', () => {
        const lutSize = 64; // Стандартный размер LUT
        const lutData = generateLUT(lutSize);
        exportLUTAsCube(lutData, lutSize);
    });    
}

function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        //alert('Ошибка компиляции шейдера: ' + gl.getShaderInfoLog(shader));
        console.log('Shader type:', type)
        console.log('Shader source:', source);
        console.log('Shader error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

export function resizeCanvasToDisplaySize(canvas) {
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    
    // Сохраняем пропорции изображения
    const containerAspectRatio = displayWidth / displayHeight;
    
    if (containerAspectRatio > imageAspectRatio) {
        // Контейнер шире изображения
        canvas.width = displayHeight * imageAspectRatio;
        canvas.height = displayHeight;
    } else {
        // Контейнер выше изображения
        canvas.width = displayWidth;
        canvas.height = displayWidth / imageAspectRatio;
    }
    
    // Устанавливаем viewport для WebGL
    gl.viewport(0, 0, canvas.width, canvas.height);
}

// Инициализируем кнопку загрузки
uploadButton = new UploadButton('uploadBtn', async (file, fileHandle) => {
    if (!file || file.type.startsWith('image/')) {
        // Останавливаем видео если оно воспроизводится
        if (videoElement && !videoElement.paused) {
            videoElement.pause();
            isVideoPlaying = false;
        }
        
        // Очищаем источник видео
        if (videoElement) {
            videoElement.removeAttribute('src');
        }
    }
    if (!file) {
        const img = new Image();
        img.src = 'assets/test.jpg';
        await img.decode();
        imageAspectRatio = img.width / img.height;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        return;
    }

    // Определяем тип файла
    if (file.type.startsWith('image/')) {

        var blob = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                resolve(e.target.result);
            };
            reader.onerror = function(e) {
                reject(e);
            };
            reader.readAsDataURL(file);
        });
        const img = new Image();
        img.src = blob;
        await img.decode();
        imageAspectRatio = img.width / img.height;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

    } else if (file.type.startsWith('video/')) {
        // Если это видео
        // Сохраняем ссылки на директорию и файл
        videoHandle = fileHandle;

        // Создаем элемент video если его еще нет
        if (!videoElement) {
            videoElement = document.createElement('video');
            videoElement.style.display = 'none';
            videoElement.playsInline = true;
            videoElement.loop = true;
            videoElement.muted = true;
            videoElement.autoplay = false;
            document.body.appendChild(videoElement);

            // Обновляем текстуру при каждом новом кадре видео
            videoElement.addEventListener('timeupdate', () => {
                if (!videoElement.paused) {
                    gl.bindTexture(gl.TEXTURE_2D, texture);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoElement);
                    
                    // Обновляем прогресс-бар
                    const progress = (videoElement.currentTime / videoElement.duration) * 100;
                    videoControls.progressBar.style.width = `${progress}%`;
                }
            });
        }

        // Создаем URL для видео
        const videoURL = URL.createObjectURL(file);
        videoElement.src = videoURL;

        // Когда метаданные загружены, обновляем соотношение сторон
        videoElement.onloadedmetadata = () => {
            imageAspectRatio = videoElement.videoWidth / videoElement.videoHeight;
            // Устанавливаем текущее время на 0 и ждем обновления для отображения первого кадра
            videoElement.currentTime = 0;
            videoElement.addEventListener('seeked', function onSeeked() {
                // Обновляем текстуру с первым кадром
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoElement);
                // Удаляем этот одноразовый обработчик
                videoElement.removeEventListener('seeked', onSeeked);
            });
        };

        // Очищаем URL после загрузки
        videoElement.onload = () => {
            URL.revokeObjectURL(videoURL);
        };
    }
    updateVideoControlsVisibility();
});

// Обработчик для кнопки Play/Pause
videoControls.playPauseBtn.onclick = () => {
    if (!videoElement) return;
    
    if (videoElement.paused) {
        videoElement.play();
        isVideoPlaying = true;
        videoControls.playPauseBtn.classList.add('playing');
    } else {
        videoElement.pause();
        isVideoPlaying = false;
        videoControls.playPauseBtn.classList.remove('playing');
    }
};

// Обработчик для полосы прогресса
videoControls.videoProgress.addEventListener('click', (e) => {
    if (!videoElement) return;
    
    const rect = videoControls.videoProgress.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    videoElement.currentTime = pos * videoElement.duration;
});

// Функция для обновления видимости элементов управления видео
function updateVideoControlsVisibility() {
    const isVideo = videoElement && videoElement.hasAttribute('src');
    const videoControls = document.querySelector('.video-controls');
    
    if (isVideo) {
        videoControls.style.display = 'flex';
    } else {
        videoControls.style.display = 'none';
    }
}
updateVideoControlsVisibility();

let currentInputSpace = null;
let currentOutputSpace = null;
async function updateColorSpaces() {

    const inputSpace = document.getElementById('inputSpace').value;
    const outputSpace = document.getElementById('outputSpace').value;

    if (currentInputSpace === inputSpace && currentOutputSpace === outputSpace) return;

    currentInputSpace = inputSpace;
    currentOutputSpace = outputSpace;
    
    // Получаем соответствующие функции преобразования
    const inputSpaceData = inputSpaces[inputSpace];
    const outputSpaceData = outputSpaces[outputSpace];
    
    if (!inputSpaceData || !outputSpaceData) {
        console.error('Color space not found:', inputSpace, outputSpace);
        return;
    }

    // Загружаем LUT если они есть
    if (inputSpaceData.lut) {
        // Удаляем старую текстуру если она существует
        if (idtLutTexture) {
            gl.deleteTexture(idtLutTexture);
        }
        idtLutTexture = await create3DLutTexture(inputSpaceData.lut);
    }

    if (outputSpaceData.lut) {
        if (odtLutTexture) {
            gl.deleteTexture(odtLutTexture);
        }
        odtLutTexture = await create3DLutTexture(outputSpaceData.lut);
    }

    const idtFunction = inputSpaceData.idt;
    const odtFunction = outputSpaceData.odt;

    // Обновляем текст шейдера
    let text = fragmentShaderTemplate;
    let updatedShader = text;
    
    // Находим маркеры и обновляем функции
    const idtMarker = '/*idt0*/';
    const odtMarker = '/*odt0*/';
    
    // Добавляем IDT функцию
    const idtIndex = updatedShader.indexOf(idtMarker);
    if (idtIndex !== -1) {
        updatedShader = updatedShader.substring(0, idtIndex) +
            `/*idt0*/\n${idtFunction}\n` +
            updatedShader.substring(idtIndex + idtMarker.length);
    } else {
        console.error('IDT function not found');
    }
    
    // Добавляем ODT функцию
    const odtIndex = updatedShader.indexOf(odtMarker);
    if (odtIndex !== -1) {
        updatedShader = updatedShader.substring(0, odtIndex) +
            `/*odt0*/\n${odtFunction}\n` +
            updatedShader.substring(odtIndex + odtMarker.length);
    } else {
        console.error('ODT function not found');
    }
    
    // Обновляем шейдер
    fragmentShaderSource = updatedShader;
    
    // Перекомпилируем шейдер
    const newFragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    // Создаем новую программу
    const newProgram = gl.createProgram();
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    
    gl.attachShader(newProgram, vertexShader);
    gl.attachShader(newProgram, newFragmentShader);
    gl.linkProgram(newProgram);
    
    if (!gl.getProgramParameter(newProgram, gl.LINK_STATUS)) {
        console.error('Ошибка линковки программы:', gl.getProgramInfoLog(newProgram));
        return;
    }
    
    // Удаляем старую программу и обновляем ссылку
    gl.deleteProgram(program);
    program = newProgram;
    
    // Переинициализируем униформы
    uniforms = {
        bypass: gl.getUniformLocation(program, 'bypass'),
        iExposure: gl.getUniformLocation(program, 'iExposure'),
        iContrast: gl.getUniformLocation(program, 'iContrast'),
        iTemperature: gl.getUniformLocation(program, 'iTemperature'),
        iSaturation: gl.getUniformLocation(program, 'iSaturation'),
        compHSV: gl.getUniformLocation(program, 'compHSV'),
        colorBalance: gl.getUniformLocation(program, 'colorBalance'),
        shadows: gl.getUniformLocation(program, 'shadows'),
        highlights: gl.getUniformLocation(program, 'highlights'),
        separation: gl.getUniformLocation(program, 'separation'),
        densityMix: gl.getUniformLocation(program, 'densityMix'),
        lumaMix: gl.getUniformLocation(program, 'lumaMix'),
        maskProps: gl.getUniformLocation(program, 'maskProps'),
        showKeyMask: gl.getUniformLocation(program, 'showKeyMask'),
        showSeparationMask: gl.getUniformLocation(program, 'showSeparationMask'),
        spectralMix: gl.getUniformLocation(program, 'spectralMix'),
        colorVolume: gl.getUniformLocation(program, 'colorVolume'),
        blackPoint: gl.getUniformLocation(program, 'blackPoint'),
        whitePoint: gl.getUniformLocation(program, 'whitePoint'),
        mapVec0: gl.getUniformLocation(program, 'mapVec0'),
        mapVec1: gl.getUniformLocation(program, 'mapVec1'),
        mapVec2: gl.getUniformLocation(program, 'mapVec2'),
        mapVec3: gl.getUniformLocation(program, 'mapVec3'),
        mapVec4: gl.getUniformLocation(program, 'mapVec4'),
        mapVec5: gl.getUniformLocation(program, 'mapVec5'),
        lut_idt: gl.getUniformLocation(program, 'lut_idt'),
        lut_odt: gl.getUniformLocation(program, 'lut_odt')
    };

    // Получение атрибутов
    positionAttributeLocation = gl.getAttribLocation(program, 'aVertexPosition');
    textureCoordAttributeLocation = gl.getAttribLocation(program, 'aTextureCoord');
    samplerUniformLocation = gl.getUniformLocation(program, 'tInput');
}

async function getInterfaceState() {
    const state = {
        // Сохраняем значения слайдеров
        sliders: {
            exposure: exposureSlider.getValue(),
            contrast: contrastSlider.getValue(),
            temperature: temperatureSlider.getValue(),
            saturation: saturationSlider.getValue(),
            separation: separationSlider.getValue(),
            density: densitySlider.getValue(),
            luma: lumaSlider.getValue(),
            spectralMix: spectralMixSlider.getValue(),
            blackPointR: blackPointRSlider.getValue(),
            blackPointG: blackPointGSlider.getValue(),
            blackPointB: blackPointBSlider.getValue(),
            whitePointR: whitePointRSlider.getValue(),
            whitePointG: whitePointGSlider.getValue(),
            whitePointB: whitePointBSlider.getValue()
        },
        
        // Сохраняем значения пикеров
        pickers: {
            colorVolume: colorVolumePicker.getValue(),
            colorBalance: colorBalancePicker.getValue(),
            shadows: shadowsPicker.getValue(),
            highlights: highlightsPicker.getValue()
        },
        
        // Сохраняем состояния сплайнов
        splines: {
            hvs: hvsSplineEditor.getValue(),
            svs: svsSplineEditor.getValue(),
            lvs: lvsSplineEditor.getValue(),
            lvl: lvlSplineEditor.getValue(),
            hvl: hvlSplineEditor.getValue(),
            refractShadows: refractShadowsEditor.getValue(),
            refractHighlights: refractHighlightsEditor.getValue()
        },

        // Сохраняем состояние чекбокса
        checkboxes: {
            showSeparationMask: showSeparationMaskCheckbox.getValue()
        },

        // Сохраняем выбранные цветовые пространства
        colorSpaces: {
            input: document.getElementById('inputSpace').value,
            output: document.getElementById('outputSpace').value
        },
        fileHandle: uploadButton.getValue()
    };
    return state;
}

async function setInterfaceState(state) {

    renderPaused = true;
    state = state || {};

    exposureSlider.setValue(state?.sliders?.exposure);
    contrastSlider.setValue(state?.sliders?.contrast);
    temperatureSlider.setValue(state?.sliders?.temperature);
    saturationSlider.setValue(state?.sliders?.saturation);
    separationSlider.setValue(state?.sliders?.separation);
    densitySlider.setValue(state?.sliders?.density);
    
    lumaSlider.setValue(state?.sliders?.luma);
    spectralMixSlider.setValue(state?.sliders?.spectralMix);
    blackPointRSlider.setValue(state?.sliders?.blackPointR);
    blackPointGSlider.setValue(state?.sliders?.blackPointG);
    blackPointBSlider.setValue(state?.sliders?.blackPointB);
    whitePointRSlider.setValue(state?.sliders?.whitePointR);
    whitePointGSlider.setValue(state?.sliders?.whitePointG);
    whitePointBSlider.setValue(state?.sliders?.whitePointB);

    colorVolumePicker.setValue(state?.pickers?.colorVolume);
    colorBalancePicker.setValue(state?.pickers?.colorBalance);
    shadowsPicker.setValue(state?.pickers?.shadows);
    highlightsPicker.setValue(state?.pickers?.highlights);
    
    hvsSplineEditor.setValue(state?.splines?.hvs);
    svsSplineEditor.setValue(state?.splines?.svs);
    lvsSplineEditor.setValue(state?.splines?.lvs);
    lvlSplineEditor.setValue(state?.splines?.lvl);
    hvlSplineEditor.setValue(state?.splines?.hvl);
    refractShadowsEditor.setValue(state?.splines?.refractShadows);
    refractHighlightsEditor.setValue(state?.splines?.refractHighlights);

    // Восстанавливаем состояние чекбокса
    showSeparationMaskCheckbox.setValue(state?.checkboxes?.showSeparationMask);

    // Восстанавливаем выбранные цветовые пространства
    document.getElementById('inputSpace').value = state?.colorSpaces?.input || 'sRGB';
    document.getElementById('outputSpace').value = state?.colorSpaces?.output || 'sRGB';
    await updateColorSpaces();

    await uploadButton.setValue(state.fileHandle);

    renderPaused = false;
 
    if (!renderStarted) {
        renderStarted = true;        
        render();
    }
}