// script.js for Digital Kalimba

const tinesContainer = document.getElementById('tines-container');
const kalimbaBody = document.getElementById('kalimba-body');

let audioContext;

// Define notes for a standard Kalimba (e.g., C Major scale, 17 tines)
// The order is typically alternating from the center outwards
const kalimbaNotes = [
    { note: 'D5', freq: 587.33 }, // 1
    { note: 'B4', freq: 493.88 }, // 2
    { note: 'G4', freq: 392.00 }, // 3
    { note: 'E4', freq: 329.63 }, // 4
    { note: 'C4', freq: 261.63 }, // 5 (Center)
    { note: 'A3', freq: 220.00 }, // 6
    { note: 'F3', freq: 174.61 }, // 7
    { note: 'D3', freq: 146.83 }, // 8
    { note: 'C5', freq: 523.25 }, // 9
    { note: 'E5', freq: 659.25 }, // 10
    { note: 'G5', freq: 783.99 }, // 11
    { note: 'B5', freq: 987.77 }, // 12
    { note: 'D6', freq: 1174.66 }, // 13
    { note: 'F6', freq: 1396.91 }, // 14
    { note: 'A6', freq: 1760.00 }, // 15
    { note: 'C7', freq: 2093.00 }, // 16
    { note: 'E7', freq: 2637.02 }  // 17
];

// Sort notes to simulate typical kalimba layout (center C, then alternating left/right)
// This is a simplified sorting for visual representation, actual kalimbas have specific patterns
kalimbaNotes.sort((a, b) => a.freq - b.freq);

// Function to initialize audio context
function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

// Function to play a plucked sound
function playTineSound(frequency) {
    initAudio();

    const oscillator = audioContext.createOscillator();
    oscillator.type = 'triangle'; // A good starting point for plucked sounds
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

    const gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.01); // Attack
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.0); // Decay over 1 second

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5); // Stop after decay
}

// Function to create tines dynamically
function createTines() {
    tinesContainer.innerHTML = ''; // Clear existing tines
    const numTines = kalimbaNotes.length;

    // Calculate base width for tines to fit, with some gap
    const containerWidth = tinesContainer.clientWidth;
    const gap = 2; // px
    const baseTineWidth = (containerWidth - (numTines - 1) * gap) / numTines;

    kalimbaNotes.forEach((note, index) => {
        const tine = document.createElement('div');
        tine.classList.add('tine');
        tine.dataset.frequency = note.freq;
        tine.dataset.note = note.note;

        // Adjust tine width and height for visual variation (simulating real kalimba)
        // Center tine is longest, outer tines are shorter
        const centerIndex = Math.floor(numTines / 2);
        const distanceToCenter = Math.abs(index - centerIndex);
        const heightMultiplier = 1 - (distanceToCenter / numTines) * 0.4; // Shorter outer tines
        const widthMultiplier = 1 - (distanceToCenter / numTines) * 0.2; // Slightly narrower outer tines

        tine.style.width = `${baseTineWidth * widthMultiplier}px`;
        tine.style.height = `${150 * heightMultiplier}px`; // 150px is base height from CSS
        tine.style.zIndex = numTines - distanceToCenter; // Outer tines appear behind

        // Add a small label for the note (optional, for debugging/learning)
        // const label = document.createElement('span');
        // label.textContent = note.note;
        // tine.appendChild(label);

        tinesContainer.appendChild(tine);
    });
}

// Event Listeners for tines
tinesContainer.addEventListener('pointerdown', (event) => {
    const targetTine = event.target.closest('.tine');
    if (targetTine) {
        targetTine.classList.add('active');
        const frequency = parseFloat(targetTine.dataset.frequency);
        playTineSound(frequency);
    }
});

tinesContainer.addEventListener('pointerup', (event) => {
    const targetTine = event.target.closest('.tine');
    if (targetTine) {
        targetTine.classList.remove('active');
    }
});

// Handle pointerleave if user slides off a tine (optional, might be too sensitive)
// tinesContainer.addEventListener('pointerleave', (event) => {
//     const targetTine = event.target.closest('.tine');
//     if (targetTine) {
//         targetTine.classList.remove('active');
//     }
// });

// Initial setup
createTines();
window.addEventListener('resize', createTines); // Recreate tines on resize
