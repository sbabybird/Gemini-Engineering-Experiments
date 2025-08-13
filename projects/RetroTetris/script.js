const canvas = document.getElementById('game-canvas');
const context = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextContext = nextCanvas.getContext('2d');
const scoreElement = document.getElementById('score');
const linesElement = document.getElementById('lines');
const levelElement = document.getElementById('level');

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;

context.scale(BLOCK_SIZE, BLOCK_SIZE);
nextContext.scale(BLOCK_SIZE, BLOCK_SIZE);

const COLORS = [
    null,
    '#FF0D72', // T
    '#0DC2FF', // O
    '#0DFF72', // L
    '#F538FF', // J
    '#FF8E0D', // I
    '#FFE138', // S
    '#3877FF', // Z
    '#888',    // Game Over
    '#FFFFFF'  // Clearing Line
];

const SHAPES = {
    'T': [[1, 1, 1], [0, 1, 0]],
    'O': [[2, 2], [2, 2]],
    'L': [[0, 0, 3], [3, 3, 3]],
    'J': [[4, 0, 0], [4, 4, 4]],
    'I': [[0, 0, 0, 0], [5, 5, 5, 5], [0, 0, 0, 0]],
    'S': [[0, 6, 6], [6, 6, 0]],
    'Z': [[7, 7, 0], [0, 7, 7]]
};

let grid;
let currentPiece;
let nextPiece;
let score;
let lines;
let level;
let dropCounter;
let dropInterval;
let lastTime;
let isAnimating = false;
let animationFrameId;
let particles = [];

// --- Particle System ---
function createParticles(x, y, count, color) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.4,
            size: Math.random() * 0.3 + 0.1,
            lifetime: Math.random() * 50 + 30,
            color: color
        });
    }
}

function updateAndDrawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.01; // Gravity
        p.lifetime--;

        if (p.lifetime <= 0) {
            particles.splice(i, 1);
        } else {
            context.globalAlpha = p.lifetime / 60;
            context.fillStyle = p.color;
            context.fillRect(p.x, p.y, p.size, p.size);
            context.globalAlpha = 1.0;
        }
    }
}

// --- Game Logic ---

function createGrid(rows, cols) {
    const grid = [];
    while (rows--) {
        grid.push(new Array(cols).fill(0));
    }
    return grid;
}

function createPiece(type) {
    const matrix = SHAPES[type];
    return {
        matrix: matrix.map(row => [...row]),
        pos: { x: Math.floor(COLS / 2) - Math.floor(matrix[0].length / 2), y: 0 },
    };
}

function spawnNewPiece() {
    const pieceTypes = 'TOLJISZ';
    currentPiece = nextPiece;
    nextPiece = createPiece(pieceTypes[Math.floor(Math.random() * pieceTypes.length)]);
    drawNextPiece();
    
    if (collides(currentPiece, grid)) {
        cancelAnimationFrame(animationFrameId);
        grid.forEach(row => row.fill(8));
        draw();
        alert(`Game Over! Score: ${score}`);
        return false;
    }
    return true;
}

function collides(piece, grid) {
    for (let y = 0; y < piece.matrix.length; y++) {
        for (let x = 0; x < piece.matrix[y].length; x++) {
            if (piece.matrix[y][x] !== 0 && 
                (grid[y + piece.pos.y] && grid[y + piece.pos.y][x + piece.pos.x]) !== 0) {
                return true;
            }
        }
    }
    return false;
}

function mergeToGrid(piece, grid) {
    piece.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                grid[y + piece.pos.y][x + piece.pos.x] = value;
            }
        });
    });
}

function rotate(matrix, dir) {
    const newMatrix = matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
    if (dir > 0) {
        return newMatrix.map(row => row.reverse());
    }
    return newMatrix.reverse();
}

function playerRotate(dir) {
    const pos = currentPiece.pos.x;
    let offset = 1;
    const rotatedMatrix = rotate(currentPiece.matrix, dir);
    currentPiece.matrix = rotatedMatrix;
    while (collides(currentPiece, grid)) {
        currentPiece.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > currentPiece.matrix[0].length) {
            currentPiece.matrix = rotate(currentPiece.matrix, -dir);
            currentPiece.pos.x = pos;
            return;
        }
    }
}

function playerMove(dir) {
    currentPiece.pos.x += dir;
    if (collides(currentPiece, grid)) {
        currentPiece.pos.x -= dir;
    }
}

