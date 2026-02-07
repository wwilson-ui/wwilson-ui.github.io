let data = { 
    petitioners: [""], 
    respondents: [""], 
    questions: [""], 
    cases: [""], 
    statutes: [""] 
};

window.onload = () => { 
    renderInputFields(); 
    refresh(); 
};

// --- AUTH LOGIC ---
function onSignIn(response) {
    try {
        const payload = JSON.parse(atob(response.credential.split('.')[1]));
        document.getElementById('auth-status').innerText = "Logged in as: " + payload.email;
    } catch(e) {
        console.error("Auth error:", e);
    }
}

// --- TAB LOGIC ---
function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(id).classList.add('active');
    const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(id));
    if (btn) btn.classList.add('active');
}

// --- DYNAMIC FIELD LOGIC ---
function addDynamic(type) {
    data[type + 's'].push("");
    renderInputFields();
    refresh();
}

function removeDynamic(type, idx) {
    if (data[type + 's'].length > 1) data[type + 's'].splice(idx, 1);
    else data[type + 's'][0] = "";
    renderInputFields();
    refresh();
}

function renderInputFields() {
    const types = ['petitioner', 'respondent', 'question', 'case', 'statute'];
    types.forEach(t => {
        const container = document.getElementById(`${t}-inputs`);
        if (!container) return;
        container.innerHTML = data[t + 's'].map((val, i) => `
            <div style="display:flex; gap:5px; margin-bottom:5px;">
                <input type="text" value="${val}" placeholder="..." oninput="data['${t}s'][${i}]=this.value; refresh()">
                <button onclick="removeDynamic('${t}', ${i})" style="background:none; border:none; cursor:pointer;">❌</button>
            </div>
        `).join('');
    });
}

// --- PREVIEW RENDERING ---
function refresh() {
    const get = (id) => document.getElementById(id)?.value || "";
    let pageNum = 1;

    // Helper to wrap content in a paper div with a footer
    const makePage = (content) => `
        <div class="paper">
            ${content}
            <div class="manual-footer">${pageNum++}</div>
        </div>`;

    // 1. COVER PAGE
    const coverHTML = `
        <div style="font-weight:bold;">${get('docketNum').toUpperCase() || 'NO. 00-000'}</div>
        <div class="court-header">In the <span class="sc-caps">Supreme Court of the United States</span></div>
        <div style="text-align:center; font-weight:bold;">${get('courtTerm').toUpperCase() || 'OCTOBER TERM 202X'}</div>
        <hr style="border:0; border-top:1.5pt solid black; margin:10px 0;">
        <div style="display:flex; margin:20px 0;">
            <div style="flex:1;">
                ${data.petitioners.map(p => p.toUpperCase() || 'PETITIONER').join(',<br>')},<br>
                <i>Petitioner</i>,<br><div style="margin:15px 40px;">v.</div>
                ${data.respondents.map(r => r.toUpperCase() || 'RESPONDENT').join(',<br>')},<br>
                <i>Respondent</i>.
            </div>
            <div style="border-left:1.5pt solid black; padding-left:20px; width:40%; font-style:italic;">
                On Writ of Certiorari to the ${get('lowerCourt') || 'the Lower Court'}
            </div>
        </div>
        <div class="title-box">BRIEF FOR THE ${get('briefType').toUpperCase()}</div>
        <div style="text-align:center; margin-top:1in;">
            <b>Respectfully Submitted,</b><br><br>
            <span class="sc-caps">${get('firmName') || 'FIRM NAME'}</span><br>
            <div style="font-size:11pt; margin-top:10px;">${get('studentNames').replace(/\n/g, '<br>') || 'COUNSEL NAME'}</div>
        </div>`;

    // 2. QUESTIONS PRESENTED
    const questionsHTML = `
        <div class="section-header">QUESTIONS PRESENTED</div>
        ${data.questions.map((q, i) => `<p><b>${i+1}.</b> ${q || '...'}</p>`).join('')}`;
    
    // 3. TABLE OF AUTHORITIES
    const authoritiesHTML = `
        <div class="section-header">TABLE OF AUTHORITIES</div>
        <p style="text-decoration: underline; font-weight: bold;">Cases:</p>
        ${data.cases.filter(x => x.trim() !== "").length > 0 
            ? data.cases.filter(x => x).sort().map(c => `<div style="margin-bottom:8px; padding-left: 20px;"><i>${c}</i></div>`).join('') 
            : '<div style="color: #999; padding-left: 20px;">...</div>'}
        <p style="text-decoration: underline; font-weight: bold; margin-top:25px;">Statutes:</p>
        ${data.statutes.filter(x => x.trim() !== "").length > 0 
            ? data.statutes.filter(x => x).sort().map(s => `<div style="margin-bottom:8px; padding-left: 20px;">${s}</div>`).join('') 
            : '<div style="color: #999; padding-left: 20px;">...</div>'}`;

    // 4. SUMMARY & ARGUMENT
    const argumentBodyHTML = `
        <div class="section-header">SUMMARY OF ARGUMENT</div>
        <p style="text-indent: 0.5in;">${get('summaryArg') || '...'}</p>
        <div class="section-header">ARGUMENT</div>
        <p style="white-space: pre-wrap; text-indent: 0.5in;">${get('argBody') || '...'}</p>`;

    // 5. CONCLUSION (Dedicated Page)
    const conclusionHTML = `
        <div class="section-header">CONCLUSION</div>
        <p style="text-indent: 0.5in; margin-bottom: 40px;">${get('conclusionText') || '...'}</p>
        <div style="margin-top: 60px; float: right; width: 250px;">
            <p>Respectfully submitted,</p>
            <br><br>
            <p>__________________________</p>
            <p style="font-size: 11pt;">${get('studentNames').split('\n')[0] || 'Counsel of Record'}</p>
        </div>
        <div style="clear: both;"></div>`;

    // Render to Target
    document.getElementById('render-target').innerHTML = 
        makePage(coverHTML) + 
        makePage(questionsHTML) + 
        makePage(authoritiesHTML) +
        makePage(argumentBodyHTML) +
        makePage(conclusionHTML);
}

// --- FILE & PRINT OPS ---
function localExport() {
    const inputs = {};
    document.querySelectorAll('input, textarea, select').forEach(el => { if(el.id) inputs[el.id] = el.value; });
    const blob = new Blob([JSON.stringify({ data, inputs })], {type: "application/json"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (document.getElementById('projectTitle').value || "brief") + ".json";
    a.click();
}

function localImport(e) {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const pack = JSON.parse(event.target.result);
            data = pack.data;
            for(let id in pack.inputs) { if(document.getElementById(id)) document.getElementById(id).value = pack.inputs[id]; }
            renderInputFields(); refresh();
        } catch(err) {
            console.error("Import error:", err);
        }
    };
    reader.readAsText(e.target.files[0]);
}

function downloadPDF() {
    const element = document.getElementById('render-target');
    html2pdf().from(element).set({
        margin: 0, 
        filename: 'Brief.pdf', 
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    }).save();
}
