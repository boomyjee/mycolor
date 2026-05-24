# MyColor

Browser-based color grading tool with real-time WebGL preview and 3D LUT export for DaVinci Resolve.

![MyColor Interface](demo_files/head.png)

## What it does

MyColor is a visual color grading editor that runs entirely in the browser. You load an image or video, adjust color parameters through an interactive UI, and export the result as a 3D LUT (.cube) or a DaVinci Resolve DCTL plugin.

### Color pipeline

All color processing happens in a single GLSL fragment shader (`assets/shader.glsl`). The pipeline:

1. **Input color space transform** — converts from camera-native log/gamut (ARRI LogC, Sony S-Log3, RED Log3G10, BMD Film, etc.) to working space via 3D LUT
2. **Spectral grading** — color balance, color volume, shadow/highlight tinting with perceptual separation
3. **Density curves** — Hue vs Sat, Sat vs Sat, Lum vs Sat spline editors
4. **Luminosity curves** — Lum vs Lum, Hue vs Lum, black/white point per-channel control
5. **Basic adjustments** — exposure, contrast, temperature, saturation
6. **Output color space transform** — to display or delivery format

### Supported cameras

60+ input color spaces including ARRI, Sony, Canon, RED, Blackmagic, Panasonic, DJI, Fuji, GoPro, Nikon, Z CAM, Leica, Apple, and ACES workflows.

### Export

- **3D LUT** (.cube) — standard format, works in any grading software
- **DCTL** — DaVinci Resolve plugin (`mycolor.dctl`) with matching parameters

## UI components

- **Spline editors** — interactive curve editors with draggable control points (Hue/Sat/Lum curves)
- **2D pickers** — color balance and color volume controls (rectangular and circular modes)
- **Scene manager** — save/load/copy multiple grading presets, stored in localStorage
- **File picker** — load images from a directory with thumbnail previews
- **Video support** — load and scrub through video files with playback controls

## Running

```bash
# Start a local server (Python)
python -m http.server 8000

# Open in browser
# http://localhost:8000
```

Or just run `start.bat` on Windows.

## Structure

```
index.html              — main page
assets/
  shader.glsl           — fragment shader (color pipeline)
  styles.css            — UI styles
  luts/                 — 3D LUT data (JSON, 64^3)
  test.jpg              — default test image
src/
  main.js               — WebGL init, uniforms, render loop
  SplineEditor.js        — interactive curve editor component
  Picker2D.js            — 2D color picker (rectangular/circular)
  SceneManager.js        — preset save/load/copy
  DirectoryFilePicker.js — directory-based file browser with previews
  UploadButton.js        — file upload with drag & drop
  FileStorage.js         — File System Access API wrapper
  Slider.js              — custom slider component
  Checkbox.js            — custom checkbox component
  ContextMenu.js         — right-click context menu
  colorSpaces.js         — input/output color space definitions
  exportLUT.js           — 3D LUT generation and .cube export
mycolor.dctl            — DaVinci Resolve DCTL plugin
demo_files/             — sample media for testing
```

## Requirements

- Modern browser with WebGL 2.0 (ES 3.0) support
- No build step, no dependencies — pure HTML/JS/GLSL
