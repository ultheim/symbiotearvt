// ============================================
// AUDIO MODULE (audio.js)
// ============================================

window.isSpeaking = false;
let audioCtx;
let noiseBuffer;
let noiseNode = null;
let filterF1 = null; 
let filterF2 = null; 
let masterGain = null;
let lastOut = 0;

window.initAudio = function() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    if (!noiseBuffer) {
        const bufferSize = audioCtx.sampleRate * 2; 
        noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            data[i] = (lastOut + (0.02 * white)) / 1.02; 
            lastOut = data[i];
            data[i] *= 3.5; 
        }
    }
}

window.startBreathStream = function() {
    if (window.isSpeaking) return;
    window.isSpeaking = true;
    const t = audioCtx.currentTime;

    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    noiseNode.loop = true;

    filterF1 = audioCtx.createBiquadFilter();
    filterF1.type = 'bandpass';
    // Access Global glitchMode
    filterF1.Q.value = window.glitchMode ? 20 : 5; 

    filterF2 = audioCtx.createBiquadFilter();
    filterF2.type = 'bandpass';
    filterF2.Q.value = window.glitchMode ? 30 : 8;

    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0, t);
    masterGain.gain.linearRampToValueAtTime(0.5, t + 0.2);

    noiseNode.connect(filterF1);
    filterF1.connect(masterGain);
    
    noiseNode.connect(filterF2);
    filterF2.connect(masterGain);
    
    masterGain.connect(audioCtx.destination);
    noiseNode.start(t);
}

window.stopBreathStream = function() {
    if (!window.isSpeaking || !masterGain) return;
    const t = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.linearRampToValueAtTime(0, t + 0.5); 
    setTimeout(() => { 
        if(noiseNode) { try{noiseNode.stop();}catch(e){} } 
        window.isSpeaking = false; 
    }, 600);
}

window.morphMouthShape = function(char) {
    if (!filterF1 || !filterF2 || !masterGain) return;
    const t = audioCtx.currentTime;
    const c = char.toUpperCase();
    
    // Access Global Mood
    const moodData = window.MOOD_AUDIO[window.glitchMode ? "GLITCH" : window.currentMood] || window.MOOD_AUDIO["NEUTRAL"];
    const fMult = moodData.fShift;
    const speedMult = moodData.speed;

    let f1 = 500, f2 = 1500, vol = 0.5;

    if ("A".includes(c)) { f1=800; f2=1200; vol=0.6; }      
    else if ("E".includes(c)) { f1=500; f2=2300; vol=0.6; } 
    else if ("I".includes(c)) { f1=300; f2=2500; vol=0.5; } 
    else if ("O".includes(c)) { f1=500; f2=1000; vol=0.6; } 
    else if ("U".includes(c)) { f1=300; f2=800; vol=0.5; }  
    
    else if ("SZFTH".includes(c)) { f1=1500; f2=4000; vol=0.3; } 
    else if ("MKNL".includes(c)) { f1=200; f2=600; vol=0.7; }    
    else if ("PBDG".includes(c)) { 
        vol = 0; 
        setTimeout(() => { if(masterGain) masterGain.gain.linearRampToValueAtTime(0.7, audioCtx.currentTime + 0.05*speedMult); }, 50*speedMult);
    }
    else { f1=400; f2=1400; vol=0.5; } 

    f1 *= fMult;
    f2 *= fMult;

    f1 += (Math.random()-0.5) * 50;
    f2 += (Math.random()-0.5) * 100;

    if(window.glitchMode) {
        f1 += (Math.random()-0.5) * 1000; 
        vol = Math.random() > 0.5 ? 0.8 : 0; 
    }

    const rampTime = 0.1 * speedMult;
    filterF1.frequency.exponentialRampToValueAtTime(Math.max(50, f1), t + rampTime);
    filterF2.frequency.exponentialRampToValueAtTime(Math.max(50, f2), t + rampTime);
    
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.linearRampToValueAtTime(vol, t + (0.05 * speedMult));
    masterGain.gain.linearRampToValueAtTime(vol * 0.8, t + (0.15 * speedMult));
}