window.addEventListener('load', () => {
    // --- Matter.js Aliases ---
    const { Engine, Render, Runner, World, Bodies, Body, Composite, Composites, Constraint, Events, Vector, Mouse, Vertices, Query, MouseConstraint } = Matter;

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
    let selectedBody = null;
    let currentPoints = [];
    let currentChain = null;
    let chainStartLink = null;
    let canCloseChain = false;
    let dragStartPoint = null;
    let draggedGearProps = null;
    const mouse = Mouse.create(canvas);
    const mouseConstraint = MouseConstraint.create(engine, {
        mouse: mouse,
        constraint: { stiffness: 0.2, render: { visible: false } }
    });
    World.add(world, mouseConstraint);

    // --- Creation Functions ---
    function createGear(x, y, radius, isPowered) {
        const gear = Bodies.circle(x, y, radius, { friction: 0.8, restitution: 0.1, density: 0.02 });
        gear.isGear = true;
        if (isPowered) {
            gear.isMotorized = true;
        }
        const axle = Constraint.create({ pointA: { x: x, y: y }, bodyB: gear, stiffness: 1 });
        const gearComposite = Composite.create({ bodies: [gear], constraints: [axle] });
        gear.parentComposite = gearComposite;
        World.add(world, gearComposite);
        return gearComposite;
    }

    // --- Tool Logic ---
    function handleMouseDown() {
        if (mouseConstraint.body) { 
            if (currentTool === 'select') { selectedBody = mouseConstraint.body; }
            return;
        }
        isDrawing = true;
        const mousePos = mouse.position;
        if (currentTool === 'polygon') {
            currentPoints = [{ x: mousePos.x, y: mousePos.y }];
        } else if (currentTool === 'chain') {
            currentChain = Composite.create();
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
            if (Math.hypot(mousePos.x - lastPoint.x, mousePos.y - lastPoint.y) > 10) {
                currentPoints.push({ x: mousePos.x, y: mousePos.y });
            }
        } else if (currentTool === 'chain') {
            const lastLink = currentChain.bodies[currentChain.bodies.length - 1];
            if (Math.hypot(mousePos.x - lastLink.position.x, mousePos.y - lastLink.position.y) > 20) {
                const newLink = Bodies.circle(mousePos.x, mousePos.y, 10, { density: 0.1, friction: 0.8, render: { fillStyle: '#555'} });
                const constraint = Constraint.create({ bodyA: lastLink, bodyB: newLink, stiffness: 0.8, length: 20 });
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
            currentChain = null; chainStartLink = null; canCloseChain = false;
        } else if (currentTool === 'powered-gear' || currentTool === 'passive-gear') {
            if (!dragStartPoint) return;
            const radius = Math.hypot(mousePos.x - dragStartPoint.x, mousePos.y - dragStartPoint.y);
            if (radius > 10) {
                createGear(dragStartPoint.x, dragStartPoint.y, radius, currentTool === 'powered-gear');
            }
            dragStartPoint = null;
        }
    }

    // --- Event Handlers ---
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);

    Events.on(mouseConstraint, 'mousedown', (event) => {
        const body = mouseConstraint.body;
        if (body && body.isGear) {
            draggedGearProps = { 
                radius: body.circleRadius, 
                isMotorized: body.isMotorized 
            };
            World.remove(world, body.parentComposite);
            isDrawing = false; // Cancel any other drawing action
        }
    });

    Events.on(mouseConstraint, 'mouseup', (event) => {
        if (draggedGearProps) {
            const finalPosition = event.mouse.position;
            createGear(finalPosition.x, finalPosition.y, draggedGearProps.radius, draggedGearProps.isMotorized);
            draggedGearProps = null;
        }
    });

    // --- Main Loop ---
    Events.on(engine, 'beforeUpdate', (event) => {
        const allBodies = Composite.allBodies(world);
        allBodies.forEach(body => {
            if (body.isMotorized) { body.torque = 0.5; }
        });
    });

    Events.on(render, 'afterRender', () => {
        // Previews & Highlights
        if (isDrawing) {
            if (currentTool === 'polygon' && currentPoints.length > 1) {
                ctx.beginPath();
                ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
                for (let i = 1; i < currentPoints.length; i++) { ctx.lineTo(currentPoints[i].x, currentPoints[i].y); }
                ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
            } else if ((currentTool === 'powered-gear' || currentTool === 'passive-gear') && dragStartPoint) {
                const radius = Math.hypot(mouse.position.x - dragStartPoint.x, mouse.position.y - dragStartPoint.y);
                ctx.beginPath(); ctx.arc(dragStartPoint.x, dragStartPoint.y, radius, 0, 2 * Math.PI);
                ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
            }
        }
        if (draggedGearProps) { // Draw ghost gear while dragging
            ctx.save();
            ctx.globalAlpha = 0.5;
            const radius = draggedGearProps.radius;
            ctx.beginPath();
            ctx.arc(mouse.position.x, mouse.position.y, radius, 0, 2 * Math.PI);
            ctx.fillStyle = '#555';
            ctx.fill();
            for (let i = 0; i < 6; i++) {
                ctx.moveTo(mouse.position.x, mouse.position.y);
                ctx.lineTo(mouse.position.x + Math.cos(i * Math.PI / 3) * radius, mouse.position.y + Math.sin(i * Math.PI / 3) * radius);
            }
            ctx.strokeStyle = draggedGearProps.isMotorized ? '#ff4500' : '#444';
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.restore();
        }
        if (canCloseChain) {
            ctx.beginPath(); ctx.arc(chainStartLink.position.x, chainStartLink.position.y, 15, 0, 2 * Math.PI);
            ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)'; ctx.lineWidth = 3; ctx.stroke();
        }
        const allBodies = Composite.allBodies(world);
        allBodies.forEach(body => {
            if (body.isGear) {
                ctx.save();
                ctx.translate(body.position.x, body.position.y);
                ctx.rotate(body.angle);
                const radius = body.circleRadius;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) { ctx.moveTo(0, 0); ctx.lineTo(radius, 0); ctx.rotate(Math.PI / 3); }
                ctx.strokeStyle = body.isMotorized ? '#ff4500' : '#444';
                ctx.lineWidth = 4;
                ctx.stroke();
                ctx.restore();
            }
        });
        if (selectedBody) {
            ctx.beginPath();
            ctx.moveTo(selectedBody.vertices[0].x, selectedBody.vertices[0].y);
            for (let i = 1; i < selectedBody.vertices.length; i++) { ctx.lineTo(selectedBody.vertices[i].x, selectedBody.vertices[i].y); }
            ctx.closePath();
            ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 3; ctx.stroke();
        }
    });

    // --- Toolbar Logic ---
    let activeToolButton = document.querySelector(`[data-tool='select']`);
    if (activeToolButton) activeToolButton.classList.add('active');
    toolbar.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && e.target.dataset.tool) {
            if (activeToolButton) activeToolButton.classList.remove('active');
            currentTool = e.target.dataset.tool;
            activeToolButton = e.target;
            activeToolButton.classList.add('active');
            if (currentTool !== 'select') { selectedBody = null; }
        }
    });

    // --- Control Buttons ---
    clearButton.addEventListener('click', () => {
        const allBodies = Composite.allBodies(world);
        const bodiesToRemove = allBodies.filter(body => !body.isStatic);
        World.remove(world, bodiesToRemove);
        selectedBody = null;
    });

    pauseButton.addEventListener('click', () => {
        isPaused = !isPaused;
        runner.enabled = !isPaused;
        pauseButton.textContent = isPaused ? 'Play' : 'Pause';
        if (isPaused) { pauseButton.style.backgroundColor = '#28a745'; } 
        else { pauseButton.style.backgroundColor = ''; }
    });

    window.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBody) {
            if (selectedBody.parentComposite) {
                 World.remove(world, selectedBody.parentComposite);
            } else {
                 World.remove(world, selectedBody);
            }
            selectedBody = null;
        }
    });
});
