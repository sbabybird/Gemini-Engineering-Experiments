window.addEventListener('load', () => {
    // --- Matter.js Aliases ---
    const { Engine, Render, Runner, World, Bodies, Body, Composite, Composites, Constraint, Events, Vector, Mouse, Vertices, Query, MouseConstraint } = Matter;

    // --- DOM Elements ---
    const gameContainer = document.getElementById('game-container');
    const toolbar = document.getElementById('toolbar');
    const clearButton = document.getElementById('clear-button');
    const pauseButton = document.getElementById('pause-button');
    const propertyPanel = document.getElementById('property-panel');
    const panelHeader = document.getElementById('panel-header');
    const motorProperty = document.getElementById('motor-property');
    const motorCheckbox = document.getElementById('motor-checkbox');
    const powerProperty = document.getElementById('power-property');
    const powerSlider = document.getElementById('power-slider');

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
    let currentTool = 'select';
    let isDrawing = false;
    let isPaused = false;
    let selectedBody = null;
    let currentPoints = [];
    let currentChain = null;
    let chainStartLink = null;
    let canCloseChain = false;
    let dragStartPoint = null;
    const mouse = Mouse.create(canvas);
    const mouseConstraint = MouseConstraint.create(engine, {
        mouse: mouse,
        constraint: { stiffness: 0.2, render: { visible: false } }
    });
    World.add(world, mouseConstraint);

    // --- Creation Functions ---
    function createGear(x, y, radius, isPowered = false, motorPower = 0.5) {
        const gear = Bodies.circle(x, y, radius, { friction: 0.8, restitution: 0.1, density: 0.02 });
        gear.isGear = true;
        gear.isMotorized = isPowered;
        gear.motorPower = motorPower;
        const axle = Constraint.create({ pointA: { x: x, y: y }, bodyB: gear, stiffness: 1 });
        gear.axleConstraint = axle;
        World.add(world, [gear, axle]);
        return gear;
    }

    // --- Event Handlers ---
    function handleMouseDown(event) {
        const bodiesUnderMouse = Query.point(Composite.allBodies(world), mouse.position);
        if (bodiesUnderMouse.length > 0) { return; }
        isDrawing = true;
        const mousePos = mouse.position;
        dragStartPoint = { x: mousePos.x, y: mousePos.y };
        if (currentTool === 'polygon') {
            currentPoints = [{ x: mousePos.x, y: mousePos.y }];
        } else if (currentTool === 'chain') {
            currentChain = Composite.create();
            chainStartLink = Bodies.circle(mousePos.x, mousePos.y, 10, { density: 0.1, friction: 0.8, render: { fillStyle: '#555'} });
            Composite.add(currentChain, chainStartLink);
            World.add(world, currentChain);
        }
    }

    function handleMouseMove(event) {
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

    function handleMouseUp(event) {
        if (!isDrawing) return;
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
        } else if (currentTool === 'gear') {
            if (!dragStartPoint) return;
            const radius = Math.hypot(mousePos.x - dragStartPoint.x, mousePos.y - dragStartPoint.y);
            if (radius > 10) {
                createGear(dragStartPoint.x, dragStartPoint.y, radius, true);
            }
            dragStartPoint = null;
        }
    }

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);

    Events.on(mouseConstraint, 'mousedown', (event) => {
        const body = mouseConstraint.body;
        if (!body) { setSelectedBody(null); return; }
        setSelectedBody(body);
    });

    Events.on(mouseConstraint, 'startdrag', (event) => {
        const body = event.body;
        if (body.isGear && body.axleConstraint) {
            World.remove(world, body.axleConstraint);
        }
    });

    Events.on(mouseConstraint, 'enddrag', (event) => {
        const body = event.body;
        if (body.isGear) {
            body.axleConstraint = Constraint.create({ pointA: body.position, bodyB: body, stiffness: 1 });
            World.add(world, body.axleConstraint);
            setSelectedBody(body);
        }
    });

    // --- Property Editor Logic ---
    function setSelectedBody(body) {
        if (body && body.isStatic) {
            selectedBody = null;
            return;
        }
        selectedBody = body;
        
        if (selectedBody && selectedBody.isGear) {
            motorProperty.style.display = 'flex';
            powerProperty.style.display = 'flex';
            motorCheckbox.checked = selectedBody.isMotorized || false;
            powerSlider.value = selectedBody.motorPower || 0.5;
            propertyPanel.classList.remove('collapsed');
        } else {
            motorProperty.style.display = 'none';
            powerProperty.style.display = 'none';
            if (selectedBody) {
                 propertyPanel.classList.remove('collapsed');
            } else {
                 propertyPanel.classList.add('collapsed');
            }
        }
    }

    motorCheckbox.addEventListener('change', () => {
        if (selectedBody && selectedBody.isGear) {
            selectedBody.isMotorized = motorCheckbox.checked;
        }
    });

    powerSlider.addEventListener('input', () => {
        if (selectedBody && selectedBody.isGear) {
            selectedBody.motorPower = parseFloat(powerSlider.value);
        }
    });

    panelHeader.addEventListener('click', () => {
        propertyPanel.classList.toggle('collapsed');
    });

    // --- Main Loop ---
    Events.on(engine, 'beforeUpdate', (event) => {
        const allBodies = Composite.allBodies(world);
        allBodies.forEach(body => {
            if (body.isMotorized) { body.torque = (body.motorPower || 0.5) * 5; }
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
            } else if (currentTool === 'gear' && dragStartPoint) {
                const radius = Math.hypot(mouse.position.x - dragStartPoint.x, mouse.position.y - dragStartPoint.y);
                ctx.beginPath(); ctx.arc(dragStartPoint.x, dragStartPoint.y, radius, 0, 2 * Math.PI);
                ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
            }
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
    let activeToolButton = document.querySelector(`[data-tool='polygon']`);
    if (activeToolButton) activeToolButton.classList.add('active');
    toolbar.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && e.target.dataset.tool) {
            if (activeToolButton) activeToolButton.classList.remove('active');
            currentTool = e.target.dataset.tool;
            activeToolButton = e.target;
            activeToolButton.classList.add('active');
            setSelectedBody(null);
        }
    });

    // --- Control Buttons ---
    clearButton.addEventListener('click', () => {
        const allBodies = Composite.allBodies(world);
        const bodiesToRemove = allBodies.filter(body => !body.isStatic);
        World.remove(world, bodiesToRemove);
        setSelectedBody(null);
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
            // When removing a gear, we need to remove its composite (body + axle)
            if (selectedBody.parentComposite) {
                 World.remove(world, selectedBody.parentComposite);
            } else {
                 World.remove(world, selectedBody);
            }
            setSelectedBody(null);
        }
    });
});
