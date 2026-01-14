// ============================================
// VISUALS MODULE (visuals.js) - TRUE AERODYNAMIC MURMURATION
// ============================================

let foodParticles = [];
window.feedingActive = false;
let eatenFoodCount = 0;
let totalFoodCount = 0;
let bloatFactor = 1.0; 
let pulseTime = 0;      
let digestionGlow = 0; 

// Global Access to Palette
window.curPalette = { pri: {r:255, g:115, b:0}, sec: {r:200, g:100, b:50}, conn: {r:255, g:160, b:0} };

let indicesList=["SYSTEM", "LOCKED", "SECURE", "AUTH", "REQUIRED", "WAIT", "KEY", "VOID"];
window.updateKeywords = (newList) => {
    if(newList && newList.length > 0) indicesList = newList;
};

// --- FLUID DYNAMICS SETTINGS ---
// These control the "Tightness" of the flock
const PHYSICS = {
    MAX_FORCE: 0.03,    // Steering limit (Lower = wider turns, Higher = twitchy)
    MAX_SPEED: 6.0,     // Cruising speed
    VISION_RAD: 120,    // How far they see
    SEPARATION: 30,     // Personal bubble
    ALIGN_WEIGHT: 1.5,  // The "Starling Factor" - High alignment makes them act as one
    COHESION_WEIGHT: 0.8,
    SEPARATION_WEIGHT: 2.0
};

// --- BOID LOGIC ---
const FLOCK_SIZE = 450; 
const MAX_FLOCK = 700;

class Boid {
    constructor(x, y, z, isNewborn = false) {
        // Spawn scattered
        const angle = Math.random() * Math.PI * 2;
        const rad = Math.random() * 300;
        this.pos = { 
            x: x || Math.cos(angle) * rad, 
            y: y || Math.sin(angle) * rad, 
            z: z || (Math.random()-0.5) * 150 
        };
        // Initial velocity is random but normalized
        const vx = (Math.random()-0.5);
        const vy = (Math.random()-0.5);
        const mag = Math.sqrt(vx*vx + vy*vy);
        this.vel = { 
            x: (vx/mag) * PHYSICS.MAX_SPEED, 
            y: (vy/mag) * PHYSICS.MAX_SPEED, 
            z: (Math.random()-0.5) * 2 
        };
        this.acc = { x: 0, y: 0, z: 0 };
        this.type = isNewborn ? 'sec' : (Math.random() > 0.6 ? 'pri' : 'sec');
        this.bornTime = isNewborn ? 1.0 : 0.0;
        this.fear = 0; // Smooth fear transition
    }

    // Reynolds' Steering Formula: Steer = Desired - Velocity
    steer(target, slowDown = false) {
        let steer = {x:0, y:0, z:0};
        let desired = {
            x: target.x - this.pos.x,
            y: target.y - this.pos.y,
            z: target.z - this.pos.z
        };
        
        let d = Math.sqrt(desired.x**2 + desired.y**2 + desired.z**2);
        if (d > 0) {
            // Normalize desired
            desired.x /= d; desired.y /= d; desired.z /= d;
            
            // Arrive behavior (slow down when close)
            if (slowDown && d < 100) {
                let m = (d/100) * PHYSICS.MAX_SPEED;
                desired.x *= m; desired.y *= m; desired.z *= m;
            } else {
                desired.x *= PHYSICS.MAX_SPEED; desired.y *= PHYSICS.MAX_SPEED; desired.z *= PHYSICS.MAX_SPEED;
            }

            // Steer vector
            steer.x = desired.x - this.vel.x;
            steer.y = desired.y - this.vel.y;
            steer.z = desired.z - this.vel.z;
            
            // Limit force
            this.limitForce(steer);
        }
        return steer;
    }

    limitForce(vector) {
        let magSq = vector.x**2 + vector.y**2 + vector.z**2;
        if (magSq > PHYSICS.MAX_FORCE**2) {
            let mag = Math.sqrt(magSq);
            vector.x = (vector.x/mag) * PHYSICS.MAX_FORCE;
            vector.y = (vector.y/mag) * PHYSICS.MAX_FORCE;
            vector.z = (vector.z/mag) * PHYSICS.MAX_FORCE;
        }
    }

    applyForce(force) {
        this.acc.x += force.x;
        this.acc.y += force.y;
        this.acc.z += force.z;
    }

    update(boids, mouse, width, height) {
        let sep = {x:0, y:0, z:0};
        let ali = {x:0, y:0, z:0};
        let coh = {x:0, y:0, z:0};
        let count = 0;

        // Optimization: Stride
        const stride = boids.length > 350 ? 2 : 1;

        for(let i=0; i<boids.length; i+=stride) {
            let other = boids[i];
            if(other === this) continue;

            let dx = this.pos.x - other.pos.x;
            let dy = this.pos.y - other.pos.y;
            let dz = this.pos.z - other.pos.z;
            let dSq = dx*dx + dy*dy + dz*dz;

            if(dSq < PHYSICS.VISION_RAD**2) {
                // Alignment: "Steer towards neighbor's velocity"
                ali.x += other.vel.x; ali.y += other.vel.y; ali.z += other.vel.z;
                
                // Cohesion: "Steer towards neighbor's position"
                coh.x += other.pos.x; coh.y += other.pos.y; coh.z += other.pos.z;

                // Separation: "Steer away from neighbor"
                if(dSq < PHYSICS.SEPARATION**2) {
                    let d = Math.sqrt(dSq);
                    // Weight by distance (closer = push harder)
                    let diff = { x: dx/d, y: dy/d, z: dz/d };
                    sep.x += diff.x; sep.y += diff.y; sep.z += diff.z;
                }
                count++;
            }
        }

        if(count > 0) {
            // Average Alignment
            ali.x /= count; ali.y /= count; ali.z /= count;
            // Normalize and scale to max speed
            let aliMag = Math.sqrt(ali.x**2 + ali.y**2 + ali.z**2) || 1;
            ali.x = (ali.x/aliMag) * PHYSICS.MAX_SPEED;
            ali.y = (ali.y/aliMag) * PHYSICS.MAX_SPEED;
            ali.z = (ali.z/aliMag) * PHYSICS.MAX_SPEED;
            // Alignment steer
            let steerAli = { x: ali.x - this.vel.x, y: ali.y - this.vel.y, z: ali.z - this.vel.z };
            this.limitForce(steerAli);

            // Average Cohesion
            coh.x /= count; coh.y /= count; coh.z /= count;
            // Calculate cohesion steer (towards center)
            let steerCoh = this.steer(coh, false);

            // Separation Steer
            let sepMag = Math.sqrt(sep.x**2 + sep.y**2 + sep.z**2) || 1;
            sep.x = (sep.x/sepMag) * PHYSICS.MAX_SPEED; 
            sep.y = (sep.y/sepMag) * PHYSICS.MAX_SPEED;
            sep.z = (sep.z/sepMag) * PHYSICS.MAX_SPEED;
            let steerSep = { x: sep.x - this.vel.x, y: sep.y - this.vel.y, z: sep.z - this.vel.z };
            this.limitForce(steerSep);

            // --- APPLY FORCES ---
            // Starlings rely heavily on Alignment (flying parallel)
            this.applyForce({
                x: steerAli.x * PHYSICS.ALIGN_WEIGHT,
                y: steerAli.y * PHYSICS.ALIGN_WEIGHT,
                z: steerAli.z * PHYSICS.ALIGN_WEIGHT
            });
            this.applyForce({
                x: steerSep.x * PHYSICS.SEPARATION_WEIGHT,
                y: steerSep.y * PHYSICS.SEPARATION_WEIGHT,
                z: steerSep.z * PHYSICS.SEPARATION_WEIGHT
            });
            this.applyForce({
                x: steerCoh.x * PHYSICS.COHESION_WEIGHT,
                y: steerCoh.y * PHYSICS.COHESION_WEIGHT,
                z: steerCoh.z * PHYSICS.COHESION_WEIGHT
            });
        }

        // --- MOUSE INTERACTION (PREDATOR PREDICTION) ---
        if(mouse.active) {
            // Predict where the "predator" is going to be
            let predFutureX = mouse.x + (mouse.vx * 3);
            let predFutureY = mouse.y + (mouse.vy * 3);

            let dx = this.pos.x - predFutureX;
            let dy = this.pos.y - predFutureY;
            let dSq = dx*dx + dy*dy;
            
            // Vision radius based on predator speed
            let fearRad = 200 + Math.min(Math.abs(mouse.vx)*5, 100);

            if(dSq < fearRad**2) {
                // Flee Vector
                let force = (fearRad*fearRad) / (dSq || 1); // Inverse square strength
                force = Math.min(force, 5.0); // Cap it

                let fleeX = dx; let fleeY = dy;
                let mag = Math.sqrt(fleeX**2 + fleeY**2);
                fleeX /= mag; fleeY /= mag;

                this.applyForce({x: fleeX*force*0.8, y: fleeY*force*0.8, z: 0});
                this.fear = 1.0;
            }
        }

        // --- BOUNDARIES (SOFT BANKING) ---
        // Instead of bouncing, steer back to center if too far
        const distFromCenter = Math.sqrt(this.pos.x**2 + this.pos.y**2);
        const safeZone = width * 0.45;
        
        if (distFromCenter > safeZone) {
            let desired = { x: -this.pos.x, y: -this.pos.y, z: -this.pos.z };
            let mag = Math.sqrt(desired.x**2 + desired.y**2 + desired.z**2);
            desired.x = (desired.x/mag) * PHYSICS.MAX_SPEED;
            desired.y = (desired.y/mag) * PHYSICS.MAX_SPEED;
            desired.z = (desired.z/mag) * PHYSICS.MAX_SPEED;

            let steer = {
                x: (desired.x - this.vel.x) * 0.05, // Gentle turn
                y: (desired.y - this.vel.y) * 0.05,
                z: (desired.z - this.vel.z) * 0.05
            };
            this.applyForce(steer);
        }

        // Z-floor/ceiling
        if(this.pos.z < -200) this.applyForce({x:0, y:0, z:0.1});
        if(this.pos.z > 200) this.applyForce({x:0, y:0, z:-0.1});

        // --- UPDATE PHYSICS ---
        this.vel.x += this.acc.x;
        this.vel.y += this.acc.y;
        this.vel.z += this.acc.z;

        // Limit Speed
        let speed = Math.sqrt(this.vel.x**2 + this.vel.y**2 + this.vel.z**2);
        if(speed > PHYSICS.MAX_SPEED) {
            let ratio = PHYSICS.MAX_SPEED / speed;
            this.vel.x *= ratio; this.vel.y *= ratio; this.vel.z *= ratio;
        }

        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;
        this.pos.z += this.vel.z;

        // Reset Acc
        this.acc = {x:0, y:0, z:0};
        if(this.bornTime > 0) this.bornTime -= 0.02;
        if(this.fear > 0) this.fear -= 0.05;
    }
}

// --- TEXT SPAWNING ---
window.spawnFoodText = (text) => {
    foodParticles = [];
    eatenFoodCount = 0;
    const chars = text.split('');
    totalFoodCount = chars.length;
    window.feedingActive = true;
    
    if(text.length > 5) bloatFactor = 1.0 + (Math.min(text.length, 50) * 0.005);

    const canvas = document.getElementById('symbiosisCanvas');
    const width = canvas.width;
    const height = canvas.height;
    
    const startY = height * 0.5 + 100; 
    const spread = Math.min(width * 0.8, chars.length * 50); 
    const startX = -spread / 2; 

    chars.forEach((char, i) => {
        foodParticles.push({
            char: char,
            x: startX + (i * (spread / chars.length)) + (Math.random()-0.5)*40, 
            y: startY + (Math.random() * 100),
            vx: (Math.random() - 0.5) * 1.5,  
            vy: -2 - Math.random() * 2, 
            offset: Math.random() * 100,
            active: true
        });
    });
};

// --- AUDIO BRIDGE ---
window.activeWordMode = false;
let globalAtmosphereMod = { speed: 1.0, sep: 0, align: 0 };

window.speak = function(text) {
    window.feedingActive = false; eatenFoodCount = 0; totalFoodCount = 0;
    window.initAudio(); window.startBreathStream();
    
    const subtitleMask = document.getElementById('subtitle-mask');
    const subtitleTrack = document.getElementById('subtitle-track');
    subtitleTrack.innerHTML = ''; subtitleMask.style.opacity = '1';
    subtitleTrack.style.transform = 'translateX(0px)';
    
    const words = text.split(" ");
    const spans = [];
    words.forEach(word => {
        const s = document.createElement('span'); s.textContent = word; s.className = 'char-span'; 
        subtitleTrack.appendChild(s); spans.push(s);
    });
    
    let wordIndex = 0;
    const moodData = window.MOOD_AUDIO[window.glitchMode ? "GLITCH" : window.currentMood] || window.MOOD_AUDIO["NEUTRAL"];
    const speedMod = moodData.speed;

    function playNextWord() {
        if(wordIndex >= words.length) {
            window.activeWordMode = false;
            // Reset atmosphere smoothly
            globalAtmosphereMod = { speed: 1.0, sep: 0, align: 0 };
            window.stopBreathStream(); 
            setTimeout(() => { subtitleMask.style.opacity='0'; setTimeout(()=>subtitleTrack.innerHTML='', 1000); }, 100); 
            return;
        }
        
        if(wordIndex > 0) spans[wordIndex-1].classList.remove('active');
        spans[wordIndex].classList.add('active');
        const spanCenter = spans[wordIndex].offsetLeft + (spans[wordIndex].offsetWidth / 2);
        subtitleTrack.style.transform = `translateX(${-spanCenter}px)`;
        
        // --- REALISTIC BIRD SIGNALING ---
        // When a signal (word) is sent, the flock tightens or speeds up.
        // We don't use arbitrary shapes. We change the fluid parameters.
        const currentWord = words[wordIndex].toUpperCase();
        window.activeWordMode = true;

        let sharpCount = (currentWord.match(/[KTPXZGQ]/g) || []).length;
        
        if(sharpCount > 1 || currentWord.length < 4) {
            // Sharp sounds = Startle response (Fast, tight)
            globalAtmosphereMod = { speed: 1.8, sep: -10, align: 0.5 };
            window.morphMouthShape('I'); 
        } else {
            // Soft sounds = Soaring (Wide, slow)
            globalAtmosphereMod = { speed: 0.7, sep: 15, align: 0.2 };
            window.morphMouthShape('O'); 
        }

        window.currentIntensity = 1.2 + (sharpCount * 0.1); 
        setTimeout(() => { window.currentIntensity = 1.0; }, 150);

        wordIndex++;
        let duration = Math.max(300, currentWord.length * 80) * speedMod;
        setTimeout(playNextWord, duration);
    }
    
    playNextWord();
};

