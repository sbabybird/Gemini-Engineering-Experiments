document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const container = document.getElementById('drawing-area');
    const promptDisplay = document.getElementById('prompt');
    const coordsDisplay = document.getElementById('coords');
    const toolButtons = document.querySelectorAll('.toolbar a[data-tool]');
    const clearButton = document.getElementById('clear-canvas');
    const strokeColorInput = document.getElementById('stroke-color');
    const strokeWidthInput = document.getElementById('stroke-width');
    const fillColorInput = document.getElementById('fill-color');
    const useFillInput = document.getElementById('use-fill');

    // --- App State ---
    const state = {
        activeTool: 'select',
        strokeColor: '#00aeff',
        strokeWidth: 5,
        fillColor: '#5c6a7e',
        useFill: false,
        selection: [],
        isDrawing: false,
        isPanning: false,
        panStart: new Two.Vector(),
        drawStart: new Two.Vector(),
        lastMouse: new Two.Vector(),
        previewShape: null,
    };

    // --- Two.js Setup ---
    const two = new Two({ fullscreen: true, autostart: true }).appendTo(container);
    const grid = two.makeGroup();
    const mainLayer = two.makeGroup();
    const selectionLayer = two.makeGroup();
    two.add(grid, mainLayer, selectionLayer);

    // --- Camera Config ---
    const zoomSensitivity = 0.0025;
    const minZoom = 0.02;
    const maxZoom = 50;

    // --- Event Handler Definitions per Tool ---
    const selectTool = {
        isDragging: false,
        mousedown: function(e) {
            if (e.target.closest('.ui-container')) return;
            const hit = getShapeAt(state.lastMouse);
            if (hit) { if (!state.selection.includes(hit)) select(hit); this.isDragging = true; } else { deselectAll(); }
        },
        mousemove: function() {
            if (this.isDragging && state.selection.length > 0) {
                const delta = Two.Vector.sub(state.lastMouse, screenToWorld(new Two.Vector(two.renderer.domElement.getBoundingClientRect().left + state.panStart.x, two.renderer.domElement.getBoundingClientRect().top + state.panStart.y)));
                const prevMouse = Two.Vector.sub(state.lastMouse, delta);
                const moveDelta = Two.Vector.sub(state.lastMouse, prevMouse);
                for (const shape of state.selection) { shape.translation.add(moveDelta); }
            }
        },
        mouseup: function() { this.isDragging = false; },
        activate: function() { setPrompt('Click to select, or click and drag to move a shape.'); }
    };

    const penTool = {
        mousedown: function() { state.isDrawing = true; const path = two.makePath(state.lastMouse.x, state.lastMouse.y); path.cap = 'round'; path.join = 'round'; applyCurrentStyle(path, { useFill: false }); state.previewShape = path; mainLayer.add(path); },
        mousemove: function() { if (state.isDrawing) state.previewShape.vertices.push(state.lastMouse.clone()); },
        mouseup: function() { if (state.isDrawing) { state.isDrawing = false; state.previewShape = null; } },
        activate: function() { setPrompt('Click and drag to draw a freeform line.'); }
    };

    const clickClickTool = {
        mousedown: function() {
            if (!state.isDrawing) {
                state.isDrawing = true;
                state.drawStart.copy(state.lastMouse);
                switch(state.activeTool) {
                    case 'line': state.previewShape = two.makeLine(state.drawStart.x, state.drawStart.y, state.drawStart.x, state.drawStart.y); applyCurrentStyle(state.previewShape, { useFill: false }); break;
                    case 'rect': state.previewShape = two.makeRectangle(state.drawStart.x, state.drawStart.y, 0, 0); applyCurrentStyle(state.previewShape); break;
                    case 'circle': state.previewShape = two.makeCircle(state.drawStart.x, state.drawStart.y, 0); applyCurrentStyle(state.previewShape); break;
                }
                mainLayer.add(state.previewShape);
                setPrompt('Specify second point...');
            } else {
                this.finalize();
            }
        },
        mousemove: function() {
            if (state.isDrawing) {
                switch(state.activeTool) {
                    case 'line': state.previewShape.vertices[1].copy(state.lastMouse); break;
                    case 'rect': const rect = state.previewShape; const width = Math.abs(state.lastMouse.x - state.drawStart.x); const height = Math.abs(state.lastMouse.y - state.drawStart.y); rect.width = width; rect.height = height; rect.translation.set(state.drawStart.x + (state.lastMouse.x - state.drawStart.x) / 2, state.drawStart.y + (state.lastMouse.y - state.drawStart.y) / 2); break;
                    case 'circle': state.previewShape.radius = state.drawStart.distanceTo(state.lastMouse); break;
                }
            }
        },
        finalize: function() { state.isDrawing = false; state.previewShape = null; this.activate(); },
        activate: function() { switch(state.activeTool) { case 'line': setPrompt('LINE: Specify first point.'); break; case 'rect': setPrompt('RECTANGLE: Specify first corner.'); break; case 'circle': setPrompt('CIRCLE: Specify center point.'); break; } },
        deactivate: function() { if (state.isDrawing) { mainLayer.remove(state.previewShape); state.isDrawing = false; state.previewShape = null; } }
    };

    const toolEventHandlers = { select: selectTool, pen: penTool, line: clickClickTool, rect: clickClickTool, circle: clickClickTool };
    let activeToolListeners = {};

    function switchTool(newTool) {
        const oldToolName = state.activeTool;
        if (oldToolName === newTool) return;

        if (toolEventHandlers[oldToolName]?.deactivate) toolEventHandlers[oldToolName].deactivate();
        for (const eventName in activeToolListeners) { container.removeEventListener(eventName, activeToolListeners[eventName]); }
        activeToolListeners = {};

        state.activeTool = newTool;
        const newHandlers = toolEventHandlers[newTool];

        for (const eventName in newHandlers) {
            if (typeof newHandlers[eventName] === 'function' && eventName !== 'activate' && eventName !== 'deactivate') {
                const handler = newHandlers[eventName].bind(newHandlers);
                activeToolListeners[eventName] = handler;
                container.addEventListener(eventName, handler);
            }
        }
        if (newHandlers?.activate) newHandlers.activate();

        toolButtons.forEach(b => b.classList.replace('contrast', 'secondary'));
        document.querySelector(`.toolbar a[data-tool="${newTool}"]`).classList.replace('secondary', 'contrast');
        deselectAll();
    }

    // --- Global Listeners & Initial Setup ---
    function onGlobalMouseMove(e) {
        const mouseWorld = screenToWorld(new Two.Vector(e.clientX, e.clientY));
        coordsDisplay.textContent = `X: ${mouseWorld.x.toFixed(2)}, Y: ${mouseWorld.y.toFixed(2)}`;
        if (state.isPanning) {
            const dx = e.clientX - state.panStart.x; const dy = e.clientY - state.panStart.y;
            two.scene.translation.add(dx, dy);
            state.panStart.set(e.clientX, e.clientY);
        }
        state.lastMouse.copy(mouseWorld);
    }
    function onWheel(e) { e.preventDefault(); const oldZoom = two.scene.scale; const mousePos = new Two.Vector(e.clientX, e.clientY); let newZoom = oldZoom - e.deltaY * zoomSensitivity * oldZoom; newZoom = Math.max(minZoom, Math.min(maxZoom, newZoom)); two.scene.scale = newZoom; const mouseBeforeZoom = screenToWorld(mousePos, oldZoom); two.scene.translation.x = mousePos.x - mouseBeforeZoom.x * newZoom; two.scene.translation.y = mousePos.y - mouseBeforeZoom.y * newZoom; }
    function onTwoUpdate() { drawGrid(); if (state.selection.length > 0) updateSelectionAdorner(); }
    
    container.addEventListener('mousemove', onGlobalMouseMove);
    container.addEventListener('wheel', onWheel, { passive: false });
    two.bind('update', onTwoUpdate);
    clearButton.addEventListener('click', () => { mainLayer.remove(mainLayer.children); deselectAll(); });
    container.addEventListener('mousedown', (e) => { if (e.button === 1) { state.isPanning = true; state.panStart.set(e.clientX, e.clientY); container.style.cursor = 'grabbing'; } });
    container.addEventListener('mouseup', () => { if (state.isPanning) { state.isPanning = false; container.style.cursor = 'crosshair'; } });
    toolButtons.forEach(button => button.addEventListener('click', (e) => { e.preventDefault(); switchTool(e.currentTarget.dataset.tool); }));

    // --- UI and Helper Functions ---
    function setPrompt(text) { promptDisplay.textContent = text; }
    function applyCurrentStyle(shape, overrides = {}) { shape.stroke = state.strokeColor || '#00aeff'; shape.linewidth = (state.strokeWidth || 5) / two.scene.scale; const useFill = overrides.useFill !== undefined ? overrides.useFill : state.useFill; if (useFill) { shape.fill = state.fillColor || '#5c6a7e'; } else { shape.noFill(); } }
    function updateStyleOfSelection() { if (state.selection.length > 0) applyCurrentStyle(state.selection[0]); }
    function getShapeAt(worldPos) { for (let i = mainLayer.children.length - 1; i >= 0; i--) { const child = mainLayer.children[i]; const bounds = child.getBoundingClientRect(true); if (bounds && worldPos.x >= bounds.left && worldPos.x <= bounds.right && worldPos.y >= bounds.top && worldPos.y <= bounds.bottom) { return child; } } return null; }
    function select(shape) { deselectAll(); state.selection.push(shape); updateStyleOfSelection(); }
    function deselectAll() { state.selection = []; selectionLayer.remove(selectionLayer.children); }
    function updateSelectionAdorner() { selectionLayer.remove(selectionLayer.children); if (state.selection.length === 0) return; const selected = state.selection[0]; const bounds = selected.getBoundingClientRect(true); if (!bounds) return; const selectionBox = two.makeRectangle(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, bounds.width, bounds.height); selectionBox.noFill(); selectionBox.stroke = '#00aeff'; selectionBox.linewidth = 2 / two.scene.scale; selectionLayer.add(selectionBox); }
    function screenToWorld(screenVec, zoom) { const _zoom = zoom || two.scene.scale; const x = (screenVec.x - two.scene.translation.x) / _zoom; const y = (screenVec.y - two.scene.translation.y) / _zoom; return new Two.Vector(x, y); }
    function drawGrid() { grid.remove(grid.children); const scale = two.scene.scale; const view = { left: (-two.scene.translation.x) / scale, right: (two.width - two.scene.translation.x) / scale, top: (-two.scene.translation.y) / scale, bottom: (two.height - two.scene.translation.y) / scale }; const baseSpacing = 100; let majorSpacing = baseSpacing * Math.pow(2, -Math.round(Math.log2(scale / (baseSpacing/100)))); let minorSpacing = majorSpacing / 10; if (majorSpacing * scale < 50) { majorSpacing *= 5; minorSpacing *= 5; } if (minorSpacing * scale > 25) { minorSpacing /= 5; } for (let x = Math.floor(view.left / minorSpacing) * minorSpacing; x < view.right; x += minorSpacing) { const isMajor = Math.abs(x % majorSpacing) < 1e-9; const line = two.makeLine(x, view.top, x, view.bottom); line.stroke = isMajor ? '#404a5f' : '#2c374c'; line.linewidth = 1 / scale; grid.add(line); } for (let y = Math.floor(view.top / minorSpacing) * minorSpacing; y < view.bottom; y += minorSpacing) { const isMajor = Math.abs(y % majorSpacing) < 1e-9; const line = two.makeLine(view.left, y, view.right, y); line.stroke = isMajor ? '#404a5f' : '#2c374c'; line.linewidth = 1 / scale; grid.add(line); } if (view.left < 0 && view.right > 0) { const yAxis = two.makeLine(0, view.top, 0, view.bottom); yAxis.stroke = '#7a8c99'; yAxis.linewidth = 1.5 / scale; grid.add(yAxis); } if (view.top < 0 && view.bottom > 0) { const xAxis = two.makeLine(view.left, 0, view.right, 0); xAxis.stroke = '#7a8c99'; xAxis.linewidth = 1.5 / scale; grid.add(xAxis); } }

    // --- Initial Setup ---
    function centerView() { two.scene.translation.set(two.width / 2, two.height / 2); }
    centerView();
    drawGrid();
    switchTool(state.activeTool);
});