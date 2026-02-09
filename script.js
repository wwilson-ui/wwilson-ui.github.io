const SB_URL = 'https://dfmugytablgldpkadfrl.supabase.co';
const SB_KEY = 'sb_publishable_AoeVLd5TSJMGyhAyDmXTng_5C-_C8nC';
let supabase = null;
let userEmail = null;

let data = {
    petitioners: [""], respondents: [""], questions: [""], cases: [""], lawyers: [""]
};

window.onload = () => {
    try { supabase = window.supabase.createClient(SB_URL, SB_KEY); } catch(e){}
    renderInputs();
    refresh();
};

function toggleAmicus() {
    const isAmicus = document.getElementById('pType').value === 'Amicus Curiae';
    document.getElementById('amicus-extras').style.display = isAmicus ? 'block' : 'none';
}

function switchTab(id, btn) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    btn.classList.add('active');
}

function addInput(type) {
    data[type + 's'].push("");
    renderInputs();
    refresh();
}

function removeInput(type, idx) {
    if (data[type + 's'].length > 1) data[type + 's'].splice(idx, 1);
    else data[type + 's'][0] = "";
    renderInputs();
    refresh();
}

function renderInputs() {
    ['petitioner', 'respondent', 'question', 'case', 'lawyer'].forEach(type => {
        const container = document.getElementById(`${type}-list`);
        if (!container) return;
        container.innerHTML = data[type + 's'].map((val, i) => `
            <div style="display:flex; gap:5px; margin-bottom:5px;">
                <input type="text" value="${val}" oninput="data['${type}s'][${i}]=this.value; refresh()">
                <button onclick="removeInput('${type}', ${i})" style="border:none; background:none; cursor:pointer;">❌</button>
            </div>
        `).join('');
    });
}

function refresh() {
    const v = (id) => document.getElementById(id)?.value || "";
    const makePage = (html, pNum) => `<div class="paper">${html}<div class="manual-footer">${pNum}</div></div>`;

    // 1. DOCKET PREFIX LOGIC
    let dNum = v('pDocket').trim();
    if (dNum && !dNum.toUpperCase().startsWith("CASE NO")) {
        dNum = "Case No.: " + dNum;
    }

    // 2. BRIEF TITLE LOGIC
    let bTitle = `BRIEF FOR THE ${v('pType').toUpperCase()}`;
    if (v('pType') === 'Amicus Curiae') {
        bTitle = `BRIEF OF ${v('pAmicusName').toUpperCase() || '[NAME]'} AS AMICUS CURIAE SUPPORTING ${v('pAmicusSupport').toUpperCase()}`;
    }

    const coverHtml = `
        <div style="font-weight:bold;">${dNum.toUpperCase() || 'NOS. 00-000'}</div>
        <div class="court-header" style="margin-top: 0.6in;">In the <br> Supreme Court of the United States</div>
        <div style="text-align:center; font-weight:bold;">${v('pTerm').toUpperCase() || 'OCTOBER TERM 202X'}</div>
        <hr style="border:none; border-top:1.5pt solid black; margin:20px 0;">
        <div style="display:flex;">
            <div style="flex:1; padding-right:15px;">
                ${data.petitioners.map(p => p.toUpperCase() || 'PETITIONER').join(',<br>')},<br><i>Petitioners</i>,<br>v.<br>
                ${data.respondents.map(r => r.toUpperCase() || 'RESPONDENT').join(',<br>')},<br><i>Respondents</i>.
            </div>
            <div style="width:45%; border-left:1.5pt solid black; padding-left:15px; font-style:italic;">
                On Writ of Certiorari to the ${v('pCourt') || 'Court of Appeals'}
            </div>
        </div>
        <div style="margin-top:0.4in; text-align:center; border-top:1.5pt solid black; border-bottom:1.5pt solid black; padding:15px; font-weight:bold;">${bTitle}</div>
        <div style="margin-top:0.4in; text-align:center;">
            <b>${v('pDate') || 'DATE'}</b><br><br>
            Respectfully Submitted,<br><br>
            <span style="font-variant:small-caps; font-weight:bold;">${v('pFirm').toUpperCase() || 'LAW FIRM'}</span><br>
            ${data.lawyers.map(l => `<div>${l}</div>`).join('')}
        </div>`;

    const qHtml = `<div style="text-align:center; font-weight:bold; margin-bottom:20px;">QUESTIONS PRESENTED</div>
                   ${data.questions.map((q, i) => `<p><b>${i+1}.</b> ${q || '...'}</p>`).join('')}`;

    const authHtml = `<div style="text-align:center; font-weight:bold; margin-bottom:20px;">TABLE OF AUTHORITIES</div>
                      <p><b>Cases:</b></p>${data.cases.map(c => `<div><i>${c}</i></div>`).join('')}`;
    
    const bodyHtml = `
        <div style="text-align:center; font-weight:bold; margin-bottom:20px;">${v('pType') === 'Amicus Curiae' ? 'INTEREST OF AMICUS CURIAE' : 'SUMMARY OF ARGUMENT'}</div>
        <p>${v('pInterest')}</p>
        <div style="text-align:center; font-weight:bold; margin:30px 0 20px 0;">ARGUMENT</div>
        <p style="white-space:pre-wrap;">${v('pArg')}</p>
        <div style="text-align:center; font-weight:bold; margin:30px 0 20px 0;">CONCLUSION</div>
        <p>${v('pConc')}</p>
        <div style="text-align:right; margin-top:50px;">
            Respectfully Submitted,<br><b>${v('pFirm')}</b><br>
            ${data.lawyers.join('<br>')}
        </div>`;

    document.getElementById('render-target').innerHTML = 
        makePage(coverHtml, '') + 
        makePage(qHtml, 'i') + 
        makePage(authHtml, 'ii') + 
        makePage(bodyHtml, '1');
}

// PERSISTENCE LOGIC
function onSignIn(resp) {
    userEmail = JSON.parse(atob(resp.credential.split('.')[1])).email;
    document.getElementById('auth-status').innerText = "Logged in: " + userEmail;
    fetchProjects();
}

async function saveToCloud() {
    if(!userEmail) return alert("Sign in first.");
    const fields = {}; document.querySelectorAll('input, textarea, select').forEach(i => fields[i.id] = i.value);
    await supabase.from('briefs').upsert({ user_id: userEmail, project_title: v('pTitle'), content_data: data, input_fields: fields }, { onConflict: 'user_id, project_title' });
    alert("Saved!"); fetchProjects();
}

async function fetchProjects() {
    const { data: proj } = await supabase.from('briefs').select('project_title').eq('user_id', userEmail);
    const drop = document.getElementById('cloud-projects');
    drop.innerHTML = '<option value="">📂 Select Project...</option>';
    proj?.forEach(p => { const o = document.createElement('option'); o.value = p.project_title; o.innerText = p.project_title; drop.appendChild(o); });
}

async function loadProject() {
    const title = document.getElementById('cloud-projects').value;
    const { data: p } = await supabase.from('briefs').select('*').eq('user_id', userEmail).eq('project_title', title).single();
    if(p) {
        data = p.content_data;
        for(let id in p.input_fields) { if(document.getElementById(id)) document.getElementById(id).value = p.input_fields[id]; }
        toggleAmicus(); renderInputs(); refresh();
    }
}

async function deleteProject() {
    const title = document.getElementById('cloud-projects').value;
    if(confirm("Delete?")) { await supabase.from('briefs').delete().eq('user_id', userEmail).eq('project_title', title); fetchProjects(); }
}

function downloadPDF() {
    const element = document.getElementById('render-target');
    html2pdf().from(element).set({
        margin: 0, filename: 'SCOTUS_Brief.pdf',
        html2canvas: { scale: 2, scrollX: 0, scrollY: 0, windowWidth: 816 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
    }).save();
}
