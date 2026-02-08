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

function onSignIn(response) {
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    document.getElementById('auth-status').innerText = "Logged in as: " + payload.email;
}

function switchTab(id) {
    document.querySelectorAll('.tab-content, .tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(id));
    if (btn) btn.classList.add('active');
}

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
    ['petitioner', 'respondent', 'question', 'case', 'statute'].forEach(t => {
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

function refresh() {
    const get = (id) => document.getElementById(id)?.value || "";
    let pageNum = 1;
    const makePage = (content) => `<div class="paper">${content}<div class="manual-footer">${pageNum++}</div></div>`;

    // 1. COVER PAGE
    const coverHTML = `
        <div style="font-weight:bold;">${get('docketNum').toUpperCase() || 'NO. 00-000'}</div>
        <div class="court-header">In the <br> Supreme Court of the United States</div>
        <div style="text-align:center; font-weight:bold;">${get('courtTerm').toUpperCase() || 'OCTOBER TERM 202X'}</div>
        <hr>
        <div style="display:flex; margin:20px 0;">
            <div style="flex:1; padding-right:15px;">
                ${data.petitioners.map(p => p.toUpperCase() || 'PETITIONER').join(',<br>')},<br> <i>Petitioner</i>,
                <div style="margin:10px 40px;">v.</div>
                ${data.respondents.map(r => r.toUpperCase() || 'RESPONDENT').join(',<br>')},<br> <i>Respondent</i>.
            </div>
            <div style="border-left:1.5pt solid black; padding-left:20px; width:45%; font-style:italic;">
                On Writ of Certiorari to the ${get('lowerCourt') || 'the Lower Court'}
            </div>
        </div>
        <div class="title-box">BRIEF FOR THE ${get('briefType').toUpperCase()}</div>
        <div style="text-align:center; margin-top:1in;">
            <b>Respectfully Submitted,</b><br><br>
            <span style="font-variant:small-caps; font-weight:bold;">${get('firmName') || 'FIRM NAME'}</span><br>
            <div style="font-size:11pt; margin-top:10px;">${get('studentNames').replace(/\n/g, '<br>') || 'COUNSEL NAME'}</div>
        </div>`;

    // 2. QUESTIONS
    const questionsHTML = `<div class="section-header">QUESTIONS PRESENTED</div>${data.questions.map((q, i) => `<p><b>${i+1}.</b> ${q || '...'}</p>`).join('')}`;
    
    // 3. AUTHORITIES
    const authoritiesHTML = `<div class="section-header">TABLE OF AUTHORITIES</div>
        <p><b>Cases:</b></p>${data.cases.filter(x => x.trim()).sort().map(c => `<div style="margin-bottom:5px;"><i>${c}</i></div>`).join('') || '...'}
        <p style="margin-top:20px;"><b>Statutes:</b></p>${data.statutes.filter(x => x.trim()).sort().map(s => `<div style="margin-bottom:5px;">${s}</div>`).join('') || '...'}`;

    // 4. ARGUMENT
    const argumentHTML = `<div class="section-header">SUMMARY OF ARGUMENT</div><p style="text-indent:0.5in;">${get('summaryArg') || '...'}</p>
        <div class="section-header">ARGUMENT</div><p style="white-space: pre-wrap; text-indent:0.5in;">${get('argBody') || '...'}</p>`;

    // 5. CONCLUSION
    const conclusionHTML = `<div class="section-header">CONCLUSION</div><p style="text-indent:0.5in;">${get('conclusionText') || '...'}</p>
        <div style="margin-top:60px; float:right; text-align:left; width:220px;">
            Respectfully submitted,<br><br>____________________<br>${get('studentNames').split('\n')[0] || 'Counsel of Record'}
        </div><div style="clear:both;"></div>`;

    document.getElementById('render-target').innerHTML = 
        makePage(coverHTML) + makePage(questionsHTML) + makePage(authoritiesHTML) + makePage(argumentHTML) + makePage(conclusionHTML);
}

function downloadPDF() {
    const element = document.getElementById('render-target');
    
    // We temporarily hide the box-shadows so they don't create artifacts in the PDF
    const papers = document.querySelectorAll('.paper');
    papers.forEach(p => p.style.boxShadow = 'none');

    const opt = {
        margin: 0,
        filename: 'SCOTUS_Brief.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
            scale: 2, 
            useCORS: true, 
            letterRendering: true 
        },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: 'css', after: '.paper' } 
    };

    html2pdf().from(element).set(opt).save().then(() => {
        // Restore shadows for the web preview after download starts
        papers.forEach(p => p.style.boxShadow = '0 0 20px rgba(0,0,0,0.4)');
    });
}

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
        const pack = JSON.parse(event.target.result);
        data = pack.data;
        for(let id in pack.inputs) { if(document.getElementById(id)) document.getElementById(id).value = pack.inputs[id]; }
        renderInputFields(); refresh();
    };
    reader.readAsText(e.target.files[0]);
}
