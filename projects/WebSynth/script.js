document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const keyboardContainer = document.querySelector('.keyboard-container');
    const presetSelect = document.getElementById('preset-select');
    const oscilloscopeCanvas = document.getElementById('oscilloscope');
    const allSliders = document.querySelectorAll('input[type="range"]');

    // --- Audio Context & Master Nodes ---
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const masterGain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    const analyser = audioContext.createAnalyser();
    
    masterGain.gain.value = 1;

    masterGain.connect(filter);
    filter.connect(analyser);
    analyser.connect(audioContext.destination);

    // --- Synth Parameters ---
    let synthParams = {
        filter: { cutoff: 20000, resonance: 0 },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.5 },
        oscillators: [
            { waveform: 'sawtooth', volume: 0.5, pan: 0, coarsePitch: 0, finePitch: 0 },
            { waveform: 'sawtooth', volume: 0.5, pan: 0, coarsePitch: 0, finePitch: 0 },
            { waveform: 'sawtooth', volume: 0.5, pan: 0, coarsePitch: 0, finePitch: 0 },
        ]
    };

    let activeNotes = {};
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    // --- Presets ---
    const presets = {
        'default': JSON.parse(JSON.stringify(synthParams)),
        'piano': {
            filter: { cutoff: 18000, resonance: 0.1 },
            envelope: { attack: 0.01, decay: 0.5, sustain: 0.1, release: 0.2 },
            oscillators: [
                { waveform: 'square', volume: 0.6, pan: 0, coarsePitch: 0, finePitch: 0 },
                { waveform: 'triangle', volume: 0.4, pan: -0.05, coarsePitch: 12, finePitch: 3 },
                { waveform: 'sine', volume: 0.3, pan: 0.05, coarsePitch: 24, finePitch: -3 },
            ]
        },
        'violin': {
            filter: { cutoff: 7500, resonance: 2.5 },
            envelope: { attack: 0.4, decay: 0.8, sustain: 0.7, release: 0.5 },
            oscillators: [
                { waveform: 'sawtooth', volume: 0.5, pan: -0.1, coarsePitch: 0, finePitch: -5 },
                { waveform: 'sawtooth', volume: 0.5, pan: 0.1, coarsePitch: 0, finePitch: 5 },
                { waveform: 'sine', volume: 0.3, pan: 0, coarsePitch: 12, finePitch: 0 },
            ]
        },
        'trumpet': {
            filter: { cutoff: 6000, resonance: 7 },
            envelope: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.25 },
            oscillators: [
                { waveform: 'sawtooth', volume: 0.7, pan: 0, coarsePitch: 0, finePitch: 0 },
                { waveform: 'square', volume: 0.3, pan: 0.05, coarsePitch: 12, finePitch: 0 },
                { waveform: 'sine', volume: 0.1, pan: -0.05, coarsePitch: -12, finePitch: 0 },
            ]
        },
        'bass': {
            filter: { cutoff: 800, resonance: 10 },
            envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.2 },
            oscillators: [
                { waveform: 'square', volume: 0.6, pan: -0.1, coarsePitch: -12, finePitch: 0 },
                { waveform: 'sawtooth', volume: 0.4, pan: 0.1, coarsePitch: -12, finePitch: 5 },
                { waveform: 'sine', volume: 0.3, pan: 0, coarsePitch: -24, finePitch: 0 },
            ]
        },
        'lead': {
            filter: { cutoff: 5000, resonance: 5 },
            envelope: { attack: 0.1, decay: 0.4, sustain: 0.5, release: 0.8 },
            oscillators: [
                { waveform: 'sawtooth', volume: 0.5, pan: -0.2, coarsePitch: 0, finePitch: -7 },
                { waveform: 'square', volume: 0.5, pan: 0.2, coarsePitch: 0, finePitch: 7 },
                { waveform: 'noise', volume: 0.05, pan: 0, coarsePitch: 0, finePitch: 0 },
            ]
        },
        'pad': {
            filter: { cutoff: 4000, resonance: 2 },
            envelope: { attack: 1.5, decay: 1.0, sustain: 0.8, release: 2.0 },
            oscillators: [
                { waveform: 'triangle', volume: 0.5, pan: -0.4, coarsePitch: 0, finePitch: -5 },
                { waveform: 'sine', volume: 0.5, pan: 0.4, coarsePitch: 0, finePitch: 5 },
                { waveform: 'sawtooth', volume: 0.3, pan: 0, coarsePitch: -12, finePitch: 0 },
            ]
        }
    };

    function updateSliderValue(input) {
        const valueDisplay = input.parentElement.querySelector('.slider-value');
        if (valueDisplay) {
            const value = parseFloat(input.value);
            if (Number.isInteger(parseFloat(input.step))) {
                valueDisplay.textContent = value.toFixed(0);
            } else {
                valueDisplay.textContent = value.toFixed(2);
            }
        }
    }
    
    function loadPreset(name) {
        const preset = presets[name];
        if (!preset) return;

        synthParams = JSON.parse(JSON.stringify(preset));

        // Update all sliders based on the new synthParams
        allSliders.forEach(slider => {
            const id = slider.id;
            if (id && synthParams.filter[id] !== undefined) {
                slider.value = synthParams.filter[id];
            } else if (id && synthParams.envelope[id] !== undefined) {
                slider.value = synthParams.envelope[id];
            } else {
                const oscWrapper = slider.closest('.oscillator');
                if (oscWrapper) {
                    const oscIndex = parseInt(oscWrapper.id.split('-')[1]) - 1;
                    const param = slider.dataset.param;
                    if (param && synthParams.oscillators[oscIndex][param] !== undefined) {
                        slider.value = synthParams.oscillators[oscIndex][param];
                    }
                }
            }
            updateSliderValue(slider);
        });

        // Update oscillator waveforms
        document.querySelectorAll('.oscillator').forEach((oscUI, i) => {
            oscUI.querySelector('.waveform-select').value = synthParams.oscillators[i].waveform;
        });
        
        filter.frequency.setValueAtTime(synthParams.filter.cutoff, audioContext.currentTime);
        filter.Q.setValueAtTime(synthParams.filter.resonance, audioContext.currentTime);
    }

    function populatePresets() {
        presetSelect.innerHTML = '';
        for (const name in presets) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name.charAt(0).toUpperCase() + name.slice(1);
            presetSelect.appendChild(option);
        }
    }

    // --- Event Listeners ---
    presetSelect.addEventListener('change', (e) => loadPreset(e.target.value));
    
    allSliders.forEach(slider => {
        slider.addEventListener('input', (e) => {
            const target = e.target;
            const value = parseFloat(target.value);
            updateSliderValue(target);

            const id = target.id;
            if (id && id in synthParams.filter) {
                synthParams.filter[id] = value;
                filter[id].value.setValueAtTime(value, audioContext.currentTime);
            } else if (id && id in synthParams.envelope) {
                synthParams.envelope[id] = value;
            } else {
                const oscWrapper = target.closest('.oscillator');
                if (oscWrapper) {
                    const oscIndex = parseInt(oscWrapper.id.split('-')[1]) - 1;
                    const param = target.dataset.param;
                    if (param) {
                        synthParams.oscillators[oscIndex][param] = value;
                        // Real-time update for active notes
                        for (const note in activeNotes) {
                            const oscNodeGroup = activeNotes[note][oscIndex];
                            if (oscNodeGroup && oscNodeGroup.osc) {
                                if (param === 'pan') {
                                    oscNodeGroup.panner.pan.setValueAtTime(value, audioContext.currentTime);
                                } else if (param === 'coarsePitch' || param === 'finePitch') {
                                    if (oscNodeGroup.osc.frequency) {
                                        oscNodeGroup.osc.frequency.setValueAtTime(
                                            noteToFrequency(note, synthParams.oscillators[oscIndex].coarsePitch, synthParams.oscillators[oscIndex].finePitch),
                                            audioContext.currentTime
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
    });

    document.querySelectorAll('.waveform-select').forEach((select, i) => {
        select.addEventListener('change', (e) => {
            synthParams.oscillators[i].waveform = e.target.value;
        });
    });


    // --- Audio Logic ---
    function noteToFrequency(note, coarsePitch, finePitch) {
        const a4 = 440;
        const semitones = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = parseInt(note.slice(-1));
        const keyNumber = semitones.indexOf(note.slice(0, -1));
        
        const semitonesFromA4 = 12 * (octave - 4) + (keyNumber - 9) + coarsePitch;
        const baseFreq = a4 * Math.pow(2, semitonesFromA4 / 12);
        return baseFreq * Math.pow(2, finePitch / 1200);
    }

    function playNote(note) {
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        if (activeNotes[note]) return;

        const now = audioContext.currentTime;
        const { attack, decay, sustain } = synthParams.envelope;
        
        const noteOscillators = [];

        synthParams.oscillators.forEach(oscParams => {
            if (oscParams.volume === 0) {
                noteOscillators.push(null);
                return;
            }

            const gain = audioContext.createGain();
            const panner = audioContext.createStereoPanner();
            let osc;

            if(oscParams.waveform === 'noise') {
                osc = audioContext.createBufferSource();
                const bufferSize = audioContext.sampleRate * 2;
                const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
                const output = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    output[i] = Math.random() * 2 - 1;
                }
                osc.buffer = buffer;
                osc.loop = true;
            } else {
                 osc = audioContext.createOscillator();
                 osc.type = oscParams.waveform;
                 osc.frequency.value = noteToFrequency(note, oscParams.coarsePitch, oscParams.finePitch);
            }

            osc.connect(gain);
            gain.connect(panner);
            panner.connect(masterGain);

            panner.pan.value = oscParams.pan;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(oscParams.volume, now + attack);
            gain.gain.linearRampToValueAtTime(oscParams.volume * sustain, now + attack + decay);

            osc.start(now);
            noteOscillators.push({ osc, gain, panner });
        });

        activeNotes[note] = noteOscillators;
        document.querySelector(`[data-note="${note}"]`).classList.add('active');
    }

    function stopNote(note) {
        if (!activeNotes[note]) return;

        const now = audioContext.currentTime;
        const { release } = synthParams.envelope;

        activeNotes[note].forEach(node => {
            if (node) {
                const { osc, gain } = node;
                gain.gain.cancelScheduledValues(now);
                gain.gain.setValueAtTime(gain.gain.value, now);
                gain.gain.linearRampToValueAtTime(0, now + release);
                osc.stop(now + release);
            }
        });

        delete activeNotes[note];
        const keyElement = document.querySelector(`[data-note="${note}"]`);
        if (keyElement) {
            keyElement.classList.remove('active');
        }
    }

    // --- UI Initialization ---
    const KEY_MAP = {
        'a': 'C4', 'w': 'C#4', 's': 'D4', 'e': 'D#4', 'd': 'E4', 'f': 'F4',
        't': 'F#4', 'g': 'G4', 'y': 'G#4', 'h': 'A4', 'u': 'A#4', 'j': 'B4',
        'k': 'C5', 'o': 'C#5', 'l': 'D5', 'p': 'D#5', ';': 'E5',
    };

    function createKeyboard() {
        for (let octave = 3; octave < 6; octave++) {
            notes.forEach(note => {
                const key = document.createElement('div');
                key.classList.add('key');
                if (note.includes('#')) key.classList.add('black');
                else key.classList.add('white');
                
                const noteName = note + octave;
                key.dataset.note = noteName;
                keyboardContainer.appendChild(key);

                key.addEventListener('mousedown', () => playNote(noteName));
                key.addEventListener('mouseup', () => stopNote(noteName));
                key.addEventListener('mouseleave', () => stopNote(noteName));
            });
        }
    }

    const canvasCtx = oscilloscopeCanvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function drawOscilloscope() {
        requestAnimationFrame(drawOscilloscope);
        analyser.getByteTimeDomainData(dataArray);
        const sliceWidth = oscilloscopeCanvas.width * 1.0 / bufferLength;
        let x = 0;

        canvasCtx.fillStyle = '#282c34';
        canvasCtx.fillRect(0, 0, oscilloscopeCanvas.width, oscilloscopeCanvas.height);
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = '#61afef';
        canvasCtx.beginPath();

        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * oscilloscopeCanvas.height / 2;
            if (i === 0) canvasCtx.moveTo(x, y);
            else canvasCtx.lineTo(x, y);
            x += sliceWidth;
        }
        canvasCtx.lineTo(oscilloscopeCanvas.width, oscilloscopeCanvas.height / 2);
        canvasCtx.stroke();
    }


    // --- Keyboard Input ---
    document.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        const note = KEY_MAP[e.key];
        if (note) {
            playNote(note);
        }
    });

    document.addEventListener('keyup', (e) => {
        const note = KEY_MAP[e.key];
        if (note) {
            stopNote(note);
        }
    });

    // --- Start ---
    createKeyboard();
    populatePresets();
    loadPreset('default');
    analyser.fftSize = 2048;
    drawOscilloscope();
});