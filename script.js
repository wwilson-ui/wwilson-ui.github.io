let data = { petitioners: [""], respondents: [""], questions: [""], cases: [""], statutes: [""] };

window.onload = () => { 
    renderInputFields(); 
    refresh(); 
};

// TAB SWITCHING FIXED
function switchTab(id) {
    const contents = document.querySelectorAll('.tab-content');
    const buttons = document.querySelectorAll('.tab-btn');
    
    contents.forEach(content => content.classList.remove('active'));
    buttons.forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(id).classList.add('active');
    // Find the button that was clicked
    const clickedBtn = Array.from(buttons).find(btn => btn.getAttribute('onclick').includes(id));
    if(clickedBtn) clickedBtn.classList.add('active');
}

// DYNAMIC INPUTS FIXED
function addDynamic(type) {
    data[type + 's'].push("");
    renderInputFields();
    refresh();
}

function removeDynamic(type, idx) {
    if(data[type + 's'].length > 1) {
        data[type + 's'].splice(idx, 1);
    } else {
        data[type + 's'][0] = "";
    }
    renderInputFields();
    refresh();
}

function renderInputFields() {
    ['petitioner', 'respondent', 'question', 'case', 'statute'].forEach(t => {
        const container = document.getElementById(`${t}-inputs`);
        if(!container) return;
        container.innerHTML = data[t+'s'].map((val, i) => `
            <div style="display:flex; gap:5px; margin-bottom:5px;">
                <input type="text" value="${val}" placeholder="..." oninput="data['${t}s'][${i}]=this.value; refresh()">
                <button onclick="removeDynamic('${t}', ${i})" style="background:none; border:none; cursor:pointer;">❌</button>
            </div>
        `).join('');
    });
}

// REFRESH / PAGE RENDERING FIXED
function refresh() {
    const get = (id) => document.getElementById(id)?.value || "";
    const bType = get('briefType');
    
    let pageNum = 1; // RESET COUNTER ON REFRESH

    const makePage = (content) => {
        const html = `
            <div class="paper">
                ${content}
                <div class="manual-footer">${pageNum++}</div>
            </div>`;
        return html;
    };

    // Construct Content Sections
    const coverHTML = `
        <div style="font-weight:bold;">${get('docketNum').toUpperCase() || 'NO. 00-000'}</div>
        <div class="court-header">In the <span class="sc-caps">Supreme Court of the United States</span></div>
        <div style="text-align:center; font-weight:bold;">${get('courtTerm').toUpperCase() || 'TERM'}</div>
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

    const questionsHTML = `
        <div class="section-header">QUESTIONS PRESENTED</div>
        ${data.questions.map((q, i) => `<p style="margin-bottom:15px;"><b>${i+1}.</b> ${q || '...'}</p>`).join('')}
    `;

    const authoritiesHTML = `
        <div class="section-header">TABLE OF AUTHORITIES</div>
        <p><b>Cases:</b></p>
        ${data.cases.filter(x=>x).sort().map(c => `<div style="margin-bottom:5px;"><i>${c}</i></div>`).join('')}
        <p style="margin-top:20px;"><b>Statutes:</b></p>
        ${data.statutes.filter(x=>x).sort().map(s => `<div style="margin-bottom:5px;">${s}</div>`).join('')}
    `;

    const argumentHTML = `
        <div class="section-header">SUMMARY OF ARGUMENT</div>
        <p style="text-indent: 0.5in;">${get('summaryArg') || '...'}</p>
        <div class="section-header">ARGUMENT</div>
        <p style="white-space: pre-wrap; text-indent: 0.5in;">${get('argBody') || '...'}</p>
        <div class="section-header">CONCLUSION</div>
        <p style="text-indent: 0.5in;">${get('conclusionText') || '...'}</p>
    `;

    // Combine All Pages
    document.getElementById('render-target').innerHTML = 
        makePage(coverHTML) + 
        makePage(questionsHTML) + 
        makePage(authoritiesHTML) + 
        makePage(argumentHTML);
}

// DOWNLOAD PDF FIXED
function downloadPDF() {
    const element = document.getElementById('render-target');
    html2pdf().from(element).set({
        margin: 0,
        filename: 'SCOTUS_Brief.pdf',
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    }).save();
}

// LOCAL EXPORT/IMPORT FIXED
function localExport() {
    const title = document.getElementById('projectTitle').value || "brief";
    const inputs = {};
    document.querySelectorAll('input, textarea, select').forEach(el => {
        if(el.id) inputs[el.id] = el.value;
    });
    const blob = new Blob([JSON.stringify({ data, inputs })], {type: "application/json"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = title + ".json";
    a.click();
}

function localImport(e) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const pack = JSON.parse(event.target.result);
        data = pack.data;
        for(let id in pack.inputs) {
            const el = document.getElementById(id);
            if(el) el.value = pack.inputs[id];
        }
        renderInputFields();
        refresh();
    };
    reader.readAsText(e.target.files[0]);
}
