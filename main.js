// ============================================
// MAIN COORDINATOR (main.js)
// ============================================

window.currentMood = "NEUTRAL";
window.glitchMode = false;

window.MOOD_AUDIO = {
    "NEUTRAL": { fShift: 1.0, speed: 1.0 },
    "AFFECTIONATE": { fShift: 0.8, speed: 1.3 }, 
    "CRYPTIC": { fShift: 0.9, speed: 1.0 },
    "WARNING": { fShift: 1.5, speed: 0.6 },     
    "JOYFUL": { fShift: 1.2, speed: 0.9 },
    "CURIOUS": { fShift: 1.3, speed: 1.1 },
    "SAD": { fShift: 0.6, speed: 1.8 },
    "GLITCH": { fShift: 2.0, speed: 0.4 }
};

window.PALETTES = {
    "NEUTRAL": { pri: {r:240, g:230, b:210}, sec: {r:180, g:170, b:155}, conn: {r:120, g:115, b:110} },
    "AFFECTIONATE": { pri: {r:255, g:210, b:210}, sec: {r:200, g:150, b:150}, conn: {r:140, g:100, b:100} }, 
    "CRYPTIC": { pri: {r:220, g:240, b:230}, sec: {r:160, g:180, b:170}, conn: {r:100, g:120, b:110} }, 
    "WARNING": { pri: {r:255, g:200, b:180}, sec: {r:200, g:120, b:80}, conn: {r:140, g:80, b:50} }, 
    "JOYFUL": { pri: {r:255, g:240, b:180}, sec: {r:220, g:190, b:120}, conn: {r:160, g:130, b:80} }, 
    "CURIOUS": { pri: {r:230, g:240, b:255}, sec: {r:150, g:170, b:190}, conn: {r:100, g:120, b:140} }, 
    "SAD": { pri: {r:200, g:210, b:220}, sec: {r:130, g:140, b:160}, conn: {r:80, g:90, b:110} }
};

let USER_API_KEY = localStorage.getItem("symbiosis_api_key") || "";
// FIXED: Changed from invalid "2.5" to reliable "1.5"
const OPENROUTER_MODEL = "google/gemini-2.5-flash"; 

let chatHistory = []; 

// --- TERMINAL HISTORY LOGIC ---
window.addToHistory = function(role, text) {
    const container = document.getElementById('terminal-content');
    if(!container) return; // Safety check
    const div = document.createElement('div');
    div.className = 'term-msg';
    
    const meta = document.createElement('div');
    meta.className = 'term-meta';
    meta.textContent = `[${new Date().toLocaleTimeString()}] // ${role.toUpperCase()}`;
    
    const content = document.createElement('div');
    content.className = role === 'user' ? 'term-user' : 'term-ai';
    content.textContent = text;
    
    div.appendChild(meta);
    div.appendChild(content);
    container.appendChild(div);
    
    // Auto-scroll
    const term = document.getElementById('terminal-history');
    if(term) term.scrollTop = term.scrollHeight;
}

window.toggleHistory = function() {
    const term = document.getElementById('terminal-history');
    if(!term) return;
    term.classList.toggle('hidden');
    const btn = document.getElementById('historyBtn');
    if(btn) btn.textContent = term.classList.contains('hidden') ? "LOG" : "EXIT";
}

window.triggerError = () => {
    window.currentMood = "WARNING";
    setTimeout(() => { window.currentMood = "NEUTRAL"; }, 3000);
};

window.checkAuth = function() {
    const ui = document.getElementById('ui-bar') || document.getElementById('ui-layer'); // Support both structures
    const input = document.getElementById('wordInput');
    const btn = document.getElementById('sendBtn');
    
    const hasKey = !!localStorage.getItem("symbiosis_api_key");
    const hasSheet = !!localStorage.getItem("symbiosis_apps_script_url");

    if (!hasKey) {
        ui.classList.add('auth-mode');
        input.placeholder = "ENTER OPENROUTER KEY...";
        btn.textContent = "AUTH";
        return "KEY";
    } else if (!hasSheet) {
        ui.classList.add('auth-mode');
        input.placeholder = "OPTIONAL: ENTER GOOGLE SCRIPT URL...";
        btn.textContent = "LINK";
        return "SHEET";
    } else {
        ui.classList.remove('auth-mode');
        input.placeholder = "COMMUNICATE...";
        btn.textContent = "SYNC";
        return "READY";
    }
}

window.saveConfig = function(val, type) {
    if(type === "KEY") {
        if(val.length < 10 || !val.startsWith("sk-")) { window.speak("INVALID KEY FORMAT."); return; }
        localStorage.setItem("symbiosis_api_key", val.trim());
        USER_API_KEY = val.trim();
        window.speak("KEY ACCEPTED.");
    } else if(type === "SHEET") {
        if(val === "SKIP") {
            localStorage.setItem("symbiosis_apps_script_url", "SKIP");
            window.speak("MEMORY DISABLED.");
        } else {
            localStorage.setItem("symbiosis_apps_script_url", val.trim());
            window.speak("MEMORY LINKED.");
        }
    }
    window.checkAuth();
}

async function handleChat(userText) {
    if(!USER_API_KEY) return;
    const btn = document.getElementById('sendBtn');
    btn.textContent = "SYNCING..."; btn.disabled = true;

    window.isThinking = true;

    chatHistory.push({ role: "user", content: userText });
    window.addToHistory("user", userText);
    
    if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);

    try {
        const data = await window.processMemoryChat(userText, USER_API_KEY, OPENROUTER_MODEL, chatHistory);
        
        // CRITICAL FIX: Check if API returned an error
        if (!data || !data.choices || !data.choices[0]) {
            console.error("API Error Response:", data);
            throw new Error("Invalid API Response");
        }

        let rawText = data.choices[0].message.content;
        
        // Robust JSON Cleaning
        const cleanRaw = rawText.replace(/```json/g, "").replace(/```/g, "");
        const firstBrace = cleanRaw.indexOf('{'), lastBrace = cleanRaw.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
             rawText = cleanRaw.substring(firstBrace, lastBrace + 1);
        }
        
        const json = JSON.parse(rawText);

        chatHistory.push({ role: "assistant", content: json.response });
        window.addToHistory("ai", json.response);

        if (json.graph && json.graph.center) {
            let flatKeywords = [json.graph.center];
            if(json.graph.branches) {
                json.graph.branches.forEach(b => {
                    flatKeywords.push(b.label);
                    if(b.leaves) flatKeywords.push(...b.leaves);
                });
            }
            window.updateKeywords(flatKeywords);
            if (window.buildKnowledgeGraph && window.globalBoidsArray) {
                window.buildKnowledgeGraph(json.graph, window.globalBoidsArray);
            }
        }
        else if (json.keywords && Array.isArray(json.keywords)) {
             window.updateKeywords(json.keywords);
             const fakeGraph = {
                 center: json.keywords[0],
                 branches: json.keywords.slice(1).map(k => ({ label: k, leaves: [] }))
             };
             window.buildKnowledgeGraph(fakeGraph, window.globalBoidsArray);
        }

        if(json.mood && window.MOOD_AUDIO[json.mood]) window.currentMood = json.mood; else window.currentMood = "NEUTRAL";

        window.isThinking = false;

        // Watchdog Timer to prevent hanging
        let watchdog = 0;
        const checkEating = setInterval(() => {
            watchdog += 50;
            if ((window.feedingActive === false || document.querySelectorAll('.char-span').length === 0) || watchdog > 3000) { 
                clearInterval(checkEating);      
                window.speak(json.response);     
            }
        }, 50); 

    } catch (error) {
        console.error("CHAT ERROR:", error); 
        window.triggerError();
        window.isThinking = false;
        window.speak("SYSTEM FAILURE.");
    } finally { btn.textContent = "SYNC"; btn.disabled = false; }
}

window.handleInput = function() {
    const input = document.getElementById('wordInput');
    const text = input.value;
    if(!text) return;

    // Initialize Audio Context immediately on user click (Critical for Safari/Chrome)
    if(window.initAudio) window.initAudio();

    const authState = window.checkAuth();
    if (authState === "KEY") { window.saveConfig(text, "KEY"); input.value = ""; return; }
    if (authState === "SHEET") { window.saveConfig(text, "SHEET"); input.value = ""; return; }

    const isGarbage = text.length > 6 && (!/[aeiouAEIOU]/.test(text) || /(.)\1{3,}/.test(text));
    
    if(isGarbage) {
        window.glitchMode = true;
        window.currentMood = "GLITCH";
        window.spawnFoodText(text);
        setTimeout(() => {
            window.speak("ERR.. SYST3M... REJECT... D4TA..."); 
            setTimeout(() => { window.glitchMode = false; window.currentMood = "NEUTRAL"; }, 2000);
        }, 2000);
    } else {
        window.spawnFoodText(text);
        if(text.startsWith('/')) {
            setTimeout(() => window.speak(text.substring(1)), 1500);
        } else {
            handleChat(text);
        }
    }
    input.value = ""; input.blur(); 
}

window.onload = () => { 
    if(window.initSymbiosisAnimation) window.initSymbiosisAnimation(); 
    window.checkAuth(); 
    const input = document.getElementById('wordInput');
    if(input) input.addEventListener('keypress',e=>{if(e.key==='Enter')window.handleInput()});
};