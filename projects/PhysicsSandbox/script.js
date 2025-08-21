window.addEventListener('load', () => {
    // --- Matter.js Aliases ---
    const { Engine, Render, Runner, World, Bodies, Body, Composite, Composites, Constraint, Events, Vector, Mouse, Vertices, Query } = Matter;

    // --- DOM Elements ---
    const gameContainer = document.getElementById('game-container');
    const toolbar = document.getElementById('toolbar');
    const clearButton = document.getElementById('clear-button');
    const pauseButton = document.getElementById('pause-button');

    // --- Game & Engine Setup ---
    const screenWidth = gameContainer.clientWidth;
    const screenHeight = gameContainer.clientHeight;
    const engine = Engine.create();
    const world = engine.world;
    const render = Render.create({
        element: gameContainer,
        engine: engine,
        options: {
            width: screenWidth,
            height: screenHeight,
            wireframes: false,
            background: '#f0f8ff'
        }
    });
    const canvas = render.canvas;
    const ctx = canvas.getContext('2d');
    Render.run(render);
    const runner = Runner.create();
    Runner.run(runner, engine);

    // --- World Boundaries ---
    const wallThickness = 50;
    World.add(world, [
        Bodies.rectangle(screenWidth / 2, -wallThickness / 2, screenWidth, wallThickness, { isStatic: true }),
        Bodies.rectangle(screenWidth / 2, screenHeight + wallThickness / 2, screenWidth, wallThickness, { isStatic: true }),
        Bodies.rectangle(-wallThickness / 2, screenHeight / 2, wallThickness, screenHeight, { isStatic: true }),
        Bodies.rectangle(screenWidth + wallThickness / 2, screenHeight / 2, wallThickness, screenHeight, { isStatic: true })
    ]);

    // --- Tool State & Mouse Management ---
    let currentTool = 'polygon';
    let isDrawing = false;
    let isPaused = false;
    let currentPoints = [];
    let currentChain = null;
    let chainStartLink = null;
    let canCloseChain = false;
    let dragStartPoint = null;
    const mouse = Mouse.create(canvas);
    const minDistance = 10;

    // --- Tool Logic ---
    function handleMouseDown() {
        isDrawing = true;
        const mousePos = mouse.position;
        if (currentTool === 'polygon') {
            currentPoints = [{ x: mousePos.x, y: mousePos.y }];
        } else if (currentTool === 'chain') {
            currentChain = Composite.create();
            // Chains no longer use collision groups to ensure they interact with gears
            chainStartLink = Bodies.circle(mousePos.x, mousePos.y, 10, { density: 0.1, friction: 0.8, render: { fillStyle: '#555'} });
            Composite.add(currentChain, chainStartLink);
            World.add(world, currentChain);
        } else if (currentTool === 'powered-gear' || currentTool === 'passive-gear') {
            dragStartPoint = { x: mousePos.x, y: mousePos.y };
        }
    }

    function handleMouseMove() {
        if (!isDrawing) return;
        const mousePos = mouse.position;
        if (currentTool === 'polygon') {
            const lastPoint = currentPoints[currentPoints.length - 1];
            if (Math.hypot(mousePos.x - lastPoint.x, mousePos.y - lastPoint.y) > minDistance) {
                currentPoints.push({ x: mousePos.x, y: mousePos.y });
            }
        } else if (currentTool === 'chain') {
            const lastLink = currentChain.bodies[currentChain.bodies.length - 1];
            if (Math.hypot(mousePos.x - lastLink.position.x, mousePos.y - lastLink.position.y) > 20) {
                const newLink = Bodies.circle(mousePos.x, mousePos.y, 10, { 
                    density: 0.1, 
                    friction: 0.8,
                    render: { fillStyle: '#555'}
                });
                const constraint = Constraint.create({
                    bodyA: lastLink,
                    bodyB: newLink,
                    stiffness: 0.8,
                    length: 20
                });
                Composite.add(currentChain, [newLink, constraint]);
            }
            const distToStart = Math.hypot(mousePos.x - chainStartLink.position.x, mousePos.y - chainStartLink.position.y);
            canCloseChain = distToStart < 30;
        }
    }

    function handleMouseUp() {
        isDrawing = false;
        const mousePos = mouse.position;
        if (currentTool === 'polygon') {
            if (currentPoints.length >= 3) {
                try {
                    const center = Vertices.centre(currentPoints);
                    const newBody = Bodies.fromVertices(center.x, center.y, [currentPoints], { friction: 0.5, restitution: 0.3 });
                    World.add(world, newBody);
                } catch (e) { console.error("Could not create body from vertices.", e); }
            }
            currentPoints = [];
        } else if (currentTool === 'chain') {
            if (canCloseChain) {
                const lastLink = currentChain.bodies[currentChain.bodies.length - 1];
                const closingConstraint = Constraint.create({ bodyA: lastLink, bodyB: chainStartLink, stiffness: 0.8, length: 20 });
                Composite.add(currentChain, closingConstraint);
            }
            currentChain = null;
            chainStartLink = null;
            canCloseChain = false;
        } else if (currentTool === 'powered-gear' || currentTool === 'passive-gear') {
            const radius = Math.hypot(mousePos.x - dragStartPoint.x, mousePos.y - dragStartPoint.y);
            if (radius > 10) {
                const gear = Bodies.circle(dragStartPoint.x, dragStartPoint.y, radius, {
                    friction: 0.8,
                    restitution: 0.1,
                    density: 0.01
                });
                gear.isGear = true;
                const axle = Constraint.create({
                    pointA: { x: dragStartPoint.x, y: dragStartPoint.y },
                    bodyB: gear
                });
                if (currentTool === 'powered-gear') {
                    gear.isMotorized = true;
                }
                World.add(world, [gear, axle]);
            }
            dragStartPoint = null;
        }
    }

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);

    // --- Main Loop ---
    Events.on(engine, 'beforeUpdate', (event) => {
        const allBodies = Composite.allBodies(world);
        allBodies.forEach(body => {
            if (body.isMotorized) {
                body.torque = 0.5; // Increased torque for better power
            }
        });
    });

    Events.on(render, 'afterRender', () => {
        // Draw previews
        if (isDrawing && currentTool === 'polygon' && currentPoints.length > 1) {
            ctx.beginPath();
            ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
            for (let i = 1; i < currentPoints.length; i++) { ctx.lineTo(currentPoints[i].x, currentPoints[i].y); }
            ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
        } else if (isDrawing && (currentTool === 'powered-gear' || currentTool === 'passive-gear') && dragStartPoint) {
            const radius = Math.hypot(mouse.position.x - dragStartPoint.x, mouse.position.y - dragStartPoint.y);
            ctx.beginPath(); ctx.arc(dragStartPoint.x, dragStartPoint.y, radius, 0, 2 * Math.PI);
            ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
        }
        if (canCloseChain) {
            ctx.beginPath(); ctx.arc(chainStartLink.position.x, chainStartLink.position.y, 15, 0, 2 * Math.PI);
            ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)'; ctx.lineWidth = 3; ctx.stroke();
        }
        // Draw gear visuals
        const allBodies = Composite.allBodies(world);
        allBodies.forEach(body => {
            if (body.isGear) {
                ctx.save();
                ctx.translate(body.position.x, body.position.y);
                ctx.rotate(body.angle);
                const radius = body.circleRadius;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    ctx.moveTo(0, 0);
                    ctx.lineTo(radius, 0);
                    ctx.rotate(Math.PI / 3);
                }
                ctx.strokeStyle = body.isMotorized ? '#ff4500' : '#444';
                ctx.lineWidth = 4;
                ctx.stroke();
                ctx.restore();
            }
        });
    });

    // --- Toolbar Logic ---
    let activeToolButton = document.querySelector(`[data-tool='polygon']`);
    if (activeToolButton) activeToolButton.classList.add('active');
    toolbar.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && e.target.dataset.tool) {
            if (activeToolButton) activeToolButton.classList.remove('active');
            currentTool = e.target.dataset.tool;
            activeToolButton = e.target;
            activeToolButton.classList.add('active');
        }
    });

    // --- Control Buttons ---
    clearButton.addEventListener('click', () => {
        const allBodies = Composite.allBodies(world);
        const bodiesToRemove = allBodies.filter(body => !body.isStatic);
        World.remove(world, bodiesToRemove);
    });

    pauseButton.addEventListener('click', () => {
        isPaused = !isPaused;
        runner.enabled = !isPaused;
        pauseButton.textContent = isPaused ? 'Play' : 'Pause';
        if (isPaused) { pauseButton.style.backgroundColor = '#28a745'; } 
        else { pauseButton.style.backgroundColor = ''; }
    });
});