const SUPABASE_URL = 'https://dfmugytablgldpkadfrl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AoeVLd5TSJMGyhAyDmXTng_5C-_C8nC';

let supabaseClient = null;
let currentUser = null;
let data = { 
    petitioners: [""], respondents: [""], questions: [""], cases: [""], statutes: [""] 
};

// 1. Initialize
window.onload = () => {
    try {
        if (window.supabase) {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            document.getElementById('auth-status').innerText = "System Ready (Cloud Active)";
        }
    } catch (e) {
        document.getElementById('auth-status').innerText = "System Ready (Offline Only)";
    }
    renderInputFields();
    refresh();
};

// 2. Navigation
function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    event.currentTarget.classList.add('active');
}

// 3. Render Engine
function refresh() {
    const v = (id) => document.getElementById(id)?.value || "";
    let pNum = 1;
    const makePage = (html) => `<div class="paper">${html}<div class="manual-footer">${pNum++}</div></div>`;

    const cover = `
        <div style="font-weight:bold;">${v('docketNum').toUpperCase() || 'NO. 00-000'}</div>
        <div class="court-header">In the <br> Supreme Court of the United States</div>
        <div style="text-align:center; font-weight:bold;">${v('courtTerm').toUpperCase() || 'OCTOBER TERM 202X'}</div>
        <hr>
        <div style="display:flex; margin:20px 0;">
            <div style="flex:1; padding-right:15px;">
                ${data.petitioners.map(p => p.toUpperCase() || 'PETITIONER').join(',<br>')},<br> <i>Petitioner</i>,
                <div style="margin:10px 40px;">v.</div>
                ${data.respondents.map(r => r.toUpperCase() || 'RESPONDENT').join(',<br>')},<br> <i>Respondent</i>.
            </div>
            <div style="border-left:1.5pt solid black; padding-left:20px; width:45%; font-style:italic;">
                On Writ of Certiorari to the ${v('lowerCourt') || 'the Lower Court'}
            </div>
        </div>
        <div class="title-box">BRIEF FOR THE ${v('briefType').toUpperCase()}</div>
        <div style="text-align:center; margin-top:0.8in;">
            <b>Respectfully Submitted,</b><br><br>
            <span style="font-variant:small-caps; font-weight:bold;">${v('firmName') || 'FIRM NAME'}</span><br>
            <div style="font-size:11pt; margin-top:10px;">${v('studentNames').replace(/\n/g, '<br>') || 'COUNSEL NAME'}</div>
        </div>`;

    const questions = `<div class="section-header">QUESTIONS PRESENTED</div>${data.questions.map((q, i) => `<p><b>${i+1}.</b> ${q || '...'}</p>`).join('')}`;
    const authorities = `<div class="section-header">TABLE OF AUTHORITIES</div><p><b>Cases:</b></p>${data.cases.filter(x => x.trim()).sort().map(c => `<div><i>${c}</i></div>`).join('') || '...'}`;
    const argument = `<div class="section-header">SUMMARY OF ARGUMENT</div><p>${v('summaryArg')}</p><div class="section-header">ARGUMENT</div><p style="white-space: pre-wrap;">${v('argBody')}</p>`;
    const conclusion = `<div class="section-header">CONCLUSION</div><p>${v('conclusionText')}</p>`;

    const target = document.getElementById('render-target');
    if (target) {
        target.innerHTML = makePage(cover) + makePage(questions) + makePage(authorities) + makePage(argument) + makePage(conclusion);
    }
}

// 4. Input Helpers
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
                <input type="text" value="${val}" oninput="data['${t}s'][${i}]=this.value; refresh()">
                <button onclick="removeDynamic('${t}', ${i})" style="border:none; background:none; cursor:pointer;">❌</button>
            </div>
        `).join('');
    });
}

// 5. Cloud Logic
function onSignIn(response) {
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    currentUser = payload.email;
    document.getElementById('auth-status').innerText = "User: " + currentUser;
    fetchProjectList();
}

async function saveToCloud() {
    if (!currentUser || !supabaseClient) return alert("Please sign in.");
    const title = document.getElementById('projectTitle').value || "Untitled";
    const inputs = {};
    document.querySelectorAll('input, textarea, select').forEach(el => { if(el.id) inputs[el.id] = el.value; });

    const { error } = await supabaseClient.from('briefs').upsert({ 
        user_id: currentUser, project_title: title, content_data: data, input_fields: inputs
    }, { onConflict: 'user_id, project_title' });

    if (error) alert(error.message); else { alert("Saved!"); fetchProjectList(); }
}

async function fetchProjectList() {
    if (!currentUser || !supabaseClient) return;
    const { data: projects } = await supabaseClient.from('briefs').select('project_title').eq('user_id', currentUser);
    const drop = document.getElementById('cloud-projects');
    drop.innerHTML = '<option value="">📂 My Cloud Projects...</option>';
    if (projects) projects.forEach(p => {
        const o = document.createElement('option'); o.value = p.project_title; o.textContent = p.project_title;
        drop.appendChild(o);
    });
}

async function loadSpecificProject(title) {
    if (!title || !supabaseClient) return;
    const { data: p } = await supabaseClient.from('briefs').select('*').eq('user_id', currentUser).eq('project_title', title).single();
    if (p) {
        data = p.content_data;
        for(let id in p.input_fields) { if(document.getElementById(id)) document.getElementById(id).value = p.input_fields[id]; }
        renderInputFields(); refresh();
    }
}

async function deleteProject() {
    const drop = document.getElementById('cloud-projects');
    const title = drop.value;
    if (!title) return alert("Select a project first.");
    if (!confirm(`Delete "${title}"?`)) return;

    const { error } = await supabaseClient.from('briefs').delete().eq('user_id', currentUser).eq('project_title', title);
    if (!error) {
        alert("Deleted.");
        await fetchProjectList();
        drop.value = "";
    }
}

// 6. Export logic
function downloadPDF() {
    const element = document.getElementById('render-target');
    const title = document.getElementById('projectTitle').value || "Brief";
    
    html2pdf().from(element).set({
        margin: 0,
        filename: `${title}.pdf`,
        html2canvas: { 
            scale: 2, 
            width: 816, // Forces 8.5 inches exactly to prevent "zooming"
            windowWidth: 816 
        },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
    }).save();
}
