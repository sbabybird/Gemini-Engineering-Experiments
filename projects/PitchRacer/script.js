window.addEventListener('load', () => {
    // --- Matter.js Aliases ---
    const { Engine, Runner, World, Bodies, Body, Composite, Composites, Constraint, Events, Vector, Query } = Matter;

    // --- DOM Elements ---
    const gameContainer = document.getElementById('game-container');
    const instructions = document.getElementById('instructions');
    const dashboard = document.getElementById('dashboard');
    const pitchValue = document.getElementById('pitch-value');
    const pitchBar = document.getElementById('pitch-bar');
    const speedValue = document.getElementById('speed-value');
    const speedBar = document.getElementById('speed-bar');
    const distanceValue = document.getElementById('distance-value');

    // --- Game & Engine Setup ---
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const engine = Engine.create(); const world = engine.world; world.gravity.y = 1.2;
    engine.positionIterations = 12; engine.velocityIterations = 10;
    const canvas = document.createElement('canvas');
    canvas.width = screenWidth;
    canvas.height = screenHeight;
    gameContainer.prepend(canvas);
    const ctx = canvas.getContext('2d');
    const runner = Runner.create({ delta: 1000 / 120, isFixed: true });
    Runner.run(runner, engine);

    // --- Perlin Noise Generator ---
    const Perlin = {
        p: new Uint8Array(512),
        init: function() {
            const p = new Uint8Array(256);
            for (let i = 0; i < 256; i++) p[i] = i;
            for (let i = 255; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
            this.p = new Uint8Array(512);
            for (let i = 0; i < 512; i++) this.p[i] = p[i & 255];
        },
        fade: t => t * t * t * (t * (t * 6 - 15) + 10),
        lerp: (t, a, b) => a + t * (b - a),
        grad: function(hash, x, y, z) {
            const h = hash & 15;
            const u = h < 8 ? x : y, v = h < 4 ? y : h === 12 || h === 14 ? x : z;
            return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
        },
        noise: function(x, y, z) {
            const p = this.p;
            const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
            x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
            const u = this.fade(x), v = this.fade(y), w = this.fade(z);
            const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
            return this.lerp(w, this.lerp(v, this.lerp(u, this.grad(p[AA], x, y, z), this.grad(p[BA], x - 1, y, z)), this.lerp(u, this.grad(p[AB], x, y - 1, z), this.grad(p[BB], x - 1, y - 1, z))), this.lerp(v, this.lerp(u, this.grad(p[AA + 1], x, y, z - 1), this.grad(p[BA + 1], x - 1, y, z - 1)), this.lerp(u, this.grad(p[AB + 1], x, y - 1, z - 1), this.grad(p[BB + 1], x - 1, y - 1, z - 1))));
        }
    };
    Perlin.init();

    // --- Audio Setup ---
    let audioContext, analyser, buf; let currentPitch = 0;
    const PITCH_MIN = 120; const PITCH_MAX = 600;
    const CONFIDENCE_THRESHOLD = 0.5;

    // --- Game State ---
    let gameState = 'init';
    let engineState = 'normal'; let burnoutTimer = 0; const BURNOUT_DURATION = 180; let highPitchCounter = 0;
    let flipTimer = 0; const FLIP_THRESHOLD = 120;
    let distanceTraveled = 0;

    // --- Visuals Data ---
    const visuals = {
        sun: { x: 150, y: 120, radius: 60 },
        farHills: { z: 6, color: 'rgba(157, 184, 145, 0.6)', noiseScale: 0.001, amplitude: 200, yBase: screenHeight * 0.5 },
        nearHills: { z: 3, color: 'rgba(107, 142, 35, 0.7)', noiseScale: 0.002, amplitude: 250, yBase: screenHeight * 0.6 }
    };

    // --- Terrain Generation ---
    let terrainSegments = []; let nextX = 0; let rampNext = false;
    const terrainNoiseScale = 0.004; const terrainAmplitude = 150;
    function getTerrainY(x) { return screenHeight * 0.8 + Perlin.noise(x * terrainNoiseScale, 0, 0) * terrainAmplitude; }
    function generateTerrainSegment() {
        const segmentLength = rampNext ? 600 : 1500 + Math.random() * 1000;
        const step = 40;
        const numSteps = Math.floor(segmentLength / step);
        const startY = getTerrainY(nextX - 10);

        let segmentComposite = Composite.create();
        let surfaceVertices = [];

        if (rampNext) {
            for (let i = 0; i < numSteps; i++) {
                const p1 = i / numSteps; const p2 = (i + 1) / numSteps;
                const x1 = nextX + p1 * segmentLength, y1 = startY - p1 * 250;
                const x2 = nextX + p2 * segmentLength, y2 = startY - p2 * 250;
                const angle = Math.atan2(y2 - y1, x2 - x1);
                const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
                const block = Bodies.rectangle((x1+x2)/2, (y1+y2)/2, length, 20, { angle: angle, isStatic: true, friction: 1.0, restitution: 0, render: { visible: false } });
                Composite.add(segmentComposite, block);
                if (i === 0) surfaceVertices.push({x: x1, y: y1});
                surfaceVertices.push({x: x2, y: y2});
            }
            nextX += segmentLength + 500 + Math.random() * 400; // Wider gaps
            rampNext = false;
        } else {
            for (let i = 0; i < numSteps; i++) {
                const x1 = nextX + i * step;
                const x2 = nextX + (i + 1) * step;
                const y1 = getTerrainY(x1);
                const y2 = getTerrainY(x2);
                const angle = Math.atan2(y2 - y1, x2 - x1);
                const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
                const block = Bodies.rectangle((x1+x2)/2, (y1+y2)/2, length, 20, { angle: angle, isStatic: true, friction: 1.0, restitution: 0, render: { visible: false } });
                Composite.add(segmentComposite, block);
                if (i === 0) surfaceVertices.push({x: x1, y: y1});
                surfaceVertices.push({x: x2, y: y2});
            }
            nextX += segmentLength;
            if (Math.random() < 0.35) rampNext = true; // More gaps
        }
        segmentComposite.surfaceVertices = surfaceVertices;
        World.add(world, segmentComposite);
        terrainSegments.push(segmentComposite);
    }

    // --- Car (Arcade Physics Model) ---
    let car;
    function createCar(x, y) {
        const carBody = Bodies.rectangle(x, y, 60, 17.5, { 
            density: 0.008, 
            friction: 0.8, 
            frictionAir: 0.015, 
            restitution: 0.1,
            chamfer: { radius: 5 }
        });
        World.add(world, carBody);
        return carBody;
    }

    // --- Game State & Reset ---
    function changeState(newState) {
        gameState = newState;
        if (newState === 'ready') {
            instructions.innerHTML = '<p>Sing to Start!</p>'; instructions.style.opacity = 1;
            if (car) World.remove(world, car);
            terrainSegments.forEach(t => World.remove(world, t));
            terrainSegments = []; nextX = -screenWidth / 2; rampNext = false;
            for(let i = 0; i < 3; i++) generateTerrainSegment();
            car = createCar(200, getTerrainY(200) - 50);
            flipTimer = 0;
            distanceTraveled = 0;
        } else if (newState === 'playing') {
            instructions.style.opacity = 0;
        } else if (newState === 'gameOver') {
            instructions.innerHTML = `<p>GAME OVER</p><p>Distance: ${distanceTraveled}m</p><p>Click to Restart</p>`;
            instructions.style.opacity = 1;
        }
    }

    // --- Pitch Detection ---
    function findFundamentalFreq(buffer, sampleRate) {
        const n = buffer.length; const acf = new Array(n).fill(0);
        for (let i = 0; i < n; i++) { for (let j = 0; j < n - i; j++) { acf[i] += buffer[j] * buffer[j + i]; } }
        let d = 0; while (d < n - 1 && acf[d] > acf[d + 1]) d++;
        let maxval = -1, maxpos = -1;
        for (let i = d; i < n; i++) { if (acf[i] > maxval) { maxval = acf[i]; maxpos = i; } }
        if (acf[0] < CONFIDENCE_THRESHOLD || maxpos === -1) return null;
        let T0 = maxpos; const x1 = acf[T0 - 1], x2 = acf[T0], x3 = acf[T0 + 1];
        if (!x1 || !x2 || !x3) return null;
        const a = (x1 + x3 - 2 * x2) / 2, b = (x3 - x1) / 2;
        if (a) T0 = T0 - b / (2 * a);
        return sampleRate / T0;
    }
    function updatePitch() {
        if (!analyser) return;
        analyser.getFloatTimeDomainData(buf);
        const fundamentalFreq = findFundamentalFreq(buf, audioContext.sampleRate);
        currentPitch = fundamentalFreq ? fundamentalFreq : 0;
        if (gameState === 'ready' && currentPitch > PITCH_MIN) { changeState('playing'); }
        requestAnimationFrame(updatePitch);
    }

    // --- Physics Loop ---
    const MAX_FORCE = 0.035; // Tuned force
    let targetForce = 0, currentForce = 0;
    Events.on(engine, 'beforeUpdate', (event) => {
        if (!car) return;
        if (gameState === 'playing') {
            if (engineState === 'burnout') { burnoutTimer--; if (burnoutTimer <= 0) engineState = 'normal'; }
            else {
                if (currentPitch > PITCH_MIN) {
                    const pitchRatio = Math.min(1, (currentPitch - PITCH_MIN) / (PITCH_MAX - PITCH_MIN));
                    targetForce = pitchRatio * MAX_FORCE;
                    if (pitchRatio > 0.95) { engineState = 'boosting'; highPitchCounter++; if (highPitchCounter > 90) { engineState = 'burnout'; burnoutTimer = BURNOUT_DURATION; } }
                    else { engineState = 'normal'; highPitchCounter = 0; }
                } else { targetForce = 0; engineState = 'normal'; highPitchCounter = 0; }
            }
            if (engineState === 'burnout') targetForce = 0;
            currentForce += (targetForce - currentForce) * 0.15; // More responsive throttle
            let finalForce = engineState === 'boosting' ? currentForce * 1.5 : currentForce;
            Body.applyForce(car, car.position, { x: finalForce, y: 0 });

            const isFlipped = Math.abs(car.angle) > 2.2;
            if (isFlipped && Math.abs(car.angularVelocity) < 0.05) { flipTimer++; } else { flipTimer = 0; }
            if (flipTimer > 120) { changeState('gameOver'); }
            if (car.position.x > nextX - screenWidth * 1.5) { generateTerrainSegment(); if (terrainSegments.length > 5) { World.remove(world, terrainSegments.shift()); } }
            if (car.position.y > screenHeight + 100) { changeState('gameOver'); }
        }
        distanceTraveled = Math.floor(car.position.x / 10);
        const speed = Math.abs(car.velocity.x * 5).toFixed(1);
        pitchValue.textContent = `${Math.round(currentPitch)} Hz`;
        pitchBar.style.width = `${Math.min(100, (currentPitch - PITCH_MIN) / (PITCH_MAX - PITCH_MIN) * 100)}%`;
        speedValue.textContent = `${speed} km/h`;
        speedBar.style.width = `${Math.min(100, speed / 200 * 100)}%`;
        distanceValue.textContent = `${distanceTraveled} m`;
        if (engineState === 'burnout') { dashboard.style.borderColor = '#ff4500'; } 
        else if (engineState === 'boosting') { dashboard.style.borderColor = '#ffff00'; } 
        else { dashboard.style.borderColor = '#555'; }
    });

    // --- Custom Rendering Loop ---
    function draw() {
        if (!car) { requestAnimationFrame(draw); return; }
        const cameraX = car.position.x;

        ctx.clearRect(0, 0, screenWidth, screenHeight);

        ctx.save();
        ctx.translate(-cameraX + screenWidth / 2, 0);

        // 1. Sky & Sun
        ctx.save();
        const skyGradient = ctx.createLinearGradient(cameraX - screenWidth/2, 0, cameraX - screenWidth/2, screenHeight);
        skyGradient.addColorStop(0, '#87CEEB'); skyGradient.addColorStop(1, '#FFFFFF');
        ctx.fillStyle = skyGradient; ctx.fillRect(cameraX - screenWidth/2, 0, screenWidth, screenHeight);
        ctx.fillStyle = '#FFDE00'; ctx.beginPath(); ctx.arc(cameraX - screenWidth/2 + visuals.sun.x, visuals.sun.y, visuals.sun.radius, 0, 2 * Math.PI); ctx.fill();
        ctx.restore();

        // 2. Parallax Hills
        [visuals.farHills, visuals.nearHills].forEach(layer => {
            ctx.save();
            ctx.fillStyle = layer.color;
            ctx.beginPath();
            ctx.moveTo(cameraX - screenWidth * 2, screenHeight);
            for (let x = Math.floor((cameraX - screenWidth*2) / 100) * 100; x < cameraX + screenWidth * 2; x += 100) {
                const y = layer.yBase + Perlin.noise(x * layer.noiseScale, 0, 0) * layer.amplitude;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(cameraX + screenWidth * 2, screenHeight);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        });

        // 3. Visual Terrain
        ctx.save();
        terrainSegments.forEach(segment => {
            const bounds = Composite.bounds(segment);
            if (bounds.max.x < cameraX - screenWidth/2 - 100 || bounds.min.x > cameraX + screenWidth/2 + 100) return;
            ctx.beginPath();
            ctx.moveTo(segment.surfaceVertices[0].x, segment.surfaceVertices[0].y);
            for (let i = 1; i < segment.surfaceVertices.length; i++) {
                ctx.lineTo(segment.surfaceVertices[i].x, segment.surfaceVertices[i].y);
            }
            ctx.lineTo(segment.surfaceVertices[segment.surfaceVertices.length - 1].x, screenHeight);
            ctx.lineTo(segment.surfaceVertices[0].x, screenHeight);
            ctx.closePath();
            ctx.fillStyle = '#7C4700'; ctx.fill();
            ctx.strokeStyle = '#6B8E23'; ctx.lineWidth = 10; ctx.stroke();
        });
        ctx.restore();

        // 4. Car
        ctx.save();
        ctx.translate(car.position.x, car.position.y);
        ctx.rotate(car.angle);
        ctx.fillStyle = '#E02128';
        ctx.fillRect(-30, -10, 60, 20);
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.arc(-22.5, 0, 12.5, 0, 2*Math.PI); ctx.fill();
        ctx.beginPath(); ctx.arc(22.5, 0, 12.5, 0, 2*Math.PI); ctx.fill();
        ctx.restore();

        ctx.restore();
        requestAnimationFrame(draw);
    }

    // --- Init ---
    canvas.addEventListener('click', () => { if (gameState === 'gameOver') changeState('ready'); });
    async function init() {
        try {
            instructions.innerHTML = '<p>Waiting for microphone...</p>';
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser(); analyser.fftSize = 2048; buf = new Float32Array(analyser.fftSize);
            audioContext.createMediaStreamSource(stream).connect(analyser);
            changeState('ready');
            updatePitch();
            draw();
        } catch (err) { instructions.innerHTML = '<p>Microphone access denied.</p><p>Please enable it and refresh.</p>'; }
    }
    init();
});
