import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- SCENE SETUP ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
camera.position.z = 120;

// --- LIGHTING ---
const pointLight = new THREE.PointLight(0xffffff, 4, 1000);
scene.add(pointLight);
const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
scene.add(ambientLight);

// --- HELPERS ---
const infoPanel = document.getElementById('current-object');

// --- PROCEDURAL STARFIELD ---
const starGeometry = new THREE.BufferGeometry();
const starVertices = [];
for (let i = 0; i < 10000; i++) {
    const x = (Math.random() - 0.5) * 2000;
    const y = (Math.random() - 0.5) * 2000;
    const z = (Math.random() - 0.5) * 2000;
    const d = Math.sqrt(x*x+y*y+z*z);
    if (d > 400 && d < 1000) starVertices.push(x, y, z);
}
starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: true, transparent: true, opacity: 0.8 });
const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

// --- NOISE FUNCTION (Used by shaders) ---
const noiseFunction = `
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
    float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m; m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5; vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g; g.x  = a0.x  * x0.x  + h.x  * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
    }
`;

// --- SUN ---
const sunGeometry = new THREE.SphereGeometry(7, 64, 64);
const sunMaterial = new THREE.ShaderMaterial({ /* ... */ });
const sun = new THREE.Mesh(sunGeometry, sunMaterial);
sun.name = 'Sun';
scene.add(sun);
sunMaterial.uniforms = { uTime: { value: 0 } };
sunMaterial.vertexShader = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
sunMaterial.fragmentShader = noiseFunction + `uniform float uTime; varying vec2 vUv; void main() { vec2 uv = vUv; float n = snoise(uv * 5.0 + uTime * 0.1) + snoise(uv * 10.0 + uTime * 0.2); float t = snoise(uv * 2.0 + uTime * 0.05); uv += t * 0.05; float fn = snoise(uv * 5.0 + uTime * 0.3); vec3 c1 = vec3(1.0, 0.8, 0.0); vec3 c2 = vec3(1.0, 0.2, 0.0); vec3 fc = mix(c1, c2, smoothstep(0.2, 0.8, fn)); float g = pow(0.5 - distance(vUv, vec2(0.5)), 2.0) * 2.0; gl_FragColor = vec4(fc * (1.0 + g), 1.0); }`;

// --- PLANET HELPERS ---
const planetVertexShader = `varying vec2 vUv; varying vec3 vNormal; varying vec3 vPosition; void main() { vUv = uv; vNormal = normalize(normalMatrix * normal); vPosition = vec3(modelMatrix * vec4(position, 1.0)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const lightingFragmentChunk = `vec3 lightDir = normalize(uLightPos - vPosition); float diff = max(dot(vNormal, lightDir), 0.0); vec3 diffuse = diff * finalColor; float ambient = 0.2; gl_FragColor = vec4(diffuse + ambient * finalColor, 1.0);`;

function createPlanet(name, size, orbitRadius, orbitSpeed, rotationSpeed, material) {
    const geometry = new THREE.SphereGeometry(size, 32, 32);
    const planet = new THREE.Mesh(geometry, material);
    planet.name = name;
    const orbit = new THREE.Object3D();
    orbit.add(planet);
    scene.add(orbit);
    // Add Orbit Path
    const orbitPathGeometry = new THREE.TorusGeometry(orbitRadius, 0.1, 16, 100);
    const orbitPathMaterial = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.2 });
    const orbitPath = new THREE.Mesh(orbitPathGeometry, orbitPathMaterial);
    orbitPath.rotation.x = Math.PI / 2;
    scene.add(orbitPath);

    return { planet, orbit, orbitRadius, orbitSpeed, rotationSpeed };
}

// --- PLANETS DATA ---
const earthMaterial = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uLightPos: { value: pointLight.position } }, vertexShader: planetVertexShader, fragmentShader: noiseFunction + `uniform float uTime; uniform vec3 uLightPos; varying vec2 vUv; varying vec3 vNormal; varying vec3 vPosition; void main() { float landNoise = snoise(vUv * 4.0); float landMass = smoothstep(0.0, 0.1, landNoise); vec3 seaColor = vec3(0.0, 0.2, 0.5); vec3 landColor = vec3(0.1, 0.4, 0.1); vec3 desertColor = vec3(0.7, 0.6, 0.4); landColor = mix(landColor, desertColor, smoothstep(0.2, 0.5, snoise(vUv * 8.0))); vec3 surfaceColor = mix(seaColor, landColor, landMass); float cloudNoise = snoise(vUv * 3.0 + uTime * 0.05); float clouds = smoothstep(0.4, 0.7, cloudNoise); vec3 cloudColor = vec3(1.0, 1.0, 1.0); vec3 finalColor = mix(surfaceColor, cloudColor, clouds);` + lightingFragmentChunk + `}` });
const marsMaterial = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uLightPos: { value: pointLight.position } }, vertexShader: planetVertexShader, fragmentShader: noiseFunction + `uniform float uTime; uniform vec3 uLightPos; varying vec2 vUv; varying vec3 vNormal; varying vec3 vPosition; void main() { float surfaceNoise = snoise(vUv * 10.0); vec3 redColor1 = vec3(0.6, 0.2, 0.1); vec3 redColor2 = vec3(0.9, 0.4, 0.2); vec3 surfaceColor = mix(redColor1, redColor2, smoothstep(0.2, 0.6, surfaceNoise)); float craterNoise = snoise(vUv * 25.0 + 0.5); float craters = smoothstep(0.8, 0.85, craterNoise) * 0.3; surfaceColor -= craters; float polarY = abs(vUv.y - 0.5) * 2.0; float polarCaps = smoothstep(0.85, 0.9, polarY); vec3 iceColor = vec3(0.9, 0.9, 1.0); vec3 finalColor = mix(surfaceColor, iceColor, polarCaps);` + lightingFragmentChunk + `}` });
const jupiterMaterial = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uLightPos: { value: pointLight.position } }, vertexShader: planetVertexShader, fragmentShader: noiseFunction + `uniform float uTime; uniform vec3 uLightPos; varying vec2 vUv; varying vec3 vNormal; varying vec3 vPosition; void main() { vec2 dUV = vec2(vUv.x + 0.1 * snoise(vec2(vUv.y * 5.0, uTime * 0.1)), vUv.y); float bn = snoise(dUV * 15.0); vec3 bc1 = vec3(0.8, 0.7, 0.6); vec3 bc2 = vec3(0.6, 0.5, 0.4); vec3 finalColor = mix(bc1, bc2, smoothstep(0.4, 0.6, bn)); vec2 spotUV = vUv - vec2(0.5, 0.65); float spotDist = length(spotUV * vec2(2.0, 1.0)); float spot = 1.0 - smoothstep(0.1, 0.2, spotDist); vec3 spotColor = vec3(0.7, 0.3, 0.1); finalColor = mix(finalColor, spotColor, spot);` + lightingFragmentChunk + `}` });
const saturnMaterial = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uLightPos: { value: pointLight.position } }, vertexShader: planetVertexShader, fragmentShader: noiseFunction + `uniform float uTime; uniform vec3 uLightPos; varying vec2 vUv; varying vec3 vNormal; varying vec3 vPosition; void main() { float n = snoise(vUv * 20.0 + uTime * 0.05); vec3 c1 = vec3(0.9, 0.8, 0.6); vec3 c2 = vec3(0.7, 0.6, 0.4); vec3 finalColor = mix(c1, c2, smoothstep(0.4, 0.6, n));` + lightingFragmentChunk + `}` });

const planets = [
    createPlanet('Earth', 2.5, 25, 0.5, 0.025, earthMaterial),      // Speed increased
    createPlanet('Mars', 1.2, 40, 0.3, 0.015, marsMaterial),        // Speed increased
    createPlanet('Jupiter', 6, 70, 0.1, 0.005, jupiterMaterial),     // Speed increased
    createPlanet('Saturn', 5, 100, 0.08, 0.004, saturnMaterial)     // Speed increased
];

// --- SATURN'S RINGS ---
const ringGeometry = new THREE.RingGeometry(7, 12, 64);
const ringMaterial = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uLightPos: { value: pointLight.position } }, vertexShader: `varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`, fragmentShader: noiseFunction + `uniform vec3 uLightPos; varying vec3 vPos; void main() { float dist = distance(vPos, vec3(0.0)); float n = snoise(vec2(dist * 5.0, dist * 2.0)); float ringPattern = smoothstep(0.2, 0.25, n) - smoothstep(0.3, 0.35, n); vec3 ringColor = vec3(0.7, 0.6, 0.5) * ringPattern; float light = max(0.2, dot(normalize(uLightPos - vPos), vec3(0.0, 1.0, 0.0))); gl_FragColor = vec4(ringColor * light, ringPattern); }`, side: THREE.DoubleSide, transparent: true });
const saturnsRings = new THREE.Mesh(ringGeometry, ringMaterial);
saturnsRings.rotation.x = Math.PI / 2;
planets[3].planet.add(saturnsRings);

// --- INTERACTION ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let targetObject = sun;

function onMouseClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0) {
        const firstIntersect = intersects[0].object;
        if (firstIntersect.name && firstIntersect.name !== '') {
            targetObject = firstIntersect;
            infoPanel.textContent = `Viewing: ${targetObject.name}`;
        }
    }
}
window.addEventListener('click', onMouseClick);

// --- ANIMATION LOOP ---
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    const timeSlow = time * 0.1;

    sunMaterial.uniforms.uTime.value = timeSlow;
    sun.rotation.y += 0.0005;

    planets.forEach(p => {
        p.orbit.position.x = Math.sin(time * p.orbitSpeed) * p.orbitRadius;
        p.orbit.position.z = Math.cos(time * p.orbitSpeed) * p.orbitRadius;
        p.planet.rotation.y += p.rotationSpeed;
        if (p.planet.material.uniforms.uTime) {
            p.planet.material.uniforms.uTime.value = timeSlow;
        }
    });

    // Camera Animation
    const targetPosition = new THREE.Vector3();
    targetObject.getWorldPosition(targetPosition);
    controls.target.lerp(targetPosition, 0.05);
    if (targetObject.name !== 'Sun') {
        const offset = new THREE.Vector3(0, 5, targetObject.geometry.parameters.radius * 5);
        camera.position.lerp(targetPosition.clone().add(offset), 0.05);
    }

    starMaterial.opacity = 0.6 + Math.sin(time * 5) * 0.2;
    controls.update();
    renderer.render(scene, camera);
}

// --- RESIZE HANDLER ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
