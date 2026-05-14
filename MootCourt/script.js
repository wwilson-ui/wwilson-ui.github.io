// =====================================================
// SCOTUS BRIEF GENERATOR - FIXED & COMPLETE
// =====================================================

const TEACHER_EMAIL = 'wwilson@mtps.us';

let supabaseClient = null;
let currentUser = null;
let isTeacher = false;

// Global data object
let data = {
    petitioners: [''],
    respondents: [''],
    questions: [''],
    cases: [''],
    statutes: ['']
};

// ─── INITIALIZATION ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.supabase !== 'undefined') {
        const url = window.SUPABASE_URL || 'https://mvxuubwbtkhdbhuadxtu.supabase.co';
        const key = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12eHV1YndidGtoZGJodWFkeHR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExODQyMDgsImV4cCI6MjA4Njc2MDIwOH0.FzsVt0bmWnrc3pYUWfJyS-9PE9oJY1ZzoGbax3q_LGk';
        supabaseClient = window.supabase.createClient(url, key);

        supabaseClient.auth.onAuthStateChange((event, session) => {
            updateAuthUI(session);
        });

        await checkAuth();
        loadCases();
        loadDocket();
    } else {
        console.error('Supabase not loaded');
        document.getElementById('auth-status').innerText = 'Offline mode';
    }

    renderInputFields();
    refresh();
    setupDeleteHandler();
});

// ─── AUTH ───────────────────────────────────────────────────────────────────
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    updateAuthUI(session);
}

function updateAuthUI(session) {
    const authSection = document.getElementById('authSection');
    const authStatus  = document.getElementById('auth-status');
    const adminTabBtn = document.getElementById('admin-sidebar-btn');
    const adminNavBtn = document.getElementById('admin-tab');

    if (session) {
        currentUser = session.user.email;
        isTeacher   = (currentUser.toLowerCase() === TEACHER_EMAIL.toLowerCase());
        const emailPrefix = currentUser.split('@')[0];

        if (authSection) {
            authSection.innerHTML = `
                <div style="display:flex;align-items:center;gap:15px;">
                    <span style="font-weight:600;color:white;">${emailPrefix}</span>
                    <button onclick="signOut()" style="padding:6px 12px;font-size:0.8rem;background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.4);border-radius:4px;cursor:pointer;">Sign Out</button>
                </div>`;
        }
        if (authStatus) authStatus.innerText = `Signed in as ${currentUser}`;

        // Show teacher-only UI
        if (adminTabBtn) adminTabBtn.style.display = isTeacher ? 'block' : 'none';
        if (adminNavBtn) adminNavBtn.style.display  = isTeacher ? 'inline-flex' : 'none';

        loadUserProjects();

        // Re-render docket with delete buttons if teacher
        loadDocket();
    } else {
        currentUser = null;
        isTeacher   = false;

        if (authSection) {
            authSection.innerHTML = `
                <button onclick="signIn()" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:white;color:#1a237e;border:none;border-radius:4px;font-weight:600;cursor:pointer;">
                    <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg" width="18" height="18">
                    Sign in
                </button>`;
        }
        if (authStatus) authStatus.innerText = 'Not signed in';
        if (adminTabBtn) adminTabBtn.style.display = 'none';
        if (adminNavBtn) adminNavBtn.style.display  = 'none';
    }
}

window.signIn = async function () {
    await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + window.location.pathname,
            queryParams: { hd: 'mtps.us' }
        }
    });
};

window.signOut = async function () {
    await supabaseClient.auth.signOut();
    window.location.reload();
};

// ─── TAB SWITCHING ──────────────────────────────────────────────────────────
// FIX: Accept the button element explicitly so we don't rely on the ambient
// `event` variable (which is undefined when called programmatically).
window.switchTab = function (tabId, btnEl) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');

    // btnEl is passed from onclick="switchTab('x', this)"
    if (btnEl) btnEl.classList.add('active');
};

