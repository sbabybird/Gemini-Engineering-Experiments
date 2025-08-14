window.addEventListener('load', () => {
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const pitchDisplay = document.getElementById('pitch-display');
    const scoreDisplay = document.getElementById('score-display');
    const instructions = document.getElementById('instructions');
    const debugInfo = document.getElementById('debug-info');

    // --- Audio Setup ---
    let audioContext, analyser, buf;
    const PITCH_MIN = 150; // C3
    const PITCH_MAX = 600; // D5
    const CONFIDENCE_THRESHOLD = 0.5;

    // --- Game State ---
    let gameState = 'init'; // init, listening, playing, over
    let score = 0;
    let frameCount = 0;

    // --- Game Objects ---
    const player = {
        x: 80, y: canvas.height - 50, width: 30, height: 30,
        targetY: canvas.height - 50,
        draw() { ctx.fillStyle = '#ff4500'; ctx.fillRect(this.x, this.y, this.width, this.height); },
        update() { this.y += (this.targetY - this.y) * 0.1; },
        reset() { this.y = canvas.height - 50; this.targetY = this.y; }
    };

    let obstacles = [];
    const obstacleWidth = 50, obstacleGap = 180, obstacleSpeed = -1.5;

    function manageObstacles() {
        if (frameCount % 180 === 0) {
            const gapY = Math.random() * (canvas.height - obstacleGap - 150) + 75;
            obstacles.push({ x: canvas.width, y: 0, width: obstacleWidth, height: gapY, passed: false });
            obstacles.push({ x: canvas.width, y: gapY + obstacleGap, width: obstacleWidth, height: canvas.height - gapY - obstacleGap });
        }
        obstacles.forEach(obs => {
            obs.x += obstacleSpeed;
            ctx.fillStyle = '#006400';
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        });
        obstacles.forEach(obs => {
            if (player.x < obs.x + obs.width && player.x + player.width > obs.x &&
                player.y < obs.y + obs.height && player.y + player.height > obs.y) {
                changeState('over');
            }
        });
        obstacles = obstacles.filter(obs => obs.x + obs.width > 0);
        const firstObstacle = obstacles[0];
        if (firstObstacle && !firstObstacle.passed && firstObstacle.x + firstObstacle.width < player.x) {
            score++;
            scoreDisplay.textContent = score;
        }
    }

    // --- Pitch Detection ---
    function findFundamentalFreq(buffer, sampleRate) {
        const n = buffer.length; const acf = new Array(n).fill(0);
        for (let i = 0; i < n; i++) { for (let j = 0; j < n - i; j++) { acf[i] += buffer[j] * buffer[j + i]; } }
        let d = 0; while (acf[d] > acf[d + 1]) d++;
        let maxval = -1, maxpos = -1;
        for (let i = d; i < n; i++) { if (acf[i] > maxval) { maxval = acf[i]; maxpos = i; } }
        if (acf[0] < CONFIDENCE_THRESHOLD || maxpos === -1) return null;
        let T0 = maxpos; const x1 = acf[T0 - 1], x2 = acf[T0], x3 = acf[T0 + 1];
        const a = (x1 + x3 - 2 * x2) / 2, b = (x3 - x1) / 2;
        if (a) T0 = T0 - b / (2 * a);
        return sampleRate / T0;
    }

    function updatePitch() {
        if (gameState !== 'playing') return;
        analyser.getFloatTimeDomainData(buf);
        const fundamentalFreq = findFundamentalFreq(buf, audioContext.sampleRate);
        if (fundamentalFreq) {
            pitchDisplay.textContent = Math.round(fundamentalFreq);
            const pitchRatio = (fundamentalFreq - PITCH_MIN) / (PITCH_MAX - PITCH_MIN);
            const target = canvas.height - (canvas.height * pitchRatio) - player.height;
            player.targetY = Math.max(0, Math.min(canvas.height - player.height, target));
        } else {
            pitchDisplay.textContent = '0';
            player.targetY = canvas.height - player.height;
        }
        requestAnimationFrame(updatePitch);
    }
    
    function listenForGameStart() {
        if (gameState !== 'listening') return;
        analyser.getFloatTimeDomainData(buf);
        const fundamentalFreq = findFundamentalFreq(buf, audioContext.sampleRate);
        if (fundamentalFreq) {
            changeState('playing');
        } else {
            requestAnimationFrame(listenForGameStart);
        }
    }

    // --- Game Loop ---
    function gameLoop() {
        // This loop never stops, it just draws the current state
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#87CEEB';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        player.update();
        player.draw();

        if (gameState === 'playing') {
            manageObstacles();
            frameCount++;
        } else if (gameState === 'over') {
            // Keep drawing the obstacles statically after game over
            obstacles.forEach(obs => {
                ctx.fillStyle = '#006400';
                ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            });
        }

        requestAnimationFrame(gameLoop);
    }

    // --- Initialization & State Management ---
    function changeState(newState) {
        gameState = newState;
        if (newState === 'listening') {
            instructions.innerHTML = '<p>Sing to Start!</p>';
            instructions.style.display = 'block';
            debugInfo.style.display = 'none';
            player.reset();
            listenForGameStart();
        } else if (newState === 'playing') {
            player.reset();
            obstacles = [];
            score = 0;
            frameCount = 0;
            scoreDisplay.textContent = score;
            instructions.style.display = 'none';
            debugInfo.style.display = 'flex';
            updatePitch();
        } else if (newState === 'over') {
            instructions.innerHTML = `<p>Game Over!</p><p>Score: ${score}</p><p>Click to Restart</p>`;
            instructions.style.display = 'block';
        }
    }

    async function initAudio() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            buf = new Float32Array(analyser.fftSize);
            mediaStreamSource = audioContext.createMediaStreamSource(stream);
            mediaStreamSource.connect(analyser);
            changeState('listening'); // Move to listening state after audio is ready
        } catch (err) { console.error(err); instructions.innerHTML = '<p>Microphone access denied.</p><p>Please enable it and refresh.</p>'; }
    }

    canvas.addEventListener('click', () => {
        if (gameState === 'over') { // Only handle restart on click
            changeState('listening');
        }
    });

    // Initial render
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    player.draw();
    instructions.innerHTML = '<p>Waiting for microphone...</p>';

    initAudio();
    gameLoop(); // Start rendering loop immediately
});