function playerDrop() {
    currentPiece.pos.y++;
    if (collides(currentPiece, grid)) {
        currentPiece.pos.y--;
        mergeToGrid(currentPiece, grid);
        clearLines();
        if (!isAnimating) {
            spawnNewPiece();
        }
    }
    dropCounter = 0;
}

function hardDrop() {
    while (!collides(currentPiece, grid)) {
        currentPiece.pos.y++;
    }
    currentPiece.pos.y--;
    
    // Create particles on hard drop
    const pieceColor = COLORS[currentPiece.matrix.flat().find(v => v !== 0)];
    currentPiece.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                createParticles(currentPiece.pos.x + x + 0.5, currentPiece.pos.y + y + 0.5, 5, pieceColor);
            }
        });
    });

    mergeToGrid(currentPiece, grid);
    clearLines();
    if (!isAnimating) {
        spawnNewPiece();
    }
}

function clearLines() {
    const clearedRows = [];
    outer: for (let y = grid.length - 1; y > 0; --y) {
        for (let x = 0; x < grid[y].length; ++x) {
            if (grid[y][x] === 0) {
                continue outer;
            }
        }
        clearedRows.push(y);
    }

    if (clearedRows.length > 0) {
        isAnimating = true;
        clearedRows.forEach(y => {
            grid[y].fill(9);
        });

        setTimeout(() => {
            clearedRows.forEach(y => {
                for (let x = 0; x < COLS; x++) {
                    createParticles(x + 0.5, y + 0.5, 3, '#FFFFFF');
                }
            });

            let linesCleared = clearedRows.length;
            grid = grid.filter((_, index) => !clearedRows.includes(index));
            while(linesCleared--) {
                grid.unshift(new Array(COLS).fill(0));
            }

            lines += clearedRows.length;
            score += clearedRows.length * 100 * level;
            if (clearedRows.length > 1) score += (clearedRows.length - 1) * 100; // Bonus
            level = Math.floor(lines / 10) + 1;
            dropInterval = 1000 / level;
            updateUI();
            isAnimating = false;
            spawnNewPiece();
        }, 400);
    }
}

function drawMatrix(matrix, offset, ctx, isGhost = false) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                if (isGhost) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                } else {
                    ctx.fillStyle = COLORS[value] || '#888';
                }
                ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
            }
        });
    });
}

function draw() {
    context.globalAlpha = 1.0;
    context.fillStyle = '#000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawMatrix(grid, { x: 0, y: 0 }, context);

    if (!isAnimating) {
        const ghostPiece = JSON.parse(JSON.stringify(currentPiece));
        while (!collides(ghostPiece, grid)) {
            ghostPiece.pos.y++;
        }
        ghostPiece.pos.y--;
        drawMatrix(ghostPiece.matrix, ghostPiece.pos, context, true);
        drawMatrix(currentPiece.matrix, currentPiece.pos, context);
    }
    updateAndDrawParticles();
}

function drawNextPiece() {
    nextContext.fillStyle = '#000';
    nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (nextPiece) {
        const matrix = nextPiece.matrix;
        const offset = { 
            x: Math.floor(4 / 2 - matrix[0].length / 2),
            y: Math.floor(4 / 2 - matrix.length / 2)
        };
        drawMatrix(matrix, offset, nextContext);
    }
}

function updateUI() {
    scoreElement.innerText = score;
    linesElement.innerText = lines;
    levelElement.innerText = level;
}

function update(time = 0) {
    const deltaTime = time - lastTime;
    lastTime = time;

    if (!isAnimating) {
        dropCounter += deltaTime;
        if (dropCounter > dropInterval) {
            playerDrop();
        }
    }

    draw();
    animationFrameId = requestAnimationFrame(update);
}

function init() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    grid = createGrid(ROWS, COLS);
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = 1000;
    isAnimating = false;
    particles = [];
    const pieceTypes = 'TOLJISZ';
    nextPiece = createPiece(pieceTypes[Math.floor(Math.random() * pieceTypes.length)]);
    spawnNewPiece();
    updateUI();
    update();
}

document.addEventListener('keydown', (e) => {
    if (isAnimating) return;
    switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
            playerMove(-1);
            break;
        case 'ArrowRight':
        case 'KeyD':
            playerMove(1);
            break;
        case 'ArrowUp':
        case 'KeyW':
            playerRotate(1);
            break;
        case 'ArrowDown':
        case 'KeyS':
            playerDrop();
            break;
        case 'Space':
            if (e.repeat) return;
            hardDrop();
            break;
    }
});

init();
