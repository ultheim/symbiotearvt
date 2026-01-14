// ============================================
// MEMORY MODULE (memory.js) - IMPROVED SEARCH
// ============================================

window.processMemoryChat = async function(userText, apiKey, model, history = []) {
    const appsScriptUrl = localStorage.getItem("symbiosis_apps_script_url");
    
    // Format history for the prompt
    const historyText = history.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join("\n");

    // 1. SYNTHESIZER STEP: Aliases & Strict Formatting
    const synthPrompt = `
    USER_IDENTITY: Arvin, unless said otherwise
    CONTEXT:
    ${historyText}
    
    CURRENT INPUT: "${userText}"
    
    TASK:
    1. ENTITIES: Return a comma-separated list of ALL people/places involved.
       - Include the implied subject (e.g. if user says "me" or "I' or similar, write "Arvin").

    2. TOPICS: Broad categories (Identity, Preference, Location, Relationship, History, Work).

    3. KEYWORDS: Extract 3-5 specific search terms from the input.
       - If user asks "What is Arvin's MBTI?", keywords must be: "Arvin, MBTI"
       - If user asks "Where does Meidy work?", keywords must be: "Meidy, Work, Job, Office"
       - CRITICAL: This is used for database retrieval. Be specific.

    4. FACT: Extract NEW long-term info as a standalone declarative sentence.
       - Write in the third person.
       - If it is a QUESTION, CHIT-CHAT, or NO NEW INFO, return null.
    
    Return JSON only: { 
        "entities": "...", 
        "topics": "...", 
        "search_keywords": "...",  
        "new_fact": "..." (or null) 
    }
    `;

    console.log("🧠 1. Synthesizing Input..."); 

    let synthData = { entities: "", topics: "", search_keywords: "", new_fact: null };
    let retrievedContext = "";

    try {
        const synthReq = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": window.location.href, "X-Title": "Symbiosis" },
            body: JSON.stringify({ "model": model, "messages": [{ "role": "system", "content": synthPrompt }] })
        });
        const synthRes = await synthReq.json();
        let raw = synthRes.choices[0].message.content;
        const fb = raw.indexOf('{'), lb = raw.lastIndexOf('}');
        if (fb !== -1 && lb !== -1) raw = raw.substring(fb, lb + 1);
        synthData = JSON.parse(raw);

        console.log("🧠 AI DECISION:", synthData);

    } catch (e) { console.error("Synthesizer failed", e); }

    // 2. RETRIEVAL STEP (Google Sheets)
    // We now use the SPECIFIC 'search_keywords' generated above
    if (appsScriptUrl && synthData.search_keywords) {
        console.log("🔍 2. Searching Google Sheet for:", synthData.search_keywords); 
        try {
            // Split by comma and clean up
            const keywords = synthData.search_keywords.split(',').map(s => s.trim());
            
            const memReq = await fetch(appsScriptUrl, {
                method: "POST",
                body: JSON.stringify({ action: "retrieve", keywords: keywords })
            });
            const memRes = await memReq.json();
            if(memRes.memories && memRes.memories.length > 0) {
                console.log("📂 Memories Found:", memRes.memories); 
                retrievedContext = "MEMORIES FOUND:\n" + memRes.memories.join("\n");
            } else {
                console.log("📂 No relevant memories found."); 
            }
        } catch (e) { console.error("Memory Retrieval failed", e); }
    }

    // 3. FINAL GENERATION STEP
    const finalSystemPrompt = `
    You are Arvin's digital companion. 
    ${retrievedContext}
    
    CONVERSATION HISTORY:
    ${historyText}
    
    User: "${userText}"
    1. Answer briefly based on the MEMORIES FOUND.
    2. Provide 8 UPPERCASE, One-word keywords.
    3. Choose MOOD: [NEUTRAL, AFFECTIONATE, CRYPTIC, WARNING, JOYFUL, CURIOUS, SAD].
    Return JSON: { "response": "...", "keywords": [...], "mood": "..." }
    `;

    const finalReq = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": window.location.href, "X-Title": "Symbiosis" },
        body: JSON.stringify({ "model": model, "messages": [{ "role": "user", "content": finalSystemPrompt }] })
    });
    
    // 4. STORAGE STEP
    if (appsScriptUrl && synthData.new_fact && synthData.new_fact !== "null") {
        console.log("💾 4. Saving to Sheet..."); 
        fetch(appsScriptUrl, {
            method: "POST",
            mode: 'no-cors', 
            body: JSON.stringify({ 
                action: "store", 
                entities: synthData.entities, 
                topics: synthData.topics, 
                fact: synthData.new_fact 
            })
        })
        .then(() => console.log("✅ Save Request Sent."))
        .catch(e => console.error("❌ Save failed", e));
    } else {
        console.log("🛑 No new fact to save.");
    }

    return await finalReq.json();
}


