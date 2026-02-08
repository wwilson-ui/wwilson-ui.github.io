/**
 * SCOTUS Brief Pro - Core Logic
 */

// 1. DATA STATE
let data = { 
    petitioners: [""], respondents: [""], questions: [""], cases: [""], statutes: [""] 
};
let currentUser = null;
let supabaseClient = null;

// 2. SUPABASE INITIALIZATION
const SUPABASE_URL = 'https://dfmugytablgldpkadfrl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AoeVLd5TSJMGyhAyDmXTng_5C-_C8nC';

try {
    // We check if the library is loaded from the CDN
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("Supabase Client initialized.");
    }
} catch (e) {
    console.error("Database connection failed. App will run in offline mode.", e);
}

// 3. INITIAL LOAD
window.onload = () => {
    console.log("Application Loading...");
    document.getElementById('auth-status').innerText = "System Ready (Offline)";
    renderInputFields();
    refresh();
};

// 4. TAB NAVIGATION (FAIL-SAFE)
function switchTab(tabId) {
    console.log("Switching to tab: " + tabId);
    
    // Hide all contents
    const contents = document.getElementsByClassName('tab-content');
    for (let i = 0; i < contents.length; i++) {
        contents[i].classList.remove('active');
    }
    
    // Remove active from all buttons
    const buttons = document.getElementsByClassName('tab-btn');
    for (let i = 0; i < buttons.length; i++) {
        buttons[i].classList.remove('active');
    }
    
    // Show selected
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    
    // Highlight correct button
    const activeBtn = document.getElementById('btn-' + tabId);
    if (activeBtn) activeBtn.classList.add('active');
}

// 5. PREVIEW REFRESH (FAIL-SAFE)
function refresh() {
    const getVal = (id) => document.getElementById(id) ? document.getElementById(id).value : "";
    let pageCount = 1;
    const makePage = (content) => `<div class="paper">${content}<div class="manual-footer">${pageCount++}</div></div>`;

    // Generate HTML
    const coverHTML = `
        <div style="font-weight:bold;">${getVal('docketNum').toUpperCase() || 'NO. 00-000'}</div>
        <div class="court-header">In the <br> Supreme Court of the United States</div>
        <div style="text-align:center; font-weight:bold;">${getVal('courtTerm').toUpperCase() || 'OCTOBER TERM 202X'}</div>
        <hr>
        <div style="display:flex; margin:20px 0;">
            <div style="flex:1; padding-right:15px;">
                ${data.petitioners.map(p => p.toUpperCase() || 'PETITIONER').join(',<br>')},<br> <i>Petitioner</i>,
                <div style="margin:10px 40px;">v.</div>
                ${data.respondents.map(r => r.toUpperCase() || 'RESPONDENT').join(',<br>')},<br> <i>Respondent</i>.
            </div>
            <div style="border-left:1.5pt solid black; padding-left:20px; width:45%; font-style:italic;">
                On Writ of Certiorari to the ${getVal('lowerCourt') || 'the Lower Court'}
            </div>
        </div>
        <div class="title-box">BRIEF FOR THE ${getVal('briefType').toUpperCase()}</div>
        <div style="text-align:center; margin-top:1in;">
            <b>Respectfully Submitted,</b><br><br>
            <span style="font-variant:small-caps; font-weight:bold;">${getVal('firmName') || 'FIRM NAME'}</span><br>
            <div style="font-size:11pt; margin-top:10px;">${getVal('studentNames').replace(/\n/g, '<br>') || 'COUNSEL NAME'}</div>
        </div>`;

    const questionsHTML = `<div class="section-header">QUESTIONS PRESENTED</div>${data.questions.map((q, i) => `<p><b>${i+1}.</b> ${q || '...'}</p>`).join('')}`;
    
    const authoritiesHTML = `<div class="section-header">TABLE OF AUTHORITIES</div>
        <p><b>Cases:</b></p>${data.cases.filter(x => x.trim()).sort().map(c => `<div><i>${c}</i></div>`).join('') || '...'}
        <p style="margin-top:10px;"><b>Statutes:</b></p>${data.statutes.filter(x => x.trim()).sort().map(s => `<div>${s}</div>`).join('') || '...'}`;

    const argumentHTML = `<div class="section-header">SUMMARY OF ARGUMENT</div><p>${getVal('summaryArg')}</p>
        <div class="section-header">ARGUMENT</div><p style="white-space: pre-wrap;">${getVal('argBody')}</p>`;

    const conclusionHTML = `<div class="section-header">CONCLUSION</div><p>${getVal('conclusionText')}</p>`;

    const renderArea = document.getElementById('render-target');
    if (renderArea) {
        renderArea.innerHTML = makePage(coverHTML) + makePage(questionsHTML) + makePage(authoritiesHTML) + makePage(argumentHTML) + makePage(conclusionHTML);
    }
}

// 6. DYNAMIC INPUTS
function addDynamic(type) { data[type + 's'].push(""); renderInputFields(); refresh(); }
function removeDynamic(type, idx) {
    if (data[type + 's'].length > 1) data[type + 's'].splice(idx, 1);
    else data[type + 's'][0] = "";
    renderInputFields(); refresh();
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

// 7. GOOGLE AUTH & CLOUD
function onSignIn(response) {
    try {
        const payload = JSON.parse(atob(response.credential.split('.')[1]));
        currentUser = payload.email;
        document.getElementById('auth-status').innerText = "User: " + currentUser;
        fetchProjectList();
    } catch (e) { console.error("Sign-in error", e); }
}

async function saveToCloud() {
    if (!currentUser || !supabaseClient) return alert("Please sign in first.");
    const title = document.getElementById('projectTitle').value || "Untitled Brief";
    const inputs = {};
    document.querySelectorAll('input, textarea, select').forEach(el => { if(el.id) inputs[el.id] = el.value; });

    const { error } = await supabaseClient.from('briefs').upsert({ 
        user_id: currentUser, project_title: title, content_data: data, input_fields: inputs, updated_at: new Date()
    }, { onConflict: 'user_id, project_title' });

    if (error) alert("Save failed: " + error.message);
    else { alert("Saved to Cloud!"); fetchProjectList(); }
}

async function fetchProjectList() {
    if (!currentUser || !supabaseClient) return;
    const { data: projects } = await supabaseClient.from('briefs').select('project_title').eq('user_id', currentUser);
    const dropdown = document.getElementById('cloud-projects');
    dropdown.innerHTML = '<option value="">📂 Load from Cloud...</option>';
    if (projects) projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.project_title; opt.textContent = p.project_title;
        dropdown.appendChild(opt);
    });
}

async function loadSpecificProject(title) {
    if (!title || !supabaseClient) return;
    const { data: project } = await supabaseClient.from('briefs').select('*').eq('user_id', currentUser).eq('project_title', title).single();
    if (project) {
        data = project.content_data;
        for(let id in project.input_fields) { 
            const el = document.getElementById(id); if(el) el.value = project.input_fields[id]; 
        }
        renderInputFields(); refresh();
    }
}

async function deleteProject() {
    const title = document.getElementById('cloud-projects').value;
    if (!title || !confirm("Delete project?")) return;
    const { error } = await supabaseClient.from('briefs').delete().eq('user_id', currentUser).eq('project_title', title);
    fetchProjectList();
}

// 8. PDF & EXPORT
function downloadPDF() {
    const element = document.getElementById('render-target');
    html2pdf().from(element).set({
        margin: 0, filename: 'SCOTUS_Brief.pdf',
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: 'css', after: '.paper' }
    }).save();
}

function localExport() {
    const inputs = {};
    document.querySelectorAll('input, textarea, select').forEach(el => { if(el.id) inputs[el.id] = el.value; });
    const blob = new Blob([JSON.stringify({ data, inputs })], {type: "application/json"});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = (document.getElementById('projectTitle').value || "brief") + ".json"; a.click();
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