window.toggleAmicusField = function () {
    const briefType   = document.getElementById('briefType').value;
    const amicusExtras = document.getElementById('amicus-extras');
    if (amicusExtras) {
        amicusExtras.style.display = briefType === 'Amicus Curiae' ? 'block' : 'none';
    }
    refresh();
};

// ─── DYNAMIC INPUT FIELDS ───────────────────────────────────────────────────
function renderInputFields() {
    const containers = {
        petitioners: 'petitioner-inputs',
        respondents:  'respondent-inputs',
        cases:        'case-inputs',
        statutes:     'statute-inputs',
        questions:    'question-inputs'
    };

    Object.keys(containers).forEach(type => {
        const container = document.getElementById(containers[type]);
        if (!container) return;

        container.innerHTML = '';
        data[type].forEach((val, i) => {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'display:flex;gap:5px;margin-bottom:5px;';

            const input = document.createElement(type === 'questions' ? 'textarea' : 'input');
            if (type === 'questions') input.rows = 2;
            input.value = val;
            input.style.flex = '1';
            input.oninput = (e) => {
                data[type][i] = e.target.value;
                refresh();
            };

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn btn-danger delete-btn';
            deleteBtn.style.cssText = 'width:40px;height:40px;padding:0;';
            deleteBtn.textContent = '✕';
            deleteBtn.setAttribute('data-type', type);
            deleteBtn.setAttribute('data-index', i);

            wrapper.appendChild(input);
            wrapper.appendChild(deleteBtn);
            container.appendChild(wrapper);
        });
    });
}

window.addDynamic = function (type) {
    const typeMap = {
        petitioner: 'petitioners',
        respondent:  'respondents',
        case:        'cases',
        statute:     'statutes',
        question:    'questions'
    };
    const dataType = typeMap[type] || type;
    data[dataType].push('');
    renderInputFields();
    refresh();
};

function setupDeleteHandler() {
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const type  = e.target.getAttribute('data-type');
            const index = parseInt(e.target.getAttribute('data-index'));
            if (data[type]) {
                data[type].splice(index, 1);
                if (data[type].length === 0) data[type].push('');
                renderInputFields();
                refresh();
            }
        }
    });
}

// ─── PREVIEW RENDERING ──────────────────────────────────────────────────────
function refresh() {
    const target = document.getElementById('render-target');
    if (!target) return;

    const projectTitle  = document.getElementById('projectTitle')?.value  || '';
    const briefType     = document.getElementById('briefType')?.value      || 'Petitioner';
    const courtTerm     = document.getElementById('courtTerm')?.value      || 'October Term 2025';
    const docketNum     = document.getElementById('docketNum')?.value      || 'No. XX-XXXX';
    const lowerCourt    = document.getElementById('lowerCourt')?.value     || 'United States District Court';
    const firmName      = document.getElementById('firmName')?.value       || '[Law Firm Name]';
    const studentNames  = document.getElementById('studentNames')?.value   || '[Counsel Names]';
    const summaryArg    = document.getElementById('summaryArg')?.value     || '';
    const argBody       = document.getElementById('argBody')?.value        || '';
    const conclusionText= document.getElementById('conclusionText')?.value || '';

    const petitionersList = data.petitioners.filter(p => p.trim()).join(', ') || '[Petitioner Name]';
    const respondentsList = data.respondents.filter(r => r.trim()).join(', ') || '[Respondent Name]';

    let briefTitle = '';
    if (briefType === 'Amicus Curiae') {
        const amicusName    = document.getElementById('amicusName')?.value    || '[Amicus Name]';
        const amicusSupport = document.getElementById('amicusSupport')?.value || 'Petitioner';
        briefTitle = `Brief for ${amicusName}<br>as Amicus Curiae in Support of ${amicusSupport}`;
    } else {
        briefTitle = `Brief for ${briefType}`;
    }

    // ── PAGE 1: Cover ──────────────────────────────────────────────────────
    let html = `
    <div class="paper">
        <div class="court-header">
            In the Supreme Court of the United States
        </div>
        <div style="text-align:center;margin:20px 0;font-size:11pt;">${courtTerm}</div>
        <div style="text-align:center;font-weight:bold;font-size:11pt;margin-bottom:10px;">${docketNum}</div>
        <hr>
        <div class="title-box">
            ${petitionersList},<br>
            <span style="font-style:italic;">Petitioner${data.petitioners.filter(p=>p.trim()).length>1?'s':''},</span><br>
            v.<br>
            ${respondentsList},<br>
            <span style="font-style:italic;">Respondent${data.respondents.filter(r=>r.trim()).length>1?'s':''}.</span>
        </div>
        <div style="text-align:center;margin:15px 0;">
            <em>On Writ of Certiorari to the<br>${lowerCourt}</em>
        </div>
        <hr>
        <div style="text-align:center;font-weight:bold;margin:25px 0;font-size:14pt;text-transform:uppercase;letter-spacing:0.04em;">
            ${briefTitle}
        </div>
        <div style="margin-top:60px;font-size:11pt;">
            <strong>${firmName}</strong><br>
            <em>Counsel of Record</em><br><br>
            ${studentNames.split('\n').join('<br>')}
        </div>
    </div>`;

    // ── PAGE 2: Questions Presented ────────────────────────────────────────
    const questions = data.questions.filter(q => q.trim());
    if (questions.length > 0) {
        html += `
    <div class="paper">
        <div class="section-header">Question${questions.length > 1 ? 's' : ''} Presented</div>
        ${questions.map((q, i) => `<p style="margin:15px 0;">${questions.length > 1 ? `${i + 1}.&nbsp;` : ''}${q}</p>`).join('')}
    </div>`;
    }

    // ── PAGE 3: Parties & Table of Authorities ─────────────────────────────
    html += `
    <div class="paper">
        <div class="section-header">Parties to the Proceeding</div>
        <p><strong>Petitioner${data.petitioners.filter(p=>p.trim()).length>1?'s':''}:</strong> ${petitionersList}</p>
        <p><strong>Respondent${data.respondents.filter(r=>r.trim()).length>1?'s':''}:</strong> ${respondentsList}</p>

        <div class="section-header" style="margin-top:30px;">Table of Authorities</div>
        <p style="font-weight:bold;margin-top:15px;border-bottom:1pt solid black;padding-bottom:4px;">Cases</p>`;

    const casesArr = data.cases.filter(c => c.trim());
    if (casesArr.length > 0) {
        casesArr.forEach(c => {
            html += `<p style="margin:6px 0 6px 20px;text-indent:-20px;"><em>${c}</em></p>`;
        });
    } else {
        html += `<p style="margin-left:20px;color:#666;font-style:italic;">[No cases cited]</p>`;
    }

    html += `<p style="font-weight:bold;margin-top:20px;border-bottom:1pt solid black;padding-bottom:4px;">Statutes &amp; Other Authorities</p>`;
    const statutesArr = data.statutes.filter(s => s.trim());
    if (statutesArr.length > 0) {
        statutesArr.forEach(s => {
            html += `<p style="margin:6px 0 6px 20px;text-indent:-20px;">${s}</p>`;
        });
    } else {
        html += `<p style="margin-left:20px;color:#666;font-style:italic;">[No statutes cited]</p>`;
    }

    html += `</div>`;

    // ── PAGE 4: Summary of Argument ────────────────────────────────────────
    if (summaryArg.trim()) {
        html += `
    <div class="paper">
        <div class="section-header">Summary of Argument</div>
        <p>${summaryArg.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>
    </div>`;
    }

    // ── PAGE 5+: Argument ──────────────────────────────────────────────────
    if (argBody.trim()) {
        html += `
    <div class="paper">
        <div class="section-header">Argument</div>
        <p>${argBody.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>
    </div>`;
    }

    // ── Final Page: Conclusion & Signature ─────────────────────────────────
    if (conclusionText.trim()) {
        html += `
    <div class="paper">
        <div class="section-header">Conclusion</div>
        <p>${conclusionText.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>
        <div style="margin-top:50px;">
            <p>Respectfully submitted,</p>
            <div style="margin-top:50px;border-top:1pt solid black;width:3in;padding-top:6px;">
                <strong>${firmName}</strong><br>
                <em>Counsel of Record</em><br><br>
                ${studentNames.split('\n').join('<br>')}
            </div>
        </div>
    </div>`;
    }

    target.innerHTML = html;
    updateCaseBriefLink();
}

window.refresh = refresh;

function updateCaseBriefLink() {
    const caseSelect = document.getElementById('assignedCase');
    const linkArea   = document.getElementById('caseBriefLinkArea');
    if (!caseSelect || !linkArea) return;

    const selectedOption = caseSelect.options[caseSelect.selectedIndex];
    const link = selectedOption?.getAttribute('data-link');
    linkArea.innerHTML = link
        ? `<a href="${link}" target="_blank" style="color:#1a237e;">📄 View Case Brief</a>`
        : '';
}

// ─── CLOUD SAVE / LOAD / DELETE ─────────────────────────────────────────────
async function loadUserProjects() {
    if (!currentUser || !supabaseClient) return;

    const { data: { user } } = await supabaseClient.auth.getUser();
    const { data: projects } = await supabaseClient
        .from('scotus_projects')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

    const select = document.getElementById('cloud-projects');
    if (select) {
        select.innerHTML = '<option value="">📂 Select a Project...</option>';
        (projects || []).forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.title;
            select.appendChild(option);
        });
    }
}

window.saveToCloud = async function () {
    if (!currentUser) { alert('Please sign in to save projects'); return; }

    const title = document.getElementById('projectTitle').value.trim() || 'Untitled Project';
    const { data: { user } } = await supabaseClient.auth.getUser();

    // Collect the full state snapshot
    const snapshot = {
        projectTitle:  document.getElementById('projectTitle').value,
        briefType:     document.getElementById('briefType').value,
        amicusName:    document.getElementById('amicusName')?.value   || '',
        amicusSupport: document.getElementById('amicusSupport')?.value || '',
        courtTerm:     document.getElementById('courtTerm').value,
        firmName:      document.getElementById('firmName').value,
        studentNames:  document.getElementById('studentNames').value,
        assignedCase:  document.getElementById('assignedCase')?.value  || '',
        docketNum:     document.getElementById('docketNum').value,
        lowerCourt:    document.getElementById('lowerCourt').value,
        petitioners:   data.petitioners,
        respondents:   data.respondents,
        cases:         data.cases,
        statutes:      data.statutes,
        questions:     data.questions,
        summaryArg:    document.getElementById('summaryArg').value,
        argBody:       document.getElementById('argBody').value,
        conclusionText:document.getElementById('conclusionText').value
    };

    // FIX: Use upsert with a stable conflict key.
    // We match on user_id + title. If the DB constraint doesn't exist this
    // falls back to a plain insert — either way it works.
    const { error } = await supabaseClient
        .from('scotus_projects')
        .upsert(
            { user_id: user.id, title, data: snapshot, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,title', ignoreDuplicates: false }
        );

    if (error) {
        alert('Error saving: ' + error.message);
    } else {
        alert('✅ Project saved!');
        loadUserProjects();
    }
};

window.loadSelectedProject = async function () {
    const projectId = document.getElementById('cloud-projects').value;
    if (!projectId) { alert('Please select a project first'); return; }

    const { data: project, error } = await supabaseClient
        .from('scotus_projects')
        .select('*')
        .eq('id', projectId)
        .single();

    if (error || !project || !project.data) {
        alert('Could not load project.');
        return;
    }

    const d = project.data;

    document.getElementById('projectTitle').value  = d.projectTitle  || '';
    document.getElementById('briefType').value     = d.briefType     || 'Petitioner';
    if (document.getElementById('amicusName'))    document.getElementById('amicusName').value    = d.amicusName    || '';
    if (document.getElementById('amicusSupport')) document.getElementById('amicusSupport').value = d.amicusSupport || 'Petitioner';
    document.getElementById('courtTerm').value     = d.courtTerm     || '';
    document.getElementById('firmName').value      = d.firmName      || '';
    document.getElementById('studentNames').value  = d.studentNames  || '';
    document.getElementById('docketNum').value     = d.docketNum     || '';
    document.getElementById('lowerCourt').value    = d.lowerCourt    || '';
    document.getElementById('summaryArg').value    = d.summaryArg    || '';
    document.getElementById('argBody').value       = d.argBody       || '';
    document.getElementById('conclusionText').value= d.conclusionText|| '';

    // FIX: Restore assignedCase after the options have been populated
    if (d.assignedCase && document.getElementById('assignedCase')) {
        // Try to set immediately; if options aren't loaded yet, set after a tick
        const sel = document.getElementById('assignedCase');
        sel.value = d.assignedCase;
        if (sel.value !== d.assignedCase) {
            // Options not yet populated — store and restore after loadCases
            sel.setAttribute('data-pending', d.assignedCase);
        }
    }

    data.petitioners = d.petitioners || [''];
    data.respondents  = d.respondents  || [''];
    data.cases        = d.cases        || [''];
    data.statutes     = d.statutes     || [''];
    data.questions    = d.questions    || [''];

    toggleAmicusField();
    renderInputFields();
    refresh();
    alert('✅ Project loaded!');
};

window.deleteSelectedProject = async function () {
    const projectId = document.getElementById('cloud-projects').value;
    if (!projectId) { alert('Please select a project first'); return; }
    if (!confirm('Delete this project permanently?')) return;

    const { error } = await supabaseClient
        .from('scotus_projects')
        .delete()
        .eq('id', projectId);

    if (error) {
        alert('Error deleting: ' + error.message);
    } else {
        document.getElementById('cloud-projects').value = '';
        alert('✅ Project deleted');
        loadUserProjects();
    }
};

// ─── CASES ──────────────────────────────────────────────────────────────────
async function loadCases() {
    if (!supabaseClient) return;

    const { data: cases } = await supabaseClient
        .from('scotus_cases')
        .select('*')
        .order('name');

    const select = document.getElementById('assignedCase');
    if (select) {
        select.innerHTML = '<option value="">-- Select a Case --</option>';
        (cases || []).forEach(c => {
            const option = document.createElement('option');
            option.value = c.name;
            option.setAttribute('data-link', c.brief_link || '');
            option.textContent = c.name;
            select.appendChild(option);
        });

        // Restore any pending case selection from loadSelectedProject
        const pending = select.getAttribute('data-pending');
        if (pending) {
            select.value = pending;
            select.removeAttribute('data-pending');
            updateCaseBriefLink();
        }
    }

    if (isTeacher) updateAdminCasesList(cases);
}

function updateAdminCasesList(cases) {
    const container = document.getElementById('manage-cases-list');
    if (!container) return;

    if (!cases || cases.length === 0) {
        container.innerHTML = '<p style="color:#999;">No cases yet. Add one above!</p>';
        return;
    }

    container.innerHTML = '';
    cases.forEach(c => {
        const div = document.createElement('div');
        div.style.cssText = 'padding:10px;margin-bottom:10px;background:#f8f9fa;border-radius:4px;display:flex;justify-content:space-between;align-items:center;';
        div.innerHTML = `
            <div>
                <strong>${c.name}</strong>
                ${c.brief_link ? `<br><a href="${c.brief_link}" target="_blank" style="font-size:0.85em;color:#1a237e;">View Brief</a>` : ''}
            </div>
            <button class="action-btn btn-danger" style="width:auto;padding:8px 15px;height:auto;" onclick="deleteCase('${c.id}')">Delete</button>`;
        container.appendChild(div);
    });
}

window.addNewCase = async function () {
    if (!isTeacher) { alert('Only teachers can add cases'); return; }

    const name = document.getElementById('newCaseName').value.trim();
    const link = document.getElementById('newCaseLink').value.trim();
    if (!name) { alert('Please enter a case name'); return; }

    const { error } = await supabaseClient
        .from('scotus_cases')
        .insert([{ name, brief_link: link }]);

    if (error) {
        alert('Error adding case: ' + error.message);
    } else {
        document.getElementById('newCaseName').value = '';
        document.getElementById('newCaseLink').value = '';
        alert('✅ Case added!');
        loadCases();
    }
};

window.deleteCase = async function (caseId) {
    if (!isTeacher) return;
    if (!confirm('Delete this case from the list?')) return;

    const { error } = await supabaseClient
        .from('scotus_cases')
        .delete()
        .eq('id', caseId);

    if (error) {
        alert('Error: ' + error.message);
    } else {
        loadCases();
    }
};

// ─── DOCKET ──────────────────────────────────────────────────────────────────
async function loadDocket() {
    if (!supabaseClient) return;

    const { data: briefs } = await supabaseClient
        .from('scotus_submissions')
        .select('*, profiles(email)')
        .order('submitted_at', { ascending: false });

    const tbody = document.getElementById('docket-body');
    if (!tbody) return;

    if (!briefs || briefs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;">No briefs submitted yet</td></tr>';
        return;
    }

    // Group by case name
    const grouped = {};
    briefs.forEach(b => {
        const caseName = b.case_name || 'Unknown Case';
        if (!grouped[caseName]) {
            grouped[caseName] = { petitioner: [], respondent: [], amicus: [], brief_link: null, submissions: [] };
        }
        if (!grouped[caseName].brief_link && b.case_brief_link) {
            grouped[caseName].brief_link = b.case_brief_link;
        }

        const authorEmail = b.profiles?.email || 'Anonymous';
        const linkHtml = b.pdf_url
            ? `<a href="${b.pdf_url}" target="_blank" style="color:#1a237e;">${authorEmail.split('@')[0]}</a>`
            : authorEmail.split('@')[0];

        // FIX: Store each submission id so teacher can delete it
        const item = { html: linkHtml, id: b.id };

        if (b.brief_type === 'Petitioner')     grouped[caseName].petitioner.push(item);
        else if (b.brief_type === 'Respondent') grouped[caseName].respondent.push(item);
        else if (b.brief_type === 'Amicus Curiae') grouped[caseName].amicus.push(item);
    });

    tbody.innerHTML = '';
    Object.keys(grouped).forEach(caseName => {
        const g = grouped[caseName];
        const row = tbody.insertRow();

        // Helper to render a cell with optional teacher delete buttons
        const renderCell = (items) => {
            if (!items.length) return '-';
            return items.map(item => {
                const del = isTeacher
                    ? `&nbsp;<button onclick="deleteDocketEntry('${item.id}')" style="font-size:0.7rem;background:#c62828;color:white;border:none;border-radius:3px;padding:1px 5px;cursor:pointer;">✕</button>`
                    : '';
                return `<div style="margin-bottom:3px;">${item.html}${del}</div>`;
            }).join('');
        };

        row.innerHTML = `
            <td><strong>${caseName}</strong></td>
            <td>${g.brief_link ? `<a href="${g.brief_link}" target="_blank" style="color:#1a237e;">View Brief</a>` : '-'}</td>
            <td>${renderCell(g.petitioner)}</td>
            <td>${renderCell(g.respondent)}</td>
            <td>${renderCell(g.amicus)}</td>
            ${isTeacher ? `<td><button class="action-btn btn-danger" style="width:auto;padding:5px 10px;height:auto;font-size:0.75rem;" onclick="deleteDocketCase('${caseName}')">Delete Case</button></td>` : '<td></td>'}`;
    });

    // Ensure header has the right number of columns
    const headerRow = document.getElementById('docket-header-row');
    if (headerRow) {
        const adminTh = document.getElementById('docket-admin-th');
        if (adminTh) adminTh.style.display = isTeacher ? '' : 'none';
    }
}

// Teacher: delete a single brief from the docket
window.deleteDocketEntry = async function (submissionId) {
    if (!isTeacher) return;
    if (!confirm('Remove this brief from the docket?')) return;

    const { error } = await supabaseClient
        .from('scotus_submissions')
        .delete()
        .eq('id', submissionId);

    if (error) alert('Error: ' + error.message);
    else loadDocket();
};

// Teacher: delete all submissions for a case from the docket
window.deleteDocketCase = async function (caseName) {
    if (!isTeacher) return;
    if (!confirm(`Remove ALL briefs for "${caseName}" from the docket? This cannot be undone.`)) return;

    const { error } = await supabaseClient
        .from('scotus_submissions')
        .delete()
        .eq('case_name', caseName);

    if (error) alert('Error: ' + error.message);
    else loadDocket();
};

// ─── PDF & PRINT ─────────────────────────────────────────────────────────────
window.downloadPDF = async function () {
    const element = document.getElementById('render-target');

    // FIX: min-height:11in makes html2pdf treat every .paper as a full page,
    // then the forced page-break adds another blank page after it.
    // Collapse to height:auto for the snapshot, restore afterward.
    element.classList.add('pdf-export');

    const opt = {
        margin:      [1, 1, 1, 1],   // 1-inch margins handled by jsPDF, not padding
        filename:    (document.getElementById('projectTitle').value || 'scotus-brief') + '.pdf',
        image:       { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF:       { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak:   { mode: 'avoid-all', before: '.paper' }
    };

    try {
        await html2pdf().from(element).set(opt).save();
    } catch (err) {
        alert('PDF generation error: ' + err.message);
    } finally {
        element.classList.remove('pdf-export');
    }
};

// ─── SUBMIT TO COURT ─────────────────────────────────────────────────────────
window.submitToCourt = async function () {
    if (!currentUser) { alert('Please sign in to submit'); return; }

    const caseSelect = document.getElementById('assignedCase');
    const caseName   = caseSelect?.value;
    if (!caseName)   { alert('Please select a case first'); return; }

    const selectedOption = caseSelect.options[caseSelect.selectedIndex];
    const caseBriefLink  = selectedOption.getAttribute('data-link');

    if (!confirm('Submit this brief to the Court Docket? This will generate a PDF and post it publicly.')) return;

    const element = document.getElementById('render-target');
    element.classList.add('pdf-export');

    const opt = {
        margin:      [1, 1, 1, 1],
        filename:    'brief.pdf',
        image:       { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF:       { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak:   { mode: 'avoid-all', before: '.paper' }
    };

    try {
        const pdfBlob = await html2pdf().from(element).set(opt).outputPdf('blob');
        element.classList.remove('pdf-export');
        const { data: { user } } = await supabaseClient.auth.getUser();

        // FIX: Supabase storage RLS requires the file path to begin with the
        // authenticated user's ID so the policy `(auth.uid() = owner)` or
        // the default `auth.uid()::text = (storage.foldername(name))[1]`
        // resolves correctly. Using `{uid}/{timestamp}.pdf` satisfies both
        // the common custom policy and the Supabase default template.
        const fileName = `${user.id}/${Date.now()}.pdf`;

        const { error: uploadError } = await supabaseClient.storage
            .from('scotus-briefs')
            .upload(fileName, pdfBlob, { contentType: 'application/pdf' });

        if (uploadError) { alert('Upload error: ' + uploadError.message); return; }

        const { data: { publicUrl } } = supabaseClient.storage
            .from('scotus-briefs')
            .getPublicUrl(fileName);

        const { error } = await supabaseClient
            .from('scotus_submissions')
            .insert([{
                user_id:         user.id,
                case_name:       caseName,
                case_brief_link: caseBriefLink,
                brief_type:      document.getElementById('briefType').value,
                pdf_url:         publicUrl
            }]);

        if (error) {
            alert('Error submitting: ' + error.message);
        } else {
            alert('✅ Brief submitted to Court Docket!');
            loadDocket();
        }
    } catch (err) {
        alert('Submission error: ' + err.message);
    } finally {
        element.classList.remove('pdf-export');
    }
};
