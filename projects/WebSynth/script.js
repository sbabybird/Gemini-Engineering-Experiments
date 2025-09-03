document.addEventListener('DOMContentLoaded', async () => {
    // --- 1. SETUP: AUDIO CONTEXT & WORKLET --- 
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    const oscillatorWorkletCode = `
        class OscillatorProcessor extends AudioWorkletProcessor {
            static get parameterDescriptors() {
                return [
                    { name: 'frequency', defaultValue: 440, minValue: 20, maxValue: 20000 },
                    { name: 'pulseWidth', defaultValue: 0.5, minValue: 0.01, maxValue: 0.99 }
                ];
            }

            constructor(options) {
                super(options);
                this._phase = 0;
                this._stereoPhase = 0;
                this.port.onmessage = (e) => {
                    if (e.data.waveform) this._waveform = e.data.waveform;
                    if (e.data.invert !== undefined) this._invert = e.data.invert;
                    if (e.data.phaseOffset !== undefined) this._phase = e.data.phaseOffset;
                    if (e.data.stereoPhase !== undefined) this._stereoPhase = e.data.stereoPhase;
                };
            }

            process(inputs, outputs, parameters) {
                const leftOutput = outputs[0][0];
                const rightOutput = outputs[0][1];
                const frequency = parameters.frequency;
                const pulseWidth = parameters.pulseWidth;
                const inv = this._invert ? -1 : 1;

                for (let i = 0; i < leftOutput.length; i++) {
                    const freq = frequency.length > 1 ? frequency[i] : frequency[0];
                    if (freq === 0) {
                        leftOutput[i] = 0;
                        rightOutput[i] = 0;
                        continue;
                    }
                    const pw = pulseWidth.length > 1 ? pulseWidth[i] : pulseWidth[0];
                    
                    const phaseIncrement = freq / sampleRate;
                    this._phase += phaseIncrement;
                    if (this._phase > 1.0) this._phase -= 1.0;

                    const calcValue = (phase) => {
                        switch (this._waveform) {
                            case 'sine': return Math.sin(phase * 2 * Math.PI);
                            case 'square': return phase < pw ? 1.0 : -1.0;
                            case 'sawtooth': return 2.0 * phase - 1.0;
                            case 'triangle': return 2.0 * (1.0 - 2.0 * Math.abs(phase - 0.5)) - 1.0;
                            case 'noise': return Math.random() * 2 - 1;
                        }
                        return 0;
                    };

                    leftOutput[i] = calcValue(this._phase) * inv;
                    let rightPhase = this._phase + this._stereoPhase;
                    if (rightPhase > 1.0) rightPhase -= 1.0;
                    rightOutput[i] = calcValue(rightPhase) * inv;
                }
                return true;
            }
        }
        registerProcessor('oscillator-processor', OscillatorProcessor);
    `;

    try {
        const blob = new Blob([oscillatorWorkletCode], { type: 'application/javascript' });
        const workletURL = URL.createObjectURL(blob);
        await audioContext.audioWorklet.addModule(workletURL);
    } catch (e) {
        console.error('Failed to load audio worklet.', e);
        alert('Fatal Error: Audio worklet could not be loaded.');
        return;
    }

    // --- 2. VOICE ARCHITECTURE (Best Practice) ---
    class Voice {
        constructor(audioContext) {
            this.audioContext = audioContext;
            this.output = audioContext.createGain();
            this.output.gain.value = 0;

            this.oscillators = [];
            for (let i = 0; i < 3; i++) {
                const osc = new AudioWorkletNode(this.audioContext, 'oscillator-processor', { outputChannelCount: [2] });
                const gain = audioContext.createGain();
                const panner = audioContext.createStereoPanner();
                osc.connect(gain).connect(panner).connect(this.output);
                this.oscillators.push({ osc, gain, panner });
            }
        }

        triggerAttack(noteNumber, params, fromNoteNumber) {
            const now = this.audioContext.currentTime;
            const { attack, decay, sustain } = params.envelope;
            
            this.output.gain.cancelScheduledValues(now);
            this.output.gain.setValueAtTime(this.output.gain.value > 0 ? this.output.gain.value : 0, now);
            this.output.gain.linearRampToValueAtTime(1.0, now + attack);
            this.output.gain.linearRampToValueAtTime(sustain, now + attack + decay);

            this.updateFrequency(noteNumber, params, fromNoteNumber);
            this.updateParams(params);
        }

        triggerRelease(params) {
            const now = this.audioContext.currentTime;
            const { release } = params.envelope;
            this.output.gain.cancelScheduledValues(now);
            this.output.gain.setValueAtTime(this.output.gain.value, now);
            this.output.gain.linearRampToValueAtTime(0, now + release);
        }

        updateFrequency(noteNumber, params, fromNoteNumber) {
            const now = this.audioContext.currentTime;
            const portamentoTime = params.portamento;

            this.oscillators.forEach(({ osc }, i) => {
                const oscParams = params.oscillators[i];
                const targetFreq = noteToFrequency(noteNumber, oscParams.coarsePitch, oscParams.finePitch);
                const startFreq = (fromNoteNumber && portamentoTime > 0) 
                    ? noteToFrequency(fromNoteNumber, oscParams.coarsePitch, oscParams.finePitch)
                    : targetFreq;
                
                osc.parameters.get('frequency').cancelScheduledValues(now);
                osc.parameters.get('frequency').setValueAtTime(startFreq, now);
                if (startFreq !== targetFreq) {
                    osc.parameters.get('frequency').linearRampToValueAtTime(targetFreq, now + portamentoTime);
                }
            });
        }

        updateParams(params) {
            this.oscillators.forEach(({ osc, gain, panner }, i) => {
                const oscParams = params.oscillators[i];
                const now = this.audioContext.currentTime;
                gain.gain.setValueAtTime(oscParams.volume, now);
                panner.pan.setValueAtTime(oscParams.pan, now);
                osc.parameters.get('pulseWidth').setValueAtTime(oscParams.pulseWidth, now);
                osc.port.postMessage({ 
                    waveform: oscParams.waveform, 
                    invert: oscParams.invert,
                    phaseOffset: oscParams.phase / 360.0,
                    stereoPhase: oscParams.stereo / 100.0
                });
            });
        }
    }

    // --- 3. POLYPHONIC SYNTH CONTROLLER ---
    class PolySynth {
        constructor(audioContext, numVoices = 10) {
            this.audioContext = audioContext;
            this.params = getDefaultParams();

            this.masterFilter = audioContext.createBiquadFilter();
            this.analyser = audioContext.createAnalyser();
            this.masterVolumeNode = audioContext.createGain();
            this.masterFilter.connect(this.analyser).connect(this.masterVolumeNode).connect(this.audioContext.destination);

            this.voices = Array.from({ length: numVoices }, () => new Voice(audioContext));
            this.voices.forEach(voice => voice.output.connect(this.masterFilter));
            
            this.polyActiveNotes = new Map();
            this.monoActiveNote = null;
            this.lastNoteNumber = null;
            this.nextVoiceIndex = 0;
            this.setParams(this.params); // Apply initial default params
        }

        noteOn(noteNumber) {
            if (this.audioContext.state === 'suspended') this.audioContext.resume();
            if (this.params.voicing.mode === 'poly') this.noteOnPoly(noteNumber); else this.noteOnMono(noteNumber);
        }

        noteOff(noteNumber) {
            if (this.params.voicing.mode === 'poly') this.noteOffPoly(noteNumber); else this.noteOffMono(noteNumber);
        }

        noteOnPoly(noteNumber) {
            if (this.polyActiveNotes.has(noteNumber)) return;
            const voice = this.voices[this.nextVoiceIndex];
            voice.triggerAttack(noteNumber, this.params, this.lastNoteNumber);
            this.polyActiveNotes.set(noteNumber, voice);
            this.lastNoteNumber = noteNumber;
            this.nextVoiceIndex = (this.nextVoiceIndex + 1) % this.voices.length;
            document.querySelector(`[data-note-number="${noteNumber}"]`)?.classList.add('active');
        }

        noteOffPoly(noteNumber) {
            if (!this.polyActiveNotes.has(noteNumber)) return;
            const voice = this.polyActiveNotes.get(noteNumber);
            voice.triggerRelease(this.params);
            this.polyActiveNotes.delete(noteNumber);
            document.querySelector(`[data-note-number="${noteNumber}"]`)?.classList.remove('active');
        }

        noteOnMono(noteNumber) {
            const monoVoice = this.voices[0];
            if (this.monoActiveNote) { 
                monoVoice.updateFrequency(noteNumber, this.params, this.lastNoteNumber);
            } else { 
                monoVoice.triggerAttack(noteNumber, this.params, this.lastNoteNumber);
            }
            this.lastNoteNumber = noteNumber;
            this.monoActiveNote = noteNumber;
            document.querySelectorAll('.key.active').forEach(k => k.classList.remove('active'));
            document.querySelector(`[data-note-number="${noteNumber}"]`)?.classList.add('active');
        }

        noteOffMono(noteNumber) {
            if (this.monoActiveNote === noteNumber) {
                this.voices[0].triggerRelease(this.params);
                this.monoActiveNote = null;
                document.querySelector(`[data-note-number="${noteNumber}"]`)?.classList.remove('active');
            }
        }

        setParams(newParams) {
            const oldMode = this.params.voicing.mode;
            this.params = newParams;
            if (oldMode === 'poly' && this.params.voicing.mode === 'mono') {
                this.polyActiveNotes.forEach(voice => voice.triggerRelease(this.params));
                this.polyActiveNotes.clear();
            } else if (oldMode === 'mono' && this.params.voicing.mode === 'poly') {
                if (this.monoActiveNote) this.voices[0].triggerRelease(this.params);
                this.monoActiveNote = null;
            }
            this.masterVolumeNode.gain.setValueAtTime(this.params.masterVolume, this.audioContext.currentTime);
            this.masterFilter.frequency.setValueAtTime(this.params.filter.cutoff, this.audioContext.currentTime);
            this.masterFilter.Q.setValueAtTime(this.params.filter.resonance, this.audioContext.currentTime);
            this.voices.forEach(voice => voice.updateParams(this.params));
        }
    }

    // --- 4. UTILS & INITIALIZATION ---
    function noteToFrequency(note, coarse, fine) {
        return 440 * Math.pow(2, (note - 69 + coarse) / 12) * Math.pow(2, fine / 1200);
    }

    const presets = {
        'default': getDefaultParams(),
        'powerLead': {
            masterVolume: 0.8,
            filter: { cutoff: 6000, resonance: 4 },
            envelope: { attack: 0.05, decay: 0.2, sustain: 0.9, release: 0.6 },
            portamento: 0.08,
            voicing: { mode: 'mono' },
            oscillators: [
                { waveform: 'sawtooth', volume: 0.8, pan: -0.1, coarsePitch: 0, finePitch: -4, pulseWidth: 0.5, phase: 0, invert: false, stereo: 0.08 },
                { waveform: 'square', volume: 0.8, pan: 0.1, coarsePitch: 0, finePitch: 4, pulseWidth: 0.25, phase: 0, invert: false, stereo: -0.08 },
                { waveform: 'noise', volume: 0.05, pan: 0, coarsePitch: 0, finePitch: 0, pulseWidth: 0.5, phase: 0, invert: false, stereo: 0 },
            ]
        },
        'dreamPad': {
            masterVolume: 0.7,
            filter: { cutoff: 3500, resonance: 2 },
            envelope: { attack: 1.5, decay: 1.0, sustain: 0.8, release: 2.0 },
            portamento: 0.0,
            voicing: { mode: 'poly' },
            oscillators: [
                { waveform: 'triangle', volume: 0.6, pan: -0.4, coarsePitch: 0, finePitch: -3, pulseWidth: 0.5, phase: 0, invert: false, stereo: 0.2 },
                { waveform: 'sawtooth', volume: 0.4, pan: 0.4, coarsePitch: 0, finePitch: 3, pulseWidth: 0.5, phase: 90, invert: false, stereo: -0.2 },
                { waveform: 'sine', volume: 0.2, pan: 0, coarsePitch: 12, finePitch: 0, pulseWidth: 0.5, phase: 180, invert: false, stereo: 0 },
            ]
        },
        'wobbleBass': {
            masterVolume: 0.9,
            filter: { cutoff: 800, resonance: 15 },
            envelope: { attack: 0.02, decay: 0.3, sustain: 0.2, release: 0.3 },
            portamento: 0.05,
            voicing: { mode: 'mono' },
            oscillators: [
                { waveform: 'sawtooth', volume: 1, pan: 0, coarsePitch: -12, finePitch: 0, pulseWidth: 0.5, phase: 0, invert: false, stereo: 0.05 },
                { waveform: 'square', volume: 1, pan: 0, coarsePitch: -12, finePitch: 5, pulseWidth: 0.5, phase: 0, invert: false, stereo: -0.05 },
                { waveform: 'sine', volume: 0.4, pan: 0, coarsePitch: -24, finePitch: 0, pulseWidth: 0.5, phase: 0, invert: false, stereo: 0 },
            ]
        },
        'analogBrass': {
            masterVolume: 0.8,
            filter: { cutoff: 4000, resonance: 2.5 },
            envelope: { attack: 0.1, decay: 0.4, sustain: 0.7, release: 0.3 },
            portamento: 0.02,
            voicing: { mode: 'poly' },
            oscillators: [
                { waveform: 'sawtooth', volume: 1, pan: -0.2, coarsePitch: 0, finePitch: -5, pulseWidth: 0.5, phase: 0, invert: false, stereo: 0.1 },
                { waveform: 'sawtooth', volume: 1, pan: 0.2, coarsePitch: 0, finePitch: 5, pulseWidth: 0.5, phase: 0, invert: false, stereo: -0.1 },
                { waveform: 'square', volume: 0.3, pan: 0, coarsePitch: 12, finePitch: 0, pulseWidth: 0.5, phase: 0, invert: false, stereo: 0 },
            ]
        },
        'epiano': {
            masterVolume: 0.9,
            filter: { cutoff: 12000, resonance: 0.2 },
            envelope: { attack: 0.01, decay: 0.8, sustain: 0.1, release: 0.4 },
            portamento: 0.0,
            voicing: { mode: 'poly' },
            oscillators: [
                { waveform: 'sine', volume: 1, pan: -0.1, coarsePitch: 0, finePitch: 0, pulseWidth: 0.5, phase: 0, invert: false, stereo: 0.02 },
                { waveform: 'triangle', volume: 0.6, pan: 0.1, coarsePitch: 12, finePitch: 3, pulseWidth: 0.5, phase: 0, invert: false, stereo: -0.02 },
                { waveform: 'sine', volume: 0.4, pan: 0, coarsePitch: 24, finePitch: -3, pulseWidth: 0.5, phase: 0, invert: false, stereo: 0 },
            ]
        },
        'laserSfx': {
            masterVolume: 0.7,
            filter: { cutoff: 15000, resonance: 0 },
            envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.2 },
            portamento: 0.0,
            voicing: { mode: 'mono' },
            oscillators: [
                { waveform: 'sawtooth', volume: 1, pan: 0, coarsePitch: 0, finePitch: 0, pulseWidth: 0.5, phase: 0, invert: false, stereo: 0 },
                { waveform: 'sawtooth', volume: 0, pan: 0, coarsePitch: 0, finePitch: 0, pulseWidth: 0.5, phase: 0, invert: false, stereo: 0 },
                { waveform: 'sawtooth', volume: 0, pan: 0, coarsePitch: 0, finePitch: 0, pulseWidth: 0.5, phase: 0, invert: false, stereo: 0 },
            ]
        }
    };

    function getDefaultParams() {
        return JSON.parse(JSON.stringify({
            masterVolume: 0.9,
            filter: { cutoff: 20000, resonance: 0 },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.5 },
            portamento: 0.0,
            voicing: { mode: 'poly' },
            oscillators: [
                { waveform: 'sawtooth', volume: 0.5, pan: 0, coarsePitch: 0, finePitch: 0, pulseWidth: 0.5, phase: 0, invert: false, stereo: 0 },
                { waveform: 'sawtooth', volume: 0.5, pan: 0, coarsePitch: 0, finePitch: 0, pulseWidth: 0.5, phase: 0, invert: false, stereo: 0 },
                { waveform: 'sawtooth', volume: 0.5, pan: 0, coarsePitch: 0, finePitch: 0, pulseWidth: 0.5, phase: 0, invert: false, stereo: 0 },
            ]
        }));
    }

    function initUI(synth) {
        function loadPreset(name) {
            const preset = presets[name];
            if (!preset) return;
            // Create a deep copy to avoid modifying the original preset object
            const paramsCopy = JSON.parse(JSON.stringify(preset));
            // Fill in any missing top-level keys from the default params
            const defaultParams = getDefaultParams();
            for (const key in defaultParams) {
                if (!paramsCopy.hasOwnProperty(key)) {
                    paramsCopy[key] = defaultParams[key];
                }
            }
            synth.setParams(paramsCopy);

            // Update all UI controls to reflect the new state
            const params = synth.params;
            document.querySelectorAll('input[type="range"], input[type="checkbox"], .waveform-select, #voicing-mode, #preset-select').forEach(input => {
                const id = input.id;
                if (id === 'voicing-mode') {
                    input.value = params.voicing.mode;
                } else if (id === 'preset-select') {
                    input.value = name;
                } else if (params.masterVolume !== undefined && id === 'masterVolume') {
                    input.value = params.masterVolume;
                } else if (params.filter[id] !== undefined) {
                    input.value = params.filter[id];
                } else if (params.envelope[id] !== undefined) {
                    input.value = params.envelope[id];
                } else if (params[id] !== undefined) {
                    input.value = params[id];
                } else {
                    const oscWrapper = input.closest('.oscillator');
                    if (oscWrapper) {
                        const oscIndex = parseInt(oscWrapper.id.split('-')[1]) - 1;
                        const param = input.dataset.param;
                        if (params.oscillators[oscIndex] && params.oscillators[oscIndex][param] !== undefined) {
                            if (input.type === 'checkbox') {
                                input.checked = params.oscillators[oscIndex][param];
                            } else {
                                input.value = params.oscillators[oscIndex][param];
                            }
                        }
                    }
                }
                if(input.type === 'range') updateSliderValue(input);
            });
        }

        function populatePresets() {
            const presetSelect = document.getElementById('preset-select');
            presetSelect.innerHTML = ''; // Clear previous options
            for (const name in presets) {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name.charAt(0).toUpperCase() + name.slice(1);
                presetSelect.appendChild(option);
            }
            presetSelect.addEventListener('change', () => loadPreset(presetSelect.value));
        }

        document.querySelectorAll('input[type="range"], input[type="checkbox"], .waveform-select, #voicing-mode').forEach(input => {
            const eventType = input.tagName === 'SELECT' || input.type === 'checkbox' ? 'change' : 'input';
            input.addEventListener(eventType, () => {
                const params = synth.params;
                const oscWrapper = input.closest('.oscillator');
                if (oscWrapper) {
                    const oscIndex = parseInt(oscWrapper.id.split('-')[1]) - 1;
                    const param = input.dataset.param;
                    const value = input.type === 'checkbox' ? input.checked : (input.tagName === 'SELECT' ? input.value : parseFloat(input.value));
                    params.oscillators[oscIndex][param] = value;
                } else if (input.id === 'voicing-mode') {
                    params.voicing.mode = input.value;
                } else if (input.id === 'masterVolume') {
                    params.masterVolume = parseFloat(input.value);
                } else if (params.filter[input.id] !== undefined) {
                    params.filter[input.id] = parseFloat(input.value);
                } else if (params.envelope[id] !== undefined) {
                    params.envelope[id] = parseFloat(input.value);
                } else if (params[id] !== undefined) {
                    params[id] = parseFloat(input.value);
                }
                synth.setParams(params);
                if(input.type === 'range') updateSliderValue(input);
            });
        });

        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const keyboardContainer = document.querySelector('.keyboard-container');
        for (let octave = 3; octave < 6; octave++) {
            notes.forEach((note, i) => {
                const key = document.createElement('div');
                const noteNumber = 12 * (octave + 1) + i;
                key.classList.add('key', note.includes('#') ? 'black' : 'white');
                key.dataset.noteNumber = noteNumber;
                keyboardContainer.appendChild(key);
                key.addEventListener('mousedown', () => synth.noteOn(noteNumber));
                key.addEventListener('mouseup', () => synth.noteOff(noteNumber));
                key.addEventListener('mouseleave', () => synth.noteOff(noteNumber));
            });
        }
        
        const KEY_MAP = {
            'a': 60, 'w': 61, 's': 62, 'e': 63, 'd': 64, 'f': 65, 't': 66,
            'g': 67, 'y': 68, 'h': 69, 'u': 70, 'j': 71, 'k': 72
        };
        document.addEventListener('keydown', e => !e.repeat && KEY_MAP[e.key] && synth.noteOn(KEY_MAP[e.key]));
        document.addEventListener('keyup', e => KEY_MAP[e.key] && synth.noteOff(KEY_MAP[e.key]));
        
        populatePresets();
        loadPreset('default');
    }

    function updateSliderValue(input) {
        const valueDisplay = input.parentElement.querySelector('.slider-value');
        if (valueDisplay) {
            const value = parseFloat(input.value);
            valueDisplay.textContent = Number.isInteger(parseFloat(input.step)) ? value.toFixed(0) : value.toFixed(2);
        }
    }

    const synth = new PolySynth(audioContext);
    initUI(synth);
});