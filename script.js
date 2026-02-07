/**
 * SCOTUS Brief Pro - Core Logic
 * Handles: Tab Switching, Dynamic Inputs, 1.25" Margin Rendering, and Page Numbering
 */

// 1. Initial State
let data = { 
    petitioners: [""], 
    respondents: [""], 
    questions: [""], 
    cases: [""], 
    statutes: [""] 
};

// 2. Initialization
window.onload = () => { 
    renderInputFields(); 
    refresh(); 
};

// 3. UI Tab Switching Logic
function switchTab(id) {
    const contents = document.querySelectorAll('.tab-content');
    const buttons = document.querySelectorAll('.tab-btn');
    
    // Hide all tabs and deactivate all buttons
    contents.forEach(content => content.classList.remove('active'));
    buttons.forEach(btn => btn.classList.remove('active'));
    
    // Show the selected tab
    const targetTab = document.getElementById(id);
    if (targetTab) targetTab.classList.add('active');
    
    // Highlight the correct button
    const activeBtn = Array.from(buttons).find(btn => btn.getAttribute('onclick').includes(id));
    if (activeBtn) activeBtn.classList.add('active');
}

// 4. Dynamic Input Management (Add/Remove Rows)
function addDynamic(type) {
    data[type + 's'].push("");
    renderInputFields();
    refresh();
}

function removeDynamic(type, idx) {
    if (data[type + 's'].length > 1) {
        data[type + 's'].splice(idx, 1);
    } else {
        data[type + 's'][0] = ""; // Keep at least one empty box
    }
    renderInputFields();
    refresh();
}

function renderInputFields() {
    ['petitioner', 'respondent', 'question', 'case', 'statute'].forEach(t => {
        const container = document.getElementById(`${t}-inputs`);
        if (!container) return;
        container.innerHTML = data[t + 's'].map((val, i) => `
            <div style="display:flex; gap:5px; margin-bottom:5px;">
                <input type="text" value="${val}" placeholder="..." 
                    oninput="data['${t}s'][${i}]=this.value; refresh()">
                <button onclick="removeDynamic('${t}', ${i})" 
                    style="background:none; border:none; cursor:pointer; font-size: 1rem;">❌</button>
            </div>
        `).join('');
    });
}

// 5. Document Rendering Logic (Handles 1.25" Margins and Numbering)
function refresh() {
    const get = (id) => document.getElementById(id)?.value || "";
    const bType = get('briefType') || "Petitioner";
    
    // Important: Reset page counter to 1 every time we re-render
    let pageNum = 1; 

    // Helper to wrap content in a 1.25" margin paper div with a footer
    const makePage = (content) => {
        return `
            <div class="paper">
                ${content}
                <div class="manual-footer">${pageNum++}</div>
            </div>`;
    };

    // --- PAGE 1: COVER ---
    const coverHTML = `
        <div style="font-weight:bold;">${get('docketNum').toUpperCase() || 'NO. 00-000'}</div>
        <div class="court-header">In the <span class="sc-caps">Supreme Court of the United States</span></div>
        <div style="text-align:center; font-weight:bold;">${get('courtTerm').toUpperCase() || 'OCTOBER TERM 202X'}</div>
        <hr style="border:0; border-top:1.5pt solid black; margin:10px 0;">
        <div style="display:flex; margin:20px 0;">
            <div style="flex:1;">
                ${data.petitioners.map(p => p.toUpperCase() || 'PETITIONER').join(',<br>')},<br>
                <i>Petitioner${data.petitioners.length > 1 ? 's' : ''}</i>,<br>
                <div style="margin:15px 40px;">v.</div>
                ${data.respondents.map(r => r.toUpperCase() || 'RESPONDENT').join(',<br>')},<br>
                <i>Respondent${data.respondents.length > 1 ? 's' : ''}.</i>
            </div>
            <div style="border-left:1.5pt solid black; padding-left:20px; width:40%; font-style:italic; display:flex; align-items:center;">
                On Writ of Certiorari to the ${get('lowerCourt') || 'the Lower Court'}
            </div>
        </div>
        <div class="title-box">BRIEF FOR THE ${bType.toUpperCase()}</div>
        <div style="text-align:center; margin-top:1in;">
            <b>Respectfully Submitted,</b><br><br>
            <span class="sc-caps">${get('firmName') || 'FIRM NAME'}</span><br>
            <div style="font-size:11pt; margin-top:10px;">${get('studentNames').replace(/\n/g, '<br>') || 'COUNSEL NAME'}</div>
        </div>
    `;

    // --- PAGE 2: QUESTIONS ---
    const questionsHTML = `
        <div class="section-header">QUESTIONS PRESENTED</div>
        ${data.questions.map((q, i) => `<p style="margin-bottom:15px;"><b>${i+1}.</b> ${q || '...'}</p>`).join('')}
    `;

    // --- PAGE 3: AUTHORITIES ---
    const authoritiesHTML = `
        <div class="section-header">TABLE OF AUTHORITIES</div>
        <p><b>Cases:</b></p>
        ${data.cases.filter(x=>x).sort().map(c => `<div style="margin-bottom:5px; padding-left: 20px;"><i>${c}</i></div>`).join('')}
        <p style="margin-top:20px;"><b>Statutes:</b></p>
        ${data.statutes.filter(x=>x).sort().map(s => `<div style="margin-bottom:5px; padding-left: 20px;">${s}</div>`).join('')}
    `;

    // --- PAGE 4: ARGUMENT ---
    const argumentHTML = `
        <div class="section-header">SUMMARY OF ARGUMENT</div>
        <p style="text-indent: 0.5in;">${get('summaryArg') || '...'}</p>
        <div class="section-header">ARGUMENT</div>
        <p style="white-space: pre-wrap; text-indent: 0.5in;">${get('argBody') || '...'}</p>
        <div class="section-header">CONCLUSION</div>
        <p style="text-indent: 0.5in;">${get('conclusionText') || '...'}</p>
    `;

    // Push all pages to the preview window
    const target = document.getElementById('render-target');
    if (target) {
        target.innerHTML = 
            makePage(coverHTML) + 
            makePage(questionsHTML) + 
            makePage(authoritiesHTML) + 
            makePage(argumentHTML);
    }
}

// 6. Export to PDF
function downloadPDF() {
    const element = document.getElementById('render-target');
    const opt = {
        margin: 0, // We use the .paper padding for margins instead
        filename: 'SCOTUS_Brief_Final.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().from(element).set(opt).save();
}

// 7. Local File Persistence (JSON)
function localExport() {
    const title = document.getElementById('projectTitle')?.value || "brief-export";
    const inputs = {};
    // Capture all manual text/select inputs
    document.querySelectorAll('.input-panel input, .input-panel textarea, .input-panel select').forEach(el => {
        if (el.id) inputs[el.id] = el.value;
    });
    
    const exportData = JSON.stringify({ data, inputs }, null, 2);
    const blob = new Blob([exportData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = title + ".json";
    a.click();
    URL.revokeObjectURL(url);
}

function localImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const pack = JSON.parse(event.target.result);
            // Restore Dynamic Data
            data = pack.data;
            // Restore Static Inputs
            for (let id in pack.inputs) {
                const el = document.getElementById(id);
                if (el) el.value = pack.inputs[id];
            }
            renderInputFields();
            refresh();
            alert("File imported successfully.");
        } catch (err) {
            alert("Error reading JSON file.");
            console.error(err);
        }
    };
    reader.readAsText(file);
}
