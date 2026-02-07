let data = { petitioners: [""], respondents: [""], questions: [""], cases: [""], statutes: [""] };

window.onload = () => { renderInputFields(); refresh(); };

function switchTab(id) {
    document.querySelectorAll('.tab-content, .tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => btn.getAttribute('onclick').includes(id));
    if(activeBtn) activeBtn.classList.add('active');
}

function addDynamic(type) { data[type + 's'].push(""); renderInputFields(); refresh(); }
function removeDynamic(type, idx) {
    if(data[type + 's'].length > 1) data[type + 's'].splice(idx, 1);
    else data[type + 's'][0] = "";
    renderInputFields(); refresh();
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

function refresh() {
    const get = (id) => document.getElementById(id)?.value || "";
    const bType = get('briefType');
    let pCount = 1;

    const wrap = (content) => `<div class="paper">${content}<div class="manual-footer">${pCount++}</div></div>`;

    const coverHTML = `
        <div style="font-weight:bold;">${get('docketNum').toUpperCase() || 'NO. 00-000'}</div>
        <div class="court-header">In the <span class="sc-caps">Supreme Court of the United States</span></div>
        <div style="text-align:center; font-weight:bold;">${get('courtTerm').toUpperCase()}</div>
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
            <span class="sc-caps">${get('firmName') || 'Firm Name'}</span><br>
            <div style="font-size:11pt; margin-top:10px;">${get('studentNames').replace(/\n/g, '<br>') || 'Counsel Names'}</div>
        </div>
    `;

    const questionsHTML = `<div class="section-header">QUESTIONS PRESENTED</div>${data.questions.map((q, i) => `<p style="margin-bottom:15px;"><b>${i+1}.</b> ${q || '...'}</p>`).join('')}`;
    
    const authoritiesHTML = `
        <div class="section-header">TABLE OF AUTHORITIES</div>
        <p><b>Cases:</b></p>${data.cases.filter(x=>x).sort().map(c => `<div style="margin-bottom:5px;"><i>${c}</i></div>`).join('')}
        <p style="margin-top:20px;"><b>Statutes:</b></p>${data.statutes.filter(x=>x).sort().map(s => `<div style="margin-bottom:5px;">${s}</div>`).join('')}
    `;

    const argumentHTML = `
        <div class="section-header">SUMMARY OF ARGUMENT</div><p style="text-indent: 0.5in;">${get('summaryArg') || '...'}</p>
        <div class="section-header">ARGUMENT</div><p style="white-space: pre-wrap; text-indent: 0.5in;">${get('argBody') || '...'}</p>
        <div class="section-header">CONCLUSION</div><p style="text-indent: 0.5in;">${get('conclusionText') || '...'}</p>
    `;

    document.getElementById('render-target').innerHTML = wrap(coverHTML) + wrap(questionsHTML) + wrap(authoritiesHTML) + wrap(argumentHTML);
}

function downloadPDF() {
    html2pdf().from(document.getElementById('render-target')).set({
        margin: 0, filename: 'Brief.pdf',
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    }).save();
}

// JSON Handlers (Logic remains stable)
function localExport() {
    const title = document.getElementById('projectTitle').value || "brief";
    const inputs = {};
    document.querySelectorAll('input, textarea, select').forEach(el => { if(el.id) inputs[el.id] = el.value; });
    const blob = new Blob([JSON.stringify({ data, inputs })], {type: "application/json"});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = title + ".json"; a.click();
}

function localImport(e) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const pack = JSON.parse(event.target.result);
        data = pack.data;
        for(let id in pack.inputs) { if(document.getElementById(id)) document.getElementById(id).value = pack.inputs[id]; }
        renderInputFields(); refresh();
    };
    reader.readAsText(e.target.files[0]);
}
