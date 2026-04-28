class FractalExplorer {
    constructor() {
        this.canvas = document.getElementById('fractal-canvas');
        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        
        if (!this.gl) {
            alert('您的浏览器不支持 WebGL，请尝试使用现代浏览器');
            return;
        }
        
        this.initState();
        this.initShaders();
        this.initBuffers();
        this.initEventListeners();
        this.resizeCanvas();
        this.render();
    }
    
    initState() {
        this.isMandelbrot = true;
        this.maxIterations = 256;
        this.zoom = 1.0;
        this.centerX = -0.5;
        this.centerY = 0.0;
        this.juliaParamX = -0.7;
        this.juliaParamY = 0.27015;
        this.currentPalette = 'fire';
        
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.touchStartDistance = 0;
        this.touchStartZoom = 1.0;
        
        this.animationFrameId = null;
        this.needsRender = true;
    }
    
    getVertexShaderSource() {
        return `
            attribute vec2 aPosition;
            attribute vec2 aTexCoord;
            varying vec2 vTexCoord;
            
            void main() {
                gl_Position = vec4(aPosition, 0.0, 1.0);
                vTexCoord = aTexCoord;
            }
        `;
    }
    
    getFragmentShaderSource() {
        return `
            precision highp float;
            
            varying vec2 vTexCoord;
            
            uniform float uZoom;
            uniform vec2 uCenter;
            uniform int uMaxIterations;
            uniform bool uIsMandelbrot;
            uniform vec2 uJuliaParam;
            uniform int uPaletteIndex;
            uniform vec2 uCanvasSize;
            
            vec3 getFireColor(float t) {
                vec3 color = vec3(0.0, 0.0, 0.0);
                color = mix(vec3(0.0, 0.0, 0.2), vec3(0.0, 0.0, 0.8), clamp(t * 2.0, 0.0, 1.0));
                color = mix(color, vec3(0.0, 0.8, 1.0), clamp((t - 0.3) * 2.0, 0.0, 1.0));
                color = mix(color, vec3(1.0, 1.0, 0.5), clamp((t - 0.6) * 2.5, 0.0, 1.0));
                color = mix(color, vec3(1.0, 0.5, 0.0), clamp((t - 0.8) * 5.0, 0.0, 1.0));
                color = mix(color, vec3(1.0, 0.0, 0.0), clamp((t - 0.9) * 10.0, 0.0, 1.0));
                return color;
            }
            
            vec3 getRainbowColor(float t) {
                float r = abs(sin(t * 6.28318 + 0.0)) * 0.8 + 0.2;
                float g = abs(sin(t * 6.28318 + 2.0944)) * 0.8 + 0.2;
                float b = abs(sin(t * 6.28318 + 4.1888)) * 0.8 + 0.2;
                return vec3(r, g, b);
            }
            
            vec3 getOceanColor(float t) {
                vec3 color = vec3(0.0, 0.0, 0.1);
                color = mix(color, vec3(0.0, 0.2, 0.6), clamp(t * 2.0, 0.0, 1.0));
                color = mix(color, vec3(0.0, 0.6, 0.8), clamp((t - 0.3) * 2.0, 0.0, 1.0));
                color = mix(color, vec3(0.2, 0.9, 0.9), clamp((t - 0.6) * 2.5, 0.0, 1.0));
                color = mix(color, vec3(0.8, 1.0, 1.0), clamp((t - 0.9) * 10.0, 0.0, 1.0));
                return color;
            }
            
            vec3 getGrayscaleColor(float t) {
                float gray = t;
                return vec3(gray, gray, gray);
            }
            
            vec3 getVibrantColor(float t) {
                vec3 c1 = vec3(0.1, 0.0, 0.3);
                vec3 c2 = vec3(0.5, 0.0, 0.8);
                vec3 c3 = vec3(0.0, 0.8, 1.0);
                vec3 c4 = vec3(1.0, 0.5, 0.0);
                vec3 c5 = vec3(1.0, 1.0, 0.5);
                
                vec3 color = c1;
                color = mix(color, c2, clamp(t * 3.0, 0.0, 1.0));
                color = mix(color, c3, clamp((t - 0.2) * 2.5, 0.0, 1.0));
                color = mix(color, c4, clamp((t - 0.5) * 3.0, 0.0, 1.0));
                color = mix(color, c5, clamp((t - 0.8) * 5.0, 0.0, 1.0));
                return color;
            }
            
            vec3 getColor(float t, int paletteIndex) {
                if (paletteIndex == 0) return getFireColor(t);
                if (paletteIndex == 1) return getRainbowColor(t);
                if (paletteIndex == 2) return getOceanColor(t);
                if (paletteIndex == 3) return getGrayscaleColor(t);
                if (paletteIndex == 4) return getVibrantColor(t);
                return getFireColor(t);
            }
            
            void main() {
                float aspectRatio = uCanvasSize.x / uCanvasSize.y;
                
                float x = (vTexCoord.x - 0.5) * 4.0 / uZoom * aspectRatio + uCenter.x;
                float y = (vTexCoord.y - 0.5) * 4.0 / uZoom + uCenter.y;
                
                float zx, zy, cx, cy;
                
                if (uIsMandelbrot) {
                    zx = 0.0;
                    zy = 0.0;
                    cx = x;
                    cy = y;
                } else {
                    zx = x;
                    zy = y;
                    cx = uJuliaParam.x;
                    cy = uJuliaParam.y;
                }
                
                float iteration = 0.0;
                float maxIter = float(uMaxIterations);
                
                for (int i = 0; i < 2048; i++) {
                    if (i >= uMaxIterations) break;
                    
                    float x2 = zx * zx;
                    float y2 = zy * zy;
                    
                    if (x2 + y2 > 4.0) break;
                    
                    zy = 2.0 * zx * zy + cy;
                    zx = x2 - y2 + cx;
                    iteration = iteration + 1.0;
                }
                
                if (iteration >= maxIter) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                    return;
                }
                
                float x2 = zx * zx;
                float y2 = zy * zy;
                float log_zn = log(x2 + y2) / 2.0;
                float nu = log(log_zn / log(2.0)) / log(2.0);
                float smoothIteration = iteration + 1.0 - nu;
                
                float t = smoothIteration / maxIter;
                t = mod(t * 8.0, 1.0);
                
                vec3 color = getColor(t, uPaletteIndex);
                
                float glow = 1.0 - exp(-smoothIteration / 50.0);
                color = color * (0.5 + glow * 0.5);
                
                gl_FragColor = vec4(color, 1.0);
            }
        `;
    }
    
    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }
    
    createProgram(vertexShader, fragmentShader) {
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('Program link error:', this.gl.getProgramInfoLog(program));
            return null;
        }
        
        return program;
    }
    
    initShaders() {
        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, this.getVertexShaderSource());
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, this.getFragmentShaderSource());
        
        this.program = this.createProgram(vertexShader, fragmentShader);
        
        this.gl.useProgram(this.program);
        
        this.aPosition = this.gl.getAttribLocation(this.program, 'aPosition');
        this.aTexCoord = this.gl.getAttribLocation(this.program, 'aTexCoord');
        
        this.uZoom = this.gl.getUniformLocation(this.program, 'uZoom');
        this.uCenter = this.gl.getUniformLocation(this.program, 'uCenter');
        this.uMaxIterations = this.gl.getUniformLocation(this.program, 'uMaxIterations');
        this.uIsMandelbrot = this.gl.getUniformLocation(this.program, 'uIsMandelbrot');
        this.uJuliaParam = this.gl.getUniformLocation(this.program, 'uJuliaParam');
        this.uPaletteIndex = this.gl.getUniformLocation(this.program, 'uPaletteIndex');
        this.uCanvasSize = this.gl.getUniformLocation(this.program, 'uCanvasSize');
    }
    
    initBuffers() {
        this.positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        
        const positions = new Float32Array([
            -1.0, -1.0,
            1.0, -1.0,
            -1.0, 1.0,
            1.0, 1.0
        ]);
        
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);
        
        this.texCoordBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer);
        
        const texCoords = new Float32Array([
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,
            1.0, 1.0
        ]);
        
        this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW);
    }
    
    initEventListeners() {
        window.addEventListener('resize', () => this.resizeCanvas());
        
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
        
        this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e));
        this.canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e));
        
        const fractalTypeSelect = document.getElementById('fractal-type-select');
        fractalTypeSelect.addEventListener('change', (e) => {
            this.isMandelbrot = e.target.value === 'mandelbrot';
            document.getElementById('julia-params').style.display = this.isMandelbrot ? 'none' : 'block';
            this.needsRender = true;
            this.updateInfoPanel();
        });
        
        const paletteSelect = document.getElementById('palette-select');
        paletteSelect.addEventListener('change', (e) => {
            this.currentPalette = e.target.value;
            this.needsRender = true;
        });
        
        const iterationsSlider = document.getElementById('iterations-slider');
        iterationsSlider.addEventListener('input', (e) => {
            this.maxIterations = parseInt(e.target.value);
            document.getElementById('iterations-value').textContent = this.maxIterations;
            this.needsRender = true;
            this.updateInfoPanel();
        });
        
        const juliaReal = document.getElementById('julia-real');
        const juliaImag = document.getElementById('julia-imag');
        
        juliaReal.addEventListener('input', (e) => {
            this.juliaParamX = parseFloat(e.target.value) || 0;
            this.needsRender = true;
        });
        
        juliaImag.addEventListener('input', (e) => {
            this.juliaParamY = parseFloat(e.target.value) || 0;
            this.needsRender = true;
        });
        
        const resetBtn = document.getElementById('reset-btn');
        resetBtn.addEventListener('click', () => this.resetView());
        
        const toggleControls = document.getElementById('toggle-controls');
        const controlPanel = document.getElementById('control-panel');
        
        toggleControls.addEventListener('click', () => {
            if (controlPanel.classList.contains('visible')) {
                controlPanel.classList.remove('visible');
                controlPanel.classList.add('hidden');
            } else {
                controlPanel.classList.remove('hidden');
                controlPanel.classList.add('visible');
            }
        });
    }
    
    getPaletteIndex() {
        const palettes = ['fire', 'rainbow', 'ocean', 'grayscale', 'vibrant'];
        return palettes.indexOf(this.currentPalette);
    }
    
    resetView() {
        if (this.isMandelbrot) {
            this.centerX = -0.5;
            this.centerY = 0.0;
            this.zoom = 1.0;
        } else {
            this.centerX = 0.0;
            this.centerY = 0.0;
            this.zoom = 1.0;
        }
        this.needsRender = true;
        this.updateInfoPanel();
    }
    
    resizeCanvas() {
        const pixelRatio = window.devicePixelRatio || 1;
        this.canvas.width = window.innerWidth * pixelRatio;
        this.canvas.height = window.innerHeight * pixelRatio;
        
        this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
        this.needsRender = true;
    }
    
    onMouseDown(e) {
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    }
    
    onMouseMove(e) {
        if (!this.isDragging) return;
        
        const deltaX = e.clientX - this.lastMouseX;
        const deltaY = e.clientY - this.lastMouseY;
        
        const aspectRatio = this.canvas.width / this.canvas.height;
        const moveSpeed = 4.0 / this.zoom;
        
        this.centerX -= deltaX / window.innerWidth * moveSpeed * aspectRatio;
        this.centerY += deltaY / window.innerHeight * moveSpeed;
        
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        
        this.needsRender = true;
        this.updateInfoPanel();
    }
    
    onMouseUp(e) {
        this.isDragging = false;
    }
    
    onWheel(e) {
        e.preventDefault();
        
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = this.zoom * zoomFactor;
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) / rect.width;
        const mouseY = (e.clientY - rect.top) / rect.height;
        
        const aspectRatio = this.canvas.width / this.canvas.height;
        const moveSpeed = 4.0 / this.zoom;
        
        const worldX = (mouseX - 0.5) * moveSpeed * aspectRatio + this.centerX;
        const worldY = (0.5 - mouseY) * moveSpeed + this.centerY;
        
        this.zoom = newZoom;
        
        const newMoveSpeed = 4.0 / this.zoom;
        this.centerX = worldX - (mouseX - 0.5) * newMoveSpeed * aspectRatio;
        this.centerY = worldY - (0.5 - mouseY) * newMoveSpeed;
        
        this.needsRender = true;
        this.updateInfoPanel();
    }
    
    getTouchDistance(touches) {
        if (touches.length < 2) return 0;
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    getTouchCenter(touches) {
        if (touches.length === 0) return { x: 0, y: 0 };
        
        let sumX = 0, sumY = 0;
        for (const touch of touches) {
            sumX += touch.clientX;
            sumY += touch.clientY;
        }
        
        return {
            x: sumX / touches.length,
            y: sumY / touches.length
        };
    }
    
    onTouchStart(e) {
        e.preventDefault();
        
        if (e.touches.length === 1) {
            this.isDragging = true;
            this.lastMouseX = e.touches[0].clientX;
            this.lastMouseY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            this.touchStartDistance = this.getTouchDistance(e.touches);
            this.touchStartZoom = this.zoom;
            
            const center = this.getTouchCenter(e.touches);
            this.lastMouseX = center.x;
            this.lastMouseY = center.y;
        }
    }
    
    onTouchMove(e) {
        e.preventDefault();
        
        if (e.touches.length === 1 && this.isDragging) {
            const deltaX = e.touches[0].clientX - this.lastMouseX;
            const deltaY = e.touches[0].clientY - this.lastMouseY;
            
            const aspectRatio = this.canvas.width / this.canvas.height;
            const moveSpeed = 4.0 / this.zoom;
            
            this.centerX -= deltaX / window.innerWidth * moveSpeed * aspectRatio;
            this.centerY += deltaY / window.innerHeight * moveSpeed;
            
            this.lastMouseX = e.touches[0].clientX;
            this.lastMouseY = e.touches[0].clientY;
            
            this.needsRender = true;
            this.updateInfoPanel();
        } else if (e.touches.length === 2) {
            const currentDistance = this.getTouchDistance(e.touches);
            if (this.touchStartDistance === 0) return;
            const scaleFactor = currentDistance / this.touchStartDistance;
            const newZoom = this.touchStartZoom * scaleFactor;
            
            const center = this.getTouchCenter(e.touches);
            
            const rect = this.canvas.getBoundingClientRect();
            const touchX = (center.x - rect.left) / rect.width;
            const touchY = (center.y - rect.top) / rect.height;
            
            const aspectRatio = this.canvas.width / this.canvas.height;
            const oldMoveSpeed = 4.0 / this.zoom;
            
            const worldX = (touchX - 0.5) * oldMoveSpeed * aspectRatio + this.centerX;
            const worldY = (0.5 - touchY) * oldMoveSpeed + this.centerY;
            
            this.zoom = newZoom;
            
            const newMoveSpeed = 4.0 / this.zoom;
            this.centerX = worldX - (touchX - 0.5) * newMoveSpeed * aspectRatio;
            this.centerY = worldY - (0.5 - touchY) * newMoveSpeed;
            
            this.touchStartDistance = currentDistance;
            this.touchStartZoom = this.zoom;
            
            const deltaX = center.x - this.lastMouseX;
            const deltaY = center.y - this.lastMouseY;
            
            if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
                const moveSpeed = 4.0 / this.zoom;
                this.centerX -= deltaX / window.innerWidth * moveSpeed * aspectRatio;
                this.centerY += deltaY / window.innerHeight * moveSpeed;
                
                this.lastMouseX = center.x;
                this.lastMouseY = center.y;
            }
            
            this.needsRender = true;
            this.updateInfoPanel();
        }
    }
    
    onTouchEnd(e) {
        if (e.touches.length === 0) {
            this.isDragging = false;
        } else if (e.touches.length === 1) {
            this.isDragging = true;
            this.lastMouseX = e.touches[0].clientX;
            this.lastMouseY = e.touches[0].clientY;
        }
    }
    
    updateInfoPanel() {
        document.getElementById('center-coord').textContent = 
            `${this.centerX.toFixed(6)}, ${this.centerY.toFixed(6)}i`;
        document.getElementById('zoom-level').textContent = 
            `${this.zoom.toFixed(2)}x`;
        document.getElementById('max-iterations').textContent = 
            this.maxIterations;
        document.getElementById('fractal-type').textContent = 
            this.isMandelbrot ? 'Mandelbrot' : 'Julia';
    }
    
    render() {
        if (this.needsRender) {
            this.needsRender = false;
            
            this.gl.clearColor(0, 0, 0, 1);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
            
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
            this.gl.enableVertexAttribArray(this.aPosition);
            this.gl.vertexAttribPointer(this.aPosition, 2, this.gl.FLOAT, false, 0, 0);
            
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer);
            this.gl.enableVertexAttribArray(this.aTexCoord);
            this.gl.vertexAttribPointer(this.aTexCoord, 2, this.gl.FLOAT, false, 0, 0);
            
            this.gl.uniform1f(this.uZoom, this.zoom);
            this.gl.uniform2f(this.uCenter, this.centerX, this.centerY);
            this.gl.uniform1i(this.uMaxIterations, this.maxIterations);
            this.gl.uniform1i(this.uIsMandelbrot, this.isMandelbrot ? 1 : 0);
            this.gl.uniform2f(this.uJuliaParam, this.juliaParamX, this.juliaParamY);
            this.gl.uniform1i(this.uPaletteIndex, this.getPaletteIndex());
            this.gl.uniform2f(this.uCanvasSize, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
            
            this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
        }
        
        this.animationFrameId = requestAnimationFrame(() => this.render());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new FractalExplorer();
});