// --- SUPABASE CONFIG ---
const SUPABASE_URL = 'https://dfmugytablgldpkadfrl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AoeVLd5TSJMGyhAyDmXTng_5C-_C8nC';
let supabase = null;


// --- const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);  ---


// Initialize Supabase safely
try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (e) {
    console.warn("Supabase not yet configured.");
}

let currentUser = null;
let data = { petitioners: [""], respondents: [""], questions: [""], cases: [""], statutes: [""] };

// --- 2. INITIALIZATION ---
window.onload = () => {
    renderInputFields();
    refresh();
};

async function onSignIn(response) {
    try {
        const payload = JSON.parse(atob(response.credential.split('.')[1]));
        currentUser = payload.email;
        document.getElementById('auth-status').innerText = "Logged in as: " + currentUser;
        
        if (supabase) await fetchProjectList();
        refresh(); // Ensure preview stays visible
    } catch(e) {
        console.error("Auth error:", e);
    }
}

// --- 3. UI LOGIC ---
function switchTab(id) {
    document.querySelectorAll('.tab-content, .tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(id));
    if (btn) btn.classList.add('active');
}

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

// --- 4. PREVIEW REFRESH ---
function refresh() {
    const get = (id) => document.getElementById(id)?.value || "";
    let pageNum = 1;
    const makePage = (content) => `<div class="paper">${content}<div class="manual-footer">${pageNum++}</div></div>`;

    const cover = `
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

    const questions = `<div class="section-header">QUESTIONS PRESENTED</div>${data.questions.map((q, i) => `<p><b>${i+1}.</b> ${q || '...'}</p>`).join('')}`;
    const authorities = `<div class="section-header">TABLE OF AUTHORITIES</div><p><b>Cases:</b></p>${data.cases.filter(x => x.trim()).sort().map(c => `<div><i>${c}</i></div>`).join('') || '...'}`;
    const argument = `<div class="section-header">SUMMARY OF ARGUMENT</div><p>${get('summaryArg')}</p><div class="section-header">ARGUMENT</div><p style="white-space: pre-wrap;">${get('argBody')}</p>`;
    const conclusion = `<div class="section-header">CONCLUSION</div><p>${get('conclusionText')}</p>`;

    const target = document.getElementById('render-target');
    if (target) {
        target.innerHTML = makePage(cover) + makePage(questions) + makePage(authorities) + makePage(argument) + makePage(conclusion);
    }
}

// --- 5. CLOUD & LOCAL PERSISTENCE ---
async function saveToCloud() {
    if (!currentUser || !supabase) return alert("Please sign in to use Cloud features.");
    
    const title = document.getElementById('projectTitle').value || "Untitled Brief";
    const inputs = {};
    document.querySelectorAll('input, textarea, select').forEach(el => { if(el.id) inputs[el.id] = el.value; });

    const { error } = await supabase.from('briefs').upsert({ 
        user_id: currentUser, project_title: title, content_data: data, input_fields: inputs, updated_at: new Date()
    }, { onConflict: 'user_id, project_title' });

    if (error) alert("Error: " + error.message);
    else { alert("Saved!"); fetchProjectList(); }
}

async function fetchProjectList() {
    if (!currentUser || !supabase) return;
    const { data: projects } = await supabase.from('briefs').select('project_title').eq('user_id', currentUser).order('updated_at', { ascending: false });
    const dropdown = document.getElementById('cloud-projects');
    dropdown.innerHTML = '<option value="">📂 Load from Cloud...</option>';
    if (projects) projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.project_title; opt.textContent = p.project_title;
        dropdown.appendChild(opt);
    });
}

async function loadSpecificProject(title) {
    if (!title || !supabase) return;
    const { data: project } = await supabase.from('briefs').select('*').eq('user_id', currentUser).eq('project_title', title).single();
    if (project) {
        data = project.content_data;
        for(let id in project.input_fields) { 
            const el = document.getElementById(id); 
            if(el) el.value = project.input_fields[id]; 
        }
        renderInputFields(); refresh();
    }
}

async function deleteProject() {
    const title = document.getElementById('cloud-projects').value;
    if (!title || !confirm(`Delete "${title}" forever?`)) return;
    const { error } = await supabase.from('briefs').delete().eq('user_id', currentUser).eq('project_title', title);
    if (!error) { fetchProjectList(); refresh(); }
}

function downloadPDF() {
    const element = document.getElementById('render-target');
    html2pdf().from(element).set({
        margin: 0, filename: 'Brief.pdf', jsPDF: { unit: 'in', format: 'letter' },
        pagebreak: { mode: 'avoid-all', before: '.paper' }
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
