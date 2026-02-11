const SUPABASE_URL = 'https://dfmugytablgldpkadfrl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AoeVLd5TSJMGyhAyDmXTng_5C-_C8nC';

let supabaseClient = null;
let currentUser = null;

// Initial data structure
let data = { 
    petitioners: [""], 
    respondents: [""], 
    questions: [""], 
    cases: [""], 
    statutes: [""] 
};

// Initialize Supabase safely
function initSupabase() {
    if (window.supabase && !supabaseClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        document.getElementById('auth-status').innerText = "System Ready (Cloud Active)";

        // BUG 1 FIX: Load cases on page init — no login required for the public dropdown
        loadCases();
        loadDocket();
    }
}

window.onload = () => {
    initSupabase();
    renderInputFields();
    refresh();
};

const TEACHER_EMAIL = "wwilson@mtps.us";

async function onSignIn(response) {
    // Decode Google JWT
    const user = JSON.parse(atob(response.credential.split('.')[1]));
    currentUser = user.email;
    document.getElementById('auth-status').innerText = `Logged in as: ${currentUser}`;
    
    // Check for Teacher/Admin access
    if (currentUser === TEACHER_EMAIL) {
        const adminBtn = document.getElementById('admin-tab-btn');
        if (adminBtn) adminBtn.style.display = "block";
    }

    // Ensure Supabase is ready before fetching
    if (!supabaseClient) initSupabase();

    if (supabaseClient) {
        loadCases();            // Refresh Assigned Cases dropdown
        loadSavedVersions();    // BUG 2 FIX: Now targets the correct element id
        loadDocket();           // Load the Docket tab data
    }
}


// --- TAB SWITCHING ---
// skipReload: pass true when caller has already loaded fresh data (prevents double-fetch race)
function switchTab(id, skipReload = false) {
    // 1. Hide all tabs and deactivate all buttons
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    // 2. Show the selected tab
    const targetTab = document.getElementById(id);
    if (targetTab) {
        targetTab.classList.add('active');
    }

    // 3. Highlight the clicked button
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    // 4. Trigger data loading for data-driven tabs — skip if caller already loaded
    if (!skipReload) {
        if (id === 'admin' && supabaseClient) {
            renderAdminCaseList();
        }
        if (id === 'docket' && supabaseClient) {
            loadDocket();
        }
    }
}


// --- AMICUS TOGGLE ---
function toggleAmicusField() {
    const type = document.getElementById('briefType').value;
    const amicusSection = document.getElementById('amicus-extras');
    amicusSection.style.display = (type === "Amicus Curiae") ? "block" : "none";
}


// --- LIVE PREVIEW ---
function refresh() {
    // BUG 1 FIX: Use 'projectTitle' for the setup tab input;
    // 'assignedCase' now exclusively refers to the cover-tab dropdown
    const v = (id) => document.getElementById(id)?.value || "";
    let pNum = 1;
    const makePage = (html) => `<div class="paper">${html}<div class="manual-footer">${pNum++}</div></div>`;

    // 1. DOCKET NUMBER LOGIC
    let docket = v('docketNum').trim();
    if (docket && !docket.toUpperCase().startsWith("CASE NO.:")) {
        docket = "Case No.: " + docket;
    }

    // 2. BRIEF TITLE LOGIC (Including Amicus)
    let briefTypeTitle = `BRIEF FOR THE ${v('briefType').toUpperCase()}`;
    if (v('briefType') === "Amicus Curiae") {
        briefTypeTitle = `BRIEF OF ${v('amicusName').toUpperCase() || '[AMICUS NAME]'} AS AMICUS CURIAE ${v('amicusSupport').toUpperCase()}`;
    }

    const coverHtml = `
        <div style="font-weight:bold;">${docket.toUpperCase() || 'CASE NO. 00-000'}</div>
        <div class="court-header" style="margin-top: 0.5in;">In the <br> Supreme Court of the United States</div>
        <div style="text-align:center; font-weight:bold;">${v('courtTerm').toUpperCase() || 'OCTOBER TERM 202X'}</div>
        <hr style="border:none; border-top:1.5pt solid black; margin:20px 0;">
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
        <div class="title-box">${briefTypeTitle}</div>
        <div style="text-align:center; margin-top:0.8in;">
            <b>Respectfully Submitted,</b><br><br>
            <span style="font-variant:small-caps; font-weight:bold;">${v('firmName') || 'FIRM NAME'}</span><br>
            <div style="font-size:11pt; margin-top:10px;">${v('studentNames').replace(/\n/g, '<br>') || 'COUNSEL NAME'}</div>
        </div>`;

    // Sections (Questions, Authorities, Argument, Conclusion)
    const questionsHtml = `<div class="section-header">QUESTIONS PRESENTED</div>${data.questions.map((q, i) => `<p><b>${i+1}.</b> ${q || '...'}</p>`).join('')}`;
    const authoritiesHtml = `<div class="section-header">TABLE OF AUTHORITIES</div><p><b>Cases:</b></p>${data.cases.filter(x => x.trim()).sort().map(c => `<div><i>${c}</i></div>`).join('') || '...'}<p style="margin-top:10px;"><b>Statutes:</b></p>${data.statutes.filter(x => x.trim()).sort().map(s => `<div>${s}</div>`).join('') || '...'}`;
    const argumentHtml = `<div class="section-header">SUMMARY OF ARGUMENT</div><p>${v('summaryArg')}</p><div class="section-header">ARGUMENT</div><p style="white-space: pre-wrap;">${v('argBody')}</p>`;
    const conclusionHtml = `<div class="section-header">CONCLUSION</div><p>${v('conclusionText')}</p>`;

    const target = document.getElementById('render-target');
    if (target) {
        target.innerHTML = makePage(coverHtml) + makePage(questionsHtml) + makePage(authoritiesHtml) + makePage(argumentHtml) + makePage(conclusionHtml);
    }
}


// --- DYNAMIC INPUTS ---
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


// --- CLOUD SAVE / LOAD / DELETE ---

async function saveToCloud() {
    if (!currentUser || !supabaseClient) return alert("Please sign in first.");
    // Use projectTitle (setup tab) as the save name, falling back to the selected case
    const title = document.getElementById('projectTitle')?.value
        || document.getElementById('assignedCase')?.value
        || "Untitled";
    const inputs = {};
    document.querySelectorAll('input, textarea, select').forEach(el => { if(el.id) inputs[el.id] = el.value; });
    const { error } = await supabaseClient.from('briefs').upsert(
        { user_id: currentUser, project_title: title, content_data: data, input_fields: inputs, updated_at: new Date() },
        { onConflict: 'user_id, project_title' }
    );
    if (error) alert(error.message); else { alert("Saved!"); loadSavedVersions(); }
}

// BUG 2 FIX: Targets id="cloud-projects" (the actual HTML element id)
// Previously called fetchProjectList() and looked for id="savedProjects" — both wrong
async function loadSavedVersions() {
    const select = document.getElementById('cloud-projects'); // was 'savedProjects' — wrong id
    if (!select || !currentUser || !supabaseClient) return;

    const { data: projects, error } = await supabaseClient
        .from('briefs')
        .select('project_title')
        .eq('user_id', currentUser)
        .order('updated_at', { ascending: false });

    if (error) {
        console.error("Error loading projects:", error);
        return;
    }

    select.innerHTML = '<option value="">📂 Select a Project...</option>';
    if (projects) projects.forEach(p => {
        const o = document.createElement('option');
        o.value = p.project_title;
        o.textContent = p.project_title;
        select.appendChild(o);
    });
}

async function loadSelectedProject() {
    const title = document.getElementById('cloud-projects').value;
    if (!title) return alert("Select a project first.");
    const { data: p } = await supabaseClient
        .from('briefs').select('*')
        .eq('user_id', currentUser)
        .eq('project_title', title)
        .single();
    if (p) {
        data = p.content_data;
        for(let id in p.input_fields) {
            if(document.getElementById(id)) document.getElementById(id).value = p.input_fields[id];
        }
        toggleAmicusField();
        renderInputFields(); refresh(); alert("Loaded: " + title);
    }
}

async function deleteSelectedProject() {
    const title = document.getElementById('cloud-projects').value;
    if (!title || !confirm(`Delete "${title}"?`)) return;
    const { error } = await supabaseClient.from('briefs').delete()
        .eq('user_id', currentUser).eq('project_title', title);
    if (!error) { alert("Deleted."); loadSavedVersions(); }
}


// --- PDF DOWNLOAD ---
function downloadPDF() {
    const element = document.getElementById('render-target');
    const title = document.getElementById('assignedCase')?.value
        || document.getElementById('projectTitle')?.value
        || "Brief";
    const opt = {
        margin: 0, filename: `${title}.pdf`,
        html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
    };
    html2pdf().from(element).set(opt).save();
}


// --- CASE DROPDOWN (Cover Tab) ---

// BUG 1 FIX: loadCases targets id="assignedCase" which is now ONLY the <select> in the cover tab.
// The setup tab's duplicate input has been renamed to id="projectTitle" in index.html.
async function loadCases() {
    const select = document.getElementById('assignedCase');
    if (!select || !supabaseClient) return;

    const { data: cases, error } = await supabaseClient
        .from('active_cases')
        .select('*')
        .order('case_name');
    
    if (error) {
        console.error("Error loading cases:", error);
        select.innerHTML = '<option value="">-- Error loading cases --</option>';
        return;
    }

    select.innerHTML = '<option value="">-- Select your assigned Case --</option>' + 
        cases.map(c => `<option value="${c.case_name}">${c.case_name}</option>`).join("");

    // Show brief link when a case is selected
    select.onchange = function() {
        const chosen = cases.find(c => c.case_name === this.value);
        const linkArea = document.getElementById('caseBriefLinkArea');
        if (linkArea) {
            linkArea.innerHTML = chosen?.drive_link
                ? `📎 <a href="${chosen.drive_link}" target="_blank">View Case Brief</a>`
                : '';
        }
        refresh();
    };
}


// --- SUBMIT TO COURT ---
// BUG 3 FIX: assignedCase now unambiguously targets the cover-tab <select> (no duplicate id conflict).
// PDF is uploaded to Supabase Storage and only a URL is stored in court_docket (not raw base64).
async function submitToCourt() {
    if (!currentUser || !supabaseClient) return alert("Please sign in before submitting.");

    const caseName = document.getElementById('assignedCase')?.value;
    const briefType = document.getElementById('briefType')?.value;
    const studentName = document.getElementById('studentNames')?.value?.trim() || currentUser;

    if (!caseName) return alert("Please select your assigned case on the Cover Page tab (Tab 2) before submitting.");
    if (!briefType) return alert("Please select a brief type.");

    const submitBtn = document.querySelector('button[onclick="submitToCourt()"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "⏳ Generating PDF…"; }

    try {
        const element = document.getElementById('render-target');

        // Generate PDF blob
        const pdfBlob = await html2pdf()
            .from(element)
            .set({
                margin: 0,
                html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
                jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
                pagebreak: { mode: ['css', 'legacy'] }
            })
            .output('blob');

        // Upload PDF to Supabase Storage bucket "court-briefs"
        const fileName = `${caseName}_${briefType}_${currentUser}_${Date.now()}.pdf`
            .replace(/[^a-zA-Z0-9._-]/g, '_'); // sanitize filename

        const { error: uploadError } = await supabaseClient
            .storage
            .from('court-briefs')
            .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: false });

        if (uploadError) throw uploadError;

        // Get public URL for the uploaded file
        const { data: urlData } = supabaseClient
            .storage
            .from('court-briefs')
            .getPublicUrl(fileName);

        const publicUrl = urlData?.publicUrl;
        if (!publicUrl) throw new Error("Could not retrieve public URL for the uploaded PDF.");

        // Insert a record into court_docket with the URL (not raw base64 blob)
        const { error: insertError } = await supabaseClient
            .from('court_docket')
            .insert([{
                case_name: caseName,
                brief_type: briefType,
                student_name: studentName,
                pdf_url: publicUrl
            }]);

        if (insertError) throw insertError;

        alert("✅ Success! Your brief has been filed to the Public Court Docket.");
        await loadDocket();              // wait for table to fully rebuild
        switchTab('docket', true);       // reveal docket tab WITHOUT triggering a second loadDocket()

    } catch (err) {
        console.error("Submit to Court error:", err);
        alert("Error submitting brief: " + (err.message || err));
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "⚖️ SUBMIT TO COURT"; }
    }
}


