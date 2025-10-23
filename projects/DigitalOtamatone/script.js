// script.js for Digital Otamatone

const otamatone = document.getElementById('otamatone');
const head = document.getElementById('head');
const stem = document.getElementById('stem');
const mouth = document.getElementById('mouth');

let audioContext;
let oscillator;
let gainNode;
let filterNode;
let isPlaying = false;

// Function to initialize audio context and nodes
function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        oscillator = audioContext.createOscillator();
        oscillator.type = 'sawtooth'; // Characteristic Otamatone sound

        filterNode = audioContext.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.value = 1000; // Initial filter frequency
        filterNode.Q.value = 1; // Resonance

        gainNode = audioContext.createGain();
        gainNode.gain.value = 0; // Start with volume off

        oscillator.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start(0);
    }
}

// Function to calculate frequency based on Y position on the stem
function calculateFrequency(yPos) {
    const stemRect = stem.getBoundingClientRect();
    // With the otamatone rotated 180deg, the visual top of the stem is now at stemRect.bottom
    // and the visual bottom (near the head) is at stemRect.top.
    // We want 0 at the bottom (near head) and 1 at the top of the stem for frequency mapping.
    const relativeY = yPos - stemRect.top; // Distance from the visual top of the stem
    const normalizedY = 1 - (relativeY / stemRect.height); // 0 at visual bottom, 1 at visual top

    // Map normalizedY to a frequency range (e.g., C3 to C6) using an exponential scale
    const minFreq = 130.81; // C3
    const maxFreq = 1046.50; // C6
    // Exponential mapping: freq = minFreq * (maxFreq/minFreq)^normalizedY
    return minFreq * Math.pow(maxFreq / minFreq, normalizedY);
}

// Function to handle touch/mouse start (press on head or stem)
function startPlaying(event) {
    event.preventDefault(); // Prevent scrolling on mobile
    initAudio();

    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    isPlaying = true;
    gainNode.gain.setTargetAtTime(0.5, audioContext.currentTime, 0.01); // Fade in volume
    head.classList.add('open'); // Open mouth visually

    // Update frequency immediately if touch is on stem
    // The event.target check is important to ensure frequency is only updated when touching the stem
    if (event.target === stem || stem.contains(event.target)) {
        updateFrequency(event);
    } else if (event.target === head || head.contains(event.target)) {
        // If touching the head, just open mouth, no frequency change yet
        // Frequency will be updated if user slides from head to stem
    }
}

// Function to handle touch/mouse move (slide on stem)
function updateFrequency(event) {
    if (!isPlaying) return;

    let clientY;
    if (event.touches && event.touches.length > 0) {
        clientY = event.touches[0].clientY;
    } else {
        clientY = event.clientY;
    }

    // Only update frequency if the touch/mouse is over the stem area
    const stemRect = stem.getBoundingClientRect();
    if (clientY >= stemRect.top && clientY <= stemRect.bottom) {
        const freq = calculateFrequency(clientY);
        oscillator.frequency.setTargetAtTime(freq, audioContext.currentTime, 0.01);

        // Simple filter control based on mouth state (can be more nuanced later)
        if (head.classList.contains('open')) {
            filterNode.frequency.setTargetAtTime(freq * 2, audioContext.currentTime, 0.01); // Filter opens with pitch
        } else {
            filterNode.frequency.setTargetAtTime(1000, audioContext.currentTime, 0.01); // Filter closes
        }
    }
}

// Function to handle touch/mouse end (release)
function stopPlaying() {
    if (!isPlaying) return;

    gainNode.gain.setTargetAtTime(0, audioContext.currentTime, 0.05); // Fade out volume
    isPlaying = false;
    head.classList.remove('open'); // Close mouth visually
}

// Event Listeners
// Use pointer events for better cross-device compatibility
otamatone.addEventListener('pointerdown', startPlaying);
otamatone.addEventListener('pointermove', updateFrequency);
window.addEventListener('pointerup', stopPlaying); // Listen globally for pointer up
// otamatone.addEventListener('pointerleave', stopPlaying); // Removed: too sensitive for mobile sliding

// Prevent context menu on long press on mobile
otamatone.addEventListener('contextmenu', (e) => e.preventDefault());
