
const SUPABASE_URL = 'https://dfmugytablgldpkadfrl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AoeVLd5TSJMGyhAyDmXTng_5C-_C8nC';

let supabaseClient = null;
let currentUser = null;
let data = { 
    petitioners: [""], respondents: [""], questions: [""], cases: [""], statutes: [""] 
};

window.onload = () => {
    try {
        if (window.supabase) {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            document.getElementById('auth-status').innerText = "System Ready (Cloud Active)";
        }
    } catch (e) { console.error(e); }
    renderInputFields();
    refresh();
};


const TEACHER_EMAIL = "wwilson@mtps.us"; // Set this to your school email

function onSignIn(response) {
    const user = JSON.parse(atob(response.credential.split('.')[1]));
    currentUser = user.email;
    document.getElementById('auth-status').innerText = `Logged in as: ${currentUser}`;
    
    // 1. Check Teacher status
    if (currentUser === TEACHER_EMAIL) {
        const adminBtn = document.getElementById('admin-tab-btn');
        if (adminBtn) adminBtn.style.display = "block";
    }
    
    // 2. IMMEDIATE FETCH: Load cases for the dropdown and the docket table
    loadCases(); 
    loadDocket();
}



function switchTab(id) {
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

    // 4. IMPORTANT: If the teacher opens Admin, load the case list
    if (id === 'admin') {
        renderAdminCaseList();
    }
}



function toggleAmicusField() {
    const type = document.getElementById('briefType').value;
    const amicusSection = document.getElementById('amicus-extras');
    amicusSection.style.display = (type === "Amicus Curiae") ? "block" : "none";
}

function refresh() {
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

// ... Dynamic Inputs & Cloud Operations stay exactly the same as previous step ...
// (Omitted here for brevity, keep the fetchProjectList, loadSelectedProject, and deleteSelectedProject from the previous script)

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



async function saveToCloud() {
    if (!currentUser || !supabaseClient) return alert("Please sign in first.");
    const title = document.getElementById('assignedCase').value || "Untitled";
    const inputs = {};
    document.querySelectorAll('input, textarea, select').forEach(el => { if(el.id) inputs[el.id] = el.value; });
    const { error } = await supabaseClient.from('briefs').upsert({ user_id: currentUser, project_title: title, content_data: data, input_fields: inputs, updated_at: new Date() }, { onConflict: 'user_id, project_title' });
    if (error) alert(error.message); else { alert("Saved!"); fetchProjectList(); }
}

async function fetchProjectList() {
    if (!currentUser || !supabaseClient) return;
    const { data: projects } = await supabaseClient.from('briefs').select('project_title').eq('user_id', currentUser).order('updated_at', { ascending: false });
    const drop = document.getElementById('cloud-projects');
    drop.innerHTML = '<option value="">📂 Select a Project...</option>';
    if (projects) projects.forEach(p => {
        const o = document.createElement('option'); o.value = p.project_title; o.textContent = p.project_title;
        drop.appendChild(o);
    });
}

async function loadSelectedProject() {
    const title = document.getElementById('cloud-projects').value;
    if (!title) return alert("Select a project first.");
    const { data: p } = await supabaseClient.from('briefs').select('*').eq('user_id', currentUser).eq('project_title', title).single();
    if (p) {
        data = p.content_data;
        for(let id in p.input_fields) { if(document.getElementById(id)) document.getElementById(id).value = p.input_fields[id]; }
        // Ensure Amicus field shows up if that was the saved type
        toggleAmicusField();
        renderInputFields(); refresh(); alert("Loaded: " + title);
    }
}

async function deleteSelectedProject() {
    const title = document.getElementById('cloud-projects').value;
    if (!title || !confirm(`Delete "${title}"?`)) return;
    const { error } = await supabaseClient.from('briefs').delete().eq('user_id', currentUser).eq('project_title', title);
    if (!error) { alert("Deleted."); fetchProjectList(); }
}

function downloadPDF() {
    const element = document.getElementById('render-target');
    const title = document.getElementById('assignedCase').value || "Brief";
    const opt = {
        margin: 0, filename: `${title}.pdf`,
        html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
    };
    html2pdf().from(element).set(opt).save();
}




// 1. Fetch Cases from Database for Dropdown
async function loadCases() {
    const { data: cases } = await supabaseClient.from('active_cases').select('*').order('case_name');
    const select = document.getElementById('assignedCase');
    select.innerHTML = '<option value="">-- Select Case --</option>';
    
    cases.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.case_name;
        opt.dataset.link = c.drive_link;
        opt.innerText = c.case_name;
        select.appendChild(opt);
    });
}







// 2. Submit PDF to the Shared Docket


async function submitToCourt() {
    const caseName = document.getElementById('assignedCase')?.value;
    const briefType = document.getElementById('briefType')?.value;
    const studentName = document.getElementById('studentNames')?.value || "Anonymous";

    if (!caseName) return alert("Please select a case on the first tab.");

    const element = document.getElementById('render-target');
    const pdfBlob = await html2pdf().from(element).output('blob');
    
    const reader = new FileReader();
    reader.readAsDataURL(pdfBlob);
    reader.onloadend = async function() {
        // Save to the 'court_docket' table in Supabase
        const { error } = await supabaseClient.from('court_docket').insert([{
            case_name: caseName,
            brief_type: briefType,
            student_name: studentName,
            pdf_data: reader.result
        }]);

        if (!error) {
            alert("Success! Your brief is now on the Public Docket.");
            loadDocket(); 
            switchTab('docket');
        } else {
            alert("Error: " + error.message);
        }
    };
}







// 3. Build the Grouped Docket Table (The "View" students see)
async function loadDocket() {
    const { data: filings } = await supabaseClient.from('court_docket').select('*');
    const { data: cases } = await supabaseClient.from('active_cases').select('*');
    const body = document.getElementById('docket-body');
    body.innerHTML = "";

    cases.forEach(c => {
        const caseFilings = filings.filter(f => f.case_name === c.case_name);
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${c.case_name}</strong></td>
            <td><a href="${c.drive_link}" target="_blank">🔗 Briefing</a></td>
            <td>${getLinksByType(caseFilings, 'Petitioner')}</td>
            <td>${getLinksByType(caseFilings, 'Respondent')}</td>
            <td>${getLinksByType(caseFilings, 'Amicus Curiae')}</td>
        `;
        body.appendChild(row);
    });
}

function getLinksByType(files, type) {
    const matches = files.filter(f => f.brief_type === type);
    return matches.map(f => `
        <div class="docket-link-wrapper">
            <a href="${f.pdf_data}" download="${f.case_name}_${type}.pdf">📄 ${f.student_name}</a>
            ${currentUser === TEACHER_EMAIL ? `<span onclick="deleteSubmission(${f.id})" style="color:red; cursor:pointer;"> [x]</span>` : ''}
        </div>
    `).join("");
}

// 4. Admin function to add cases
async function addNewCase() {
    const name = document.getElementById('newCaseName').value;
    const link = document.getElementById('newCaseLink').value;
    const { error } = await supabaseClient.from('active_cases').insert([{ case_name: name, drive_link: link }]);
    if (!error) { alert("Case Added!"); loadCases(); loadDocket(); }
}





// --- TEACHER ADMIN LOGIC ---

// 1. Add a new case to Supabase
async function addNewCase() {
    const name = document.getElementById('newCaseName').value.trim();
    const link = document.getElementById('newCaseLink').value.trim();

    if (!name || !link) return alert("Please provide both a Case Name and a Drive Link.");

    const { error } = await supabaseClient
        .from('active_cases')
        .insert([{ case_name: name, drive_link: link }]);

    if (error) {
        console.error("Error adding case:", error);
        alert("Failed to add case. Check your Supabase table 'active_cases'.");
    } else {
        document.getElementById('newCaseName').value = "";
        document.getElementById('newCaseLink').value = "";
        alert("Case successfully added!");
        loadCases(); // Refresh the student dropdown
        renderAdminCaseList(); // Refresh the teacher's list
    }
}

// 2. Display the list of cases with "Delete" buttons for the teacher
async function renderAdminCaseList() {
    const listDiv = document.getElementById('manage-cases-list');
    const { data: cases, error } = await supabaseClient.from('active_cases').select('*').order('case_name');

    if (error) return listDiv.innerHTML = "Error loading cases.";
    if (cases.length === 0) return listDiv.innerHTML = "No cases added yet.";

    listDiv.innerHTML = cases.map(c => `
        <div style="display:flex; justify-content:between; align-items:center; padding:10px; border-bottom:1px solid #ddd;">
            <div style="flex-grow:1;">
                <strong>${c.case_name}</strong><br>
                <span style="font-size:0.8rem; color:blue;">${c.drive_link}</span>
            </div>
            <button onclick="deleteCase(${c.id})" style="background:red; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Delete</button>
        </div>
    `).join("");
}

// 3. Delete a case
async function deleteCase(id) {
    if (!confirm("Are you sure? This will remove the case from the student dropdown menu.")) return;
    
    const { error } = await supabaseClient.from('active_cases').delete().eq('id', id);
    if (!error) {
        renderAdminCaseList();
        loadCases();
    }
}

// Ensure the list renders when you click the Admin tab

// --- CORRECTED TAB LOGIC ---
// Replace the block at the very end of your script.js with this:

const originalSwitchTab = switchTab;
switchTab = function(id) {
    // Call the original UI switcher
    originalSwitchTab(id);
    
    // Trigger data loading based on the tab ID
    if (id === 'admin') {
        renderAdminCaseList();
    }
    
    if (id === 'docket') {
        loadDocket(); // This pulls the student submissions and case links
    }
};

// Add this helper function to handle the teacher's delete button on the docket
async function deleteSubmission(id) {
    if (!confirm("Are you sure you want to remove this student's filing?")) return;
    const { error } = await supabaseClient.from('court_docket').delete().eq('id', id);
    if (!error) {
        loadDocket(); // Refresh the table after deletion
    } else {
        alert("Delete failed: " + error.message);
    }
}