// --- DOCKET TABLE ---
async function loadDocket() {
    if (!supabaseClient) return;
    const { data: filings } = await supabaseClient.from('court_docket').select('*');
    const { data: cases } = await supabaseClient.from('active_cases').select('*');
    const body = document.getElementById('docket-body');
    if (!body) return;
    body.innerHTML = "";

    if (!cases || cases.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888;">No cases have been added yet.</td></tr>';
        return;
    }

    cases.forEach(c => {
        const caseFilings = (filings || []).filter(f => f.case_name === c.case_name);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${c.case_name}</strong></td>
            <td>${c.drive_link ? `<a href="${c.drive_link}" target="_blank">🔗 Briefing</a>` : '—'}</td>
            <td>${getLinksByType(caseFilings, 'Petitioner')}</td>
            <td>${getLinksByType(caseFilings, 'Respondent')}</td>
            <td>${getLinksByType(caseFilings, 'Amicus Curiae')}</td>
        `;
        body.appendChild(row);
    });
}

function getLinksByType(files, type) {
    // Only show rows that have a valid pdf_url (skip legacy rows submitted before storage was set up)
    const matches = files.filter(f => f.brief_type === type && f.pdf_url);
    if (matches.length === 0) return '<span style="color:#bbb;">—</span>';
    return matches.map(f => `
        <div class="docket-link-wrapper">
            <a href="${f.pdf_url}" target="_blank">📄 ${f.student_name}</a>
            ${currentUser === TEACHER_EMAIL
                ? `<span onclick="deleteSubmission(${f.id})" style="color:red; cursor:pointer; margin-left:6px;">[x]</span>`
                : ''}
        </div>
    `).join("");
}

async function deleteSubmission(id) {
    if (!confirm("Are you sure you want to remove this student's filing?")) return;
    const { error } = await supabaseClient.from('court_docket').delete().eq('id', id);
    if (!error) {
        loadDocket();
    } else {
        alert("Delete failed: " + error.message);
    }
}


// --- TEACHER ADMIN ---

// BUG 4 FIX: Only ONE addNewCase function (the earlier duplicate at line ~331 has been removed)
async function addNewCase() {
    if (!supabaseClient) return alert("Not connected to database.");
    const name = document.getElementById('newCaseName').value.trim();
    const link = document.getElementById('newCaseLink').value.trim();

    if (!name || !link) return alert("Please provide both a Case Name and a Drive Link.");

    const { error } = await supabaseClient
        .from('active_cases')
        .insert([{ case_name: name, drive_link: link }]);

    if (error) {
        console.error("Error adding case:", error);
        alert("Failed to add case. Check your Supabase 'active_cases' table and RLS policies.");
    } else {
        document.getElementById('newCaseName').value = "";
        document.getElementById('newCaseLink').value = "";
        alert("Case successfully added!");
        loadCases();
        renderAdminCaseList();
        loadDocket();
    }
}

async function renderAdminCaseList() {
    if (!supabaseClient) return;
    const listDiv = document.getElementById('manage-cases-list');
    if (!listDiv) return;
    const { data: cases, error } = await supabaseClient
        .from('active_cases').select('*').order('case_name');

    if (error) { listDiv.innerHTML = "<p style='color:red;'>Error loading cases.</p>"; return; }
    if (!cases || cases.length === 0) { listDiv.innerHTML = "<p style='color:#666;'>No cases added yet.</p>"; return; }

    listDiv.innerHTML = cases.map(c => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #ddd;">
            <div style="flex-grow:1;">
                <strong>${c.case_name}</strong><br>
                <span style="font-size:0.8rem; color:blue;">${c.drive_link}</span>
            </div>
            <button onclick="deleteCase(${c.id})" style="background:red; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; flex-shrink:0; margin-left:10px;">Delete</button>
        </div>
    `).join("");
}

async function deleteCase(id) {
    if (!confirm("Are you sure? This will remove the case from the student dropdown.")) return;
    const { error } = await supabaseClient.from('active_cases').delete().eq('id', id);
    if (!error) {
        renderAdminCaseList();
        loadCases();
        loadDocket();
    } else {
        alert("Delete failed: " + error.message);
    }
}