// --- MAIN ANIMATION ---
window.initSymbiosisAnimation = function() {
    const canvas = document.getElementById('symbiosisCanvas');
    const container = document.getElementById('symbiosis-container');
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    let width, height;

    // FLOCK INIT
    const boids = [];
    for(let i=0; i<FLOCK_SIZE; i++) boids.push(new Boid());

    function resize() {
        const rect = container.getBoundingClientRect();
        width = rect.width; height = rect.height;
        canvas.width = width; canvas.height = height;
    }
    window.addEventListener('resize', resize); resize();

    function lerpRGB(curr, target, factor) {
        curr.r += (target.r - curr.r) * factor;
        curr.g += (target.g - curr.g) * factor;
        curr.b += (target.b - curr.b) * factor;
    }

    let rotationX=0, rotationY=0;
    let time = 0;
    
    // Smooth Mouse Object
    let mouse = { x: -1000, y: -1000, vx: 0, vy: 0, active: false };
    let rawMouse = { x: -1000, y: -1000, active: false };

    function handleInput(cx, cy) {
        const r = container.getBoundingClientRect();
        rawMouse.x = (cx - r.left) - (width/2);
        rawMouse.y = (cy - r.top) - (height*0.35);
        rawMouse.active = true;
    }

    container.addEventListener('mousemove', e => handleInput(e.clientX, e.clientY));
    container.addEventListener('touchmove', e => {
        e.preventDefault(); 
        handleInput(e.touches[0].clientX, e.touches[0].clientY);
    }, {passive: false});
    
    container.addEventListener('touchend', () => { 
        rawMouse.active = false; 
        rawMouse.x = -1000;
    });

    // PROJECTION 
    function project(b, cx, cy) {
        const fov = 600; 
        let x = b.pos.x, y = b.pos.y, z = b.pos.z;
        if(window.glitchMode) { x+=(Math.random()-0.5)*15; y+=(Math.random()-0.5)*15; }
        
        const x1=x*Math.cos(rotationY)-z*Math.sin(rotationY);
        const z1=z*Math.cos(rotationY)+x*Math.sin(rotationY);
        const y2=y*Math.cos(rotationX)-z1*Math.sin(rotationX);
        const z2=z1*Math.cos(rotationX)+y*Math.sin(rotationX);
        
        const scale = fov / (fov + z2 + 500);
        return { x: cx + x1*scale, y: cy + y2*scale, z: z2, scale: scale, boid: b };
    }

    function animate() {
        // A. TRAILS - Fast fade (No Sperm Tails)
        // High opacity clear means trails disappear instantly, leaving only motion blur
        if(window.glitchMode && Math.random() > 0.8) {
            ctx.fillStyle = `rgba(50, 0, 0, 0.4)`; 
        } else {
            ctx.fillStyle = 'rgba(5, 5, 8, 0.4)'; 
        }
        ctx.fillRect(0,0,width,height);

        ctx.globalCompositeOperation = 'lighter';

        // B. INPUT SMOOTHING
        if(rawMouse.active) {
            let dx = rawMouse.x - mouse.x;
            let dy = rawMouse.y - mouse.y;
            // Ease the mouse position so birds react to "flow" not "jitter"
            mouse.x += dx * 0.15; 
            mouse.y += dy * 0.15;
            mouse.vx = dx * 0.15;
            mouse.vy = dy * 0.15;
            mouse.active = true;
        } else {
            mouse.active = false;
            mouse.vx *= 0.9; mouse.vy *= 0.9;
        }

        // C. APPLY SPEECH MODIFIERS
        // Smoothly interpolate physics based on speech
        if(window.activeWordMode) {
            PHYSICS.MAX_SPEED = 6.0 * globalAtmosphereMod.speed;
            PHYSICS.SEPARATION = 30 + globalAtmosphereMod.sep;
            PHYSICS.ALIGN_WEIGHT = 1.5 + globalAtmosphereMod.align;
        } else {
            // Return to baseline
            PHYSICS.MAX_SPEED += (6.0 - PHYSICS.MAX_SPEED) * 0.05;
            PHYSICS.SEPARATION += (30 - PHYSICS.SEPARATION) * 0.05;
            PHYSICS.ALIGN_WEIGHT += (1.5 - PHYSICS.ALIGN_WEIGHT) * 0.05;
        }

        // Palette
        let targetSet = window.PALETTES[window.currentMood] || window.PALETTES["NEUTRAL"];
        if (window.glitchMode) targetSet = { pri:{r:255,g:255,b:255}, sec:{r:255,g:0,b:0}, conn:{r:100,g:0,b:0} };
        lerpRGB(window.curPalette.pri, targetSet.pri, 0.05);
        lerpRGB(window.curPalette.sec, targetSet.sec, 0.05);
        lerpRGB(window.curPalette.conn, targetSet.conn, 0.05);

        const cx = width/2;
        const cy = height*0.35;
        time += 0.005; // Slower time for elegance
        
        rotationY = Math.sin(time*0.1) * 0.1; 
        rotationX = Math.sin(time*0.15)*0.05;
        
        pulseTime += 0.02;
        if(digestionGlow > 0) digestionGlow *= 0.94;

        // D. PHYSICS UPDATE
        boids.forEach(b => b.update(boids, mouse, width, height));

        // E. TEXT INGESTION
        if(window.feedingActive && foodParticles.length > 0) {
             for(let i=foodParticles.length-1; i>=0; i--) {
                 let fp = foodParticles[i];
                 fp.y += fp.vy;
                 fp.x += fp.vx + Math.sin(time*3 + fp.offset)*1.0; 
                 
                 if(Math.abs(fp.y) < 150 && Math.abs(fp.x) < 300) {
                     if(boids.length < MAX_FLOCK) {
                         let newB = new Boid(fp.x, fp.y, 0, true);
                         boids.push(newB);
                     }
                     digestionGlow += 0.1;
                     eatenFoodCount++;
                     foodParticles.splice(i, 1);
                 } else if (fp.y < -height*0.6) {
                     foodParticles.splice(i, 1);
                 }
             }
        }

        // F. RENDER
        const proj = boids.map(b => project(b, cx, cy));

        ctx.lineWidth = 0.8;
        
        // Connections - ONLY close neighbors to create "Ribbon" effect
        for(let i=0; i<proj.length; i++) {
            let p1 = proj[i];
            if(p1.scale < 0) continue;
            
            // Look ahead in array (spatially roughly sorted by update loop stride)
            for(let j=1; j<4; j++) {
                let p2 = proj[(i+j*3)%proj.length]; 
                let dx = p1.x - p2.x; 
                let dy = p1.y - p2.y;
                let dSq = dx*dx + dy*dy;
                let maxD = 50 * p1.scale;

                if(dSq < maxD*maxD) {
                    let alpha = (1 - Math.sqrt(dSq)/maxD) * 0.4 * p1.scale;
                    
                    if (p1.boid.fear > 0) alpha = 0.8; // Panic flash

                    let c = window.curPalette.conn;
                    ctx.strokeStyle = `rgba(${Math.floor(c.r)},${Math.floor(c.g)},${Math.floor(c.b)},${alpha})`;
                    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
                }
            }

            // Draw Boid - No Sperm Tail. Just a sharp point or dot.
            let cObj = p1.boid.type === 'pri' ? window.curPalette.pri : window.curPalette.sec;
            let alpha = Math.min(1, p1.scale * 1.5);
            let rad = (p1.boid.type === 'pri' ? 2 : 1.5) * p1.scale;

            if(p1.boid.bornTime > 0) { 
                cObj = {r:255, g:255, b:255}; 
                alpha = 1; rad *= 1.5;
            }
            if(p1.boid.fear > 0) {
                 cObj = {r:255, g:200, b:200}; 
                 rad *= 1.2;
            }
            
            ctx.fillStyle = `rgba(${Math.floor(cObj.r)},${Math.floor(cObj.g)},${Math.floor(cObj.b)},${alpha})`;
            ctx.beginPath(); ctx.arc(p1.x, p1.y, rad, 0, Math.PI*2); ctx.fill();
        }

        // Glow
        if(digestionGlow > 0.05) {
            let r = 100 + digestionGlow*150;
            let grg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            let c = window.curPalette.pri;
            grg.addColorStop(0, `rgba(${Math.floor(c.r)},${Math.floor(c.g)},${Math.floor(c.b)},${digestionGlow*0.3})`);
            grg.addColorStop(1, "transparent");
            ctx.fillStyle = grg;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
        }

        // UI Labels
        ctx.globalCompositeOperation = 'source-over';
        ctx.font = "10px monospace";
        indicesList.forEach((lbl, i) => {
            let idx = Math.floor((i/indicesList.length) * proj.length);
            let p = proj[idx];
            if(p && p.scale > 0.6) { 
                let c = window.curPalette.sec;
                ctx.fillStyle = `rgba(${Math.floor(c.r)},${Math.floor(c.g)},${Math.floor(c.b)},${0.6})`;
                ctx.fillText(lbl, p.x+10, p.y+4);
            }
        });

        // Food Text
        if(window.feedingActive && foodParticles.length > 0) {
            ctx.font = "bold 20px 'Courier New'";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            for(let fp of foodParticles) {
                let x = cx + fp.x;
                let y = cy + fp.y;
                
                ctx.save();
                ctx.translate(x, y);
                let shimmer = 0.5 + Math.sin(time*20)*0.5;
                let c = window.curPalette.pri;
                ctx.fillStyle = `rgba(${Math.floor(c.r)},${Math.floor(c.g)},${Math.floor(c.b)},${0.8+shimmer*0.2})`;
                ctx.fillText(fp.char, 0, 0);
                ctx.restore();
            }
        }

        requestAnimationFrame(animate);
    }
    animate();
};