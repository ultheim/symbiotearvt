// ============================================
// MAIN COORDINATOR (main.js)
// ============================================

window.currentMood = "NEUTRAL";
window.glitchMode = false;
window.MOOD_AUDIO = {
    "NEUTRAL": { fShift: 1.0, speed: 1.0, type: "normal" },
    "AFFECTIONATE": { fShift: 0.8, speed: 1.3, type: "soft" }, 
    "CRYPTIC": { fShift: 0.9, speed: 1.0, type: "resonant" },
    "WARNING": { fShift: 1.5, speed: 0.6, type: "harsh" },     
    "JOYFUL": { fShift: 1.2, speed: 0.9, type: "bouncy" },
    "CURIOUS": { fShift: 1.3, speed: 1.1, type: "light" },
    "SAD": { fShift: 0.6, speed: 1.8, type: "heavy" },
    "GLITCH": { fShift: 2.0, speed: 0.4, type: "broken" }
};
window.PALETTES = {
    "NEUTRAL": { pri: {r:255, g:115, b:0}, sec: {r:200, g:100, b:50}, conn: {r:255, g:160, b:0} },
    "AFFECTIONATE": { pri: {r:255, g:105, b:180}, sec: {r:147, g:112, b:219}, conn: {r:255, g:192, b:203} }, 
    "CRYPTIC": { pri: {r:0, g:255, b:70}, sec: {r:0, g:100, b:0}, conn: {r:150, g:255, b:150} }, 
    "WARNING": { pri: {r:255, g:0, b:0}, sec: {r:100, g:0, b:0}, conn: {r:255, g:255, b:0} }, 
    "JOYFUL": { pri: {r:255, g:215, b:0}, sec: {r:255, g:140, b:0}, conn: {r:255, g:255, b:200} }, 
    "CURIOUS": { pri: {r:0, g:255, b:255}, sec: {r:0, g:100, b:255}, conn: {r:200, g:255, b:255} }, 
    "SAD": { pri: {r:70, g:70, b:255}, sec: {r:30, g:30, b:100}, conn: {r:100, g:100, b:255} }
};

let USER_API_KEY = localStorage.getItem("symbiosis_api_key") || "";
const OPENROUTER_MODEL = "google/gemini-2.5-flash";

// --- HISTORY STATE ---
let chatHistory = []; 

window.triggerError = () => {
    window.currentMood = "WARNING";
    setTimeout(() => { window.currentMood = "NEUTRAL"; }, 3000);
};

window.checkAuth = function() {
    const ui = document.getElementById('ui-layer');
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

// --- UPDATED CHAT HANDLER WITH HISTORY ---
async function handleChat(userText) {
    if(!USER_API_KEY) return;
    const btn = document.getElementById('sendBtn');
    btn.textContent = "SYNCING..."; btn.disabled = true;

    // 1. Add User message to history
    chatHistory.push({ role: "user", content: userText });

    // Keep history manageable (optional: limit to last 10 messages)
    if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);

    try {
        // 2. PASS chatHistory as the 4th argument
        const data = await window.processMemoryChat(userText, USER_API_KEY, OPENROUTER_MODEL, chatHistory);
        
        let rawText = data.choices[0].message.content;
        const firstBrace = rawText.indexOf('{'), lastBrace = rawText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) rawText = rawText.substring(firstBrace, lastBrace + 1);
        const json = JSON.parse(rawText);

        // 3. Add AI response to history so it remembers for next time
        chatHistory.push({ role: "assistant", content: json.response });

        if (json.keywords && Array.isArray(json.keywords)) window.updateKeywords(json.keywords);
        if(json.mood && window.MOOD_AUDIO[json.mood]) window.currentMood = json.mood; else window.currentMood = "NEUTRAL";

        // 1. Define the safety timer
        let safetyTimer = null;

        // 2. Start the regular check
        const checkEating = setInterval(() => {
            if (window.feedingActive === false || document.querySelectorAll('.char-span').length === 0) { 
                clearInterval(checkEating);      
                if(safetyTimer) clearTimeout(safetyTimer); 
                window.speak(json.response);     
            }
        }, 50); 
        
        // 3. Start the safety timer
        safetyTimer = setTimeout(() => { 
            clearInterval(checkEating); 
            window.speak(json.response); 
        }, 3000); 

    } catch (error) {
        console.error(error); window.triggerError();
        window.speak("SYSTEM FAILURE.");
    } finally { btn.textContent = "SYNC"; btn.disabled = false; }
}

window.handleInput = function() {
    const input = document.getElementById('wordInput');
    const text = input.value;
    if(!text) return;

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
    window.initSymbiosisAnimation(); 
    window.checkAuth(); 
    document.getElementById('wordInput').addEventListener('keypress',e=>{if(e.key==='Enter')window.handleInput()});

};
