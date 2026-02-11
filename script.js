const SUPABASE_URL  = 'https://dfmugytablgldpkadfrl.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_AoeVLd5TSJMGyhAyDmXTng_5C-_C8nC';
const TEACHER_EMAIL = 'wwilson@mtps.us';
const LOGIN_KEY     = 'scotus_user'; // localStorage key for persistent login

let supabaseClient = null;
let currentUser    = null;

let data = {
    petitioners: [''],
    respondents:  [''],
    questions:    [''],
    cases:        [''],
    statutes:     ['']
};

// ─── SUPABASE INIT ──────────────────────────────────────────────────────────
function initSupabase() {
    if (window.supabase && !supabaseClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        // Public data - no login required
        loadCases();
        loadDocket();
    }
}

// ─── BOOT ───────────────────────────────────────────────────────────────────
window.onload = () => {
    initSupabase();
    renderInputFields();
    refresh();

    // FIX 1: Restore login from localStorage on every page load/refresh
    const savedEmail = localStorage.getItem(LOGIN_KEY);
    if (savedEmail) {
        restoreSession(savedEmail);
    } else {
        document.getElementById('auth-status').innerText = 'Not signed in';
    }
};

// ─── PERSISTENT LOGIN ────────────────────────────────────────────────────────
function restoreSession(email) {
    currentUser = email;
    applyLoggedInUI(email);
    if (!supabaseClient) initSupabase();
    if (supabaseClient) {
        loadCases();
        fetchProjectList();
        loadDocket();
    }
}

function applyLoggedInUI(email) {
    const status = document.getElementById('auth-status');
    status.innerHTML =
        '<span style="display:block;margin-bottom:6px;font-weight:600;color:#1a237e;">' +
            '&#10003; ' + email +
        '</span>' +
        '<button onclick="signOut()" style="width:100%;padding:5px 8px;font-size:0.75rem;' +
            'border:1px solid #ccc;border-radius:4px;cursor:pointer;background:#f5f5f5;color:#555;">' +
            'Sign Out' +
        '</button>';

    // Hide Google button once signed in
    const wrapper = document.getElementById('google-btn-wrapper');
    if (wrapper) wrapper.style.display = 'none';

    // Show admin tab for teacher
    if (email === TEACHER_EMAIL) {
        const adminBtn = document.getElementById('admin-tab-btn');
        if (adminBtn) adminBtn.style.display = 'block';
    }
}

function signOut() {
    localStorage.removeItem(LOGIN_KEY);
    currentUser = null;

    // Restore auth-status text and Google button
    document.getElementById('auth-status').innerText = 'Not signed in';
    const wrapper = document.getElementById('google-btn-wrapper');
    if (wrapper) wrapper.style.display = 'block';

    // Hide admin tab
    const adminBtn = document.getElementById('admin-tab-btn');
    if (adminBtn) adminBtn.style.display = 'none';

    // Clear project dropdown
    const drop = document.getElementById('cloud-projects');
    if (drop) drop.innerHTML = '<option value="">Select a Project...</option>';
}

// ─── GOOGLE SIGN-IN CALLBACK ─────────────────────────────────────────────────
async function onSignIn(response) {
    const user = JSON.parse(atob(response.credential.split('.')[1]));
    currentUser = user.email;

    // Persist across refresh
    localStorage.setItem(LOGIN_KEY, currentUser);
    applyLoggedInUI(currentUser);

    if (!supabaseClient) initSupabase();
    if (supabaseClient) {
        loadCases();
        fetchProjectList();
        loadDocket();
    }
}

// ─── TAB SWITCHING ───────────────────────────────────────────────────────────
// skipReload=true prevents a duplicate fetch when the caller already loaded data
function switchTab(id, skipReload) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    const targetTab = document.getElementById(id);
    if (targetTab) targetTab.classList.add('active');

    if (typeof event !== 'undefined' && event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    if (!skipReload) {
        if (id === 'admin'  && supabaseClient) renderAdminCaseList();
        if (id === 'docket' && supabaseClient) loadDocket();
    }
}

// ─── AMICUS TOGGLE ───────────────────────────────────────────────────────────
function toggleAmicusField() {
    const type = document.getElementById('briefType').value;
    document.getElementById('amicus-extras').style.display =
        (type === 'Amicus Curiae') ? 'block' : 'none';
}

// ─── LIVE PREVIEW ────────────────────────────────────────────────────────────
function refresh() {
    const v    = id => document.getElementById(id)?.value || '';
    let pNum   = 1;
    const pg   = html =>
        '<div class="paper">' + html +
        '<div class="manual-footer">' + (pNum++) + '</div></div>';

    let docket = v('docketNum').trim();
    if (docket && !docket.toUpperCase().startsWith('CASE NO.:'))
        docket = 'Case No.: ' + docket;

    let briefTypeTitle = 'BRIEF FOR THE ' + v('briefType').toUpperCase();
    if (v('briefType') === 'Amicus Curiae') {
        briefTypeTitle =
            'BRIEF OF ' + (v('amicusName').toUpperCase() || '[AMICUS NAME]') +
            ' AS AMICUS CURIAE ' + v('amicusSupport').toUpperCase();
    }

    const coverHtml =
        '<div style="font-weight:bold;">' + (docket.toUpperCase() || 'CASE NO. 00-000') + '</div>' +
        '<div class="court-header" style="margin-top:0.5in;">In the<br>Supreme Court of the United States</div>' +
        '<div style="text-align:center;font-weight:bold;">' + (v('courtTerm').toUpperCase() || 'OCTOBER TERM 202X') + '</div>' +
        '<hr style="border:none;border-top:1.5pt solid black;margin:20px 0;">' +
        '<div style="display:flex;margin:20px 0;">' +
            '<div style="flex:1;padding-right:15px;">' +
                data.petitioners.map(p => (p.toUpperCase() || 'PETITIONER')).join(',<br>') +
                ',<br><i>Petitioner</i>,' +
                '<div style="margin:10px 40px;">v.</div>' +
                data.respondents.map(r => (r.toUpperCase() || 'RESPONDENT')).join(',<br>') +
                ',<br><i>Respondent</i>.' +
            '</div>' +
            '<div style="border-left:1.5pt solid black;padding-left:20px;width:45%;font-style:italic;">' +
                'On Writ of Certiorari to the ' + (v('lowerCourt') || 'the Lower Court') +
            '</div>' +
        '</div>' +
        '<div class="title-box">' + briefTypeTitle + '</div>' +
        '<div style="text-align:center;margin-top:0.8in;">' +
            '<b>Respectfully Submitted,</b><br><br>' +
            '<span style="font-variant:small-caps;font-weight:bold;">' + (v('firmName') || 'FIRM NAME') + '</span><br>' +
            '<div style="font-size:11pt;margin-top:10px;">' +
                v('studentNames').replace(/\n/g, '<br>') +
            '</div>' +
        '</div>';

    const questionsHtml =
        '<div class="section-header">QUESTIONS PRESENTED</div>' +
        data.questions.map((q, i) => '<p><b>' + (i + 1) + '.</b> ' + (q || '...') + '</p>').join('');

    const authoritiesHtml =
        '<div class="section-header">TABLE OF AUTHORITIES</div>' +
        '<p><b>Cases:</b></p>' +
        (data.cases.filter(x => x.trim()).sort().map(c => '<div><i>' + c + '</i></div>').join('') || '...') +
        '<p style="margin-top:10px;"><b>Statutes:</b></p>' +
        (data.statutes.filter(x => x.trim()).sort().map(s => '<div>' + s + '</div>').join('') || '...');

    const argumentHtml =
        '<div class="section-header">SUMMARY OF ARGUMENT</div>' +
        '<p>' + v('summaryArg') + '</p>' +
        '<div class="section-header">ARGUMENT</div>' +
        '<p style="white-space:pre-wrap;">' + v('argBody') + '</p>';

    const conclusionHtml =
        '<div class="section-header">CONCLUSION</div><p>' + v('conclusionText') + '</p>';

    const target = document.getElementById('render-target');
    if (target) {
        target.innerHTML =
            pg(coverHtml) + pg(questionsHtml) + pg(authoritiesHtml) +
            pg(argumentHtml) + pg(conclusionHtml);
    }
}

// ─── DYNAMIC INPUTS ──────────────────────────────────────────────────────────
function addDynamic(type) { data[type + 's'].push(''); renderInputFields(); refresh(); }
function removeDynamic(type, idx) {
    if (data[type + 's'].length > 1) data[type + 's'].splice(idx, 1);
    else data[type + 's'][0] = '';
    renderInputFields(); refresh();
}
function renderInputFields() {
    ['petitioner', 'respondent', 'question', 'case', 'statute'].forEach(t => {
        const container = document.getElementById(t + '-inputs');
        if (!container) return;
        container.innerHTML = data[t + 's'].map((val, i) =>
            '<div style="display:flex;gap:5px;margin-bottom:5px;">' +
                '<input type="text" value="' + val.replace(/"/g, '&quot;') + '" ' +
                    'oninput="data[\'' + t + 's\'][' + i + ']=this.value;refresh()">' +
                '<button onclick="removeDynamic(\'' + t + '\',' + i + ')" ' +
                    'style="border:none;background:none;cursor:pointer;">&#10060;</button>' +
            '</div>'
        ).join('');
    });
}

// ─── CLOUD SAVE / LOAD / DELETE ──────────────────────────────────────────────
async function saveToCloud() {
    if (!currentUser || !supabaseClient) return alert('Please sign in first.');
    const title = document.getElementById('assignedCase')?.value ||
                  document.getElementById('projectTitle')?.value || 'Untitled';
    const inputs = {};
    document.querySelectorAll('input,textarea,select').forEach(el => {
        if (el.id) inputs[el.id] = el.value;
    });
    const { error } = await supabaseClient.from('briefs').upsert(
        { user_id: currentUser, project_title: title, content_data: data,
          input_fields: inputs, updated_at: new Date() },
        { onConflict: 'user_id, project_title' }
    );
    if (error) alert(error.message);
    else { alert('Saved!'); fetchProjectList(); }
}

async function fetchProjectList() {
    if (!currentUser || !supabaseClient) return;
    const { data: projects } = await supabaseClient
        .from('briefs').select('project_title')
        .eq('user_id', currentUser)
        .order('updated_at', { ascending: false });
    const drop = document.getElementById('cloud-projects');
    drop.innerHTML = '<option value="">Select a Project...</option>';
    if (projects) projects.forEach(p => {
        const o = document.createElement('option');
        o.value = p.project_title; o.textContent = p.project_title;
        drop.appendChild(o);
    });
}

async function loadSelectedProject() {
    const title = document.getElementById('cloud-projects').value;
    if (!title) return alert('Select a project first.');
    const { data: p } = await supabaseClient.from('briefs').select('*')
        .eq('user_id', currentUser).eq('project_title', title).single();
    if (p) {
        data = p.content_data;
        for (const id in p.input_fields) {
            if (document.getElementById(id)) document.getElementById(id).value = p.input_fields[id];
        }
        toggleAmicusField(); renderInputFields(); refresh(); alert('Loaded: ' + title);
    }
}

async function deleteSelectedProject() {
    const title = document.getElementById('cloud-projects').value;
    if (!title || !confirm('Delete "' + title + '"?')) return;
    const { error } = await supabaseClient.from('briefs').delete()
        .eq('user_id', currentUser).eq('project_title', title);
    if (!error) { alert('Deleted.'); fetchProjectList(); }
}

// ─── PDF DOWNLOAD (FIX 2 — no blank pages) ───────────────────────────────────
// We clone the render target and strip all height constraints before passing to
// html2pdf. This prevents the 11in min-height from creating empty continuation
// pages. Each .paper becomes exactly as tall as its content.
function downloadPDF() {
    const source = document.getElementById('render-target');
    const title  = document.getElementById('assignedCase')?.value ||
                   document.getElementById('projectTitle')?.value || 'Brief';

    // Deep-clone so the live preview is untouched
    const clone = source.cloneNode(true);
    clone.querySelectorAll('.paper').forEach((p, i) => {
        p.style.height        = 'auto';
        p.style.minHeight     = '0';
        p.style.boxShadow     = 'none';
        p.style.marginBottom  = '0';
        // page break before every page except the first
        p.style.pageBreakBefore = (i === 0) ? 'auto' : 'always';
        p.style.pageBreakAfter  = 'auto';
        p.style.breakBefore     = (i === 0) ? 'auto' : 'page';
    });

    // Move the footer INSIDE the content flow (not absolute) so it doesn't
    // add phantom height below the last line of content
    clone.querySelectorAll('.manual-footer').forEach(f => {
        f.style.position   = 'static';
        f.style.marginTop  = '30px';
        f.style.textAlign  = 'center';
    });

    html2pdf().from(clone).set({
        margin:      0,
        filename:    title + '.pdf',
        image:       { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0, windowWidth: 816 },
        jsPDF:       { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak:   { mode: 'legacy' }
    }).save();
}

// ─── CASE DROPDOWN ───────────────────────────────────────────────────────────
async function loadCases() {
    const select = document.getElementById('assignedCase');
    if (!select || !supabaseClient) return;
    const { data: cases, error } = await supabaseClient
        .from('active_cases').select('*').order('case_name');
    if (error) {
        console.error('loadCases error:', error);
        select.innerHTML = '<option value="">-- Error loading cases --</option>';
        return;
    }
    select.innerHTML =
        '<option value="">-- Select your assigned Case --</option>' +
        cases.map(c => '<option value="' + c.case_name + '">' + c.case_name + '</option>').join('');

    select.onchange = function () {
        const chosen = cases.find(c => c.case_name === this.value);
        const area   = document.getElementById('caseBriefLinkArea');
        if (area) {
            area.innerHTML = (chosen && chosen.drive_link)
                ? '<a href="' + chosen.drive_link + '" target="_blank">&#128206; View Case Brief</a>'
                : '';
        }
        refresh();
    };
}

// ─── SUBMIT TO COURT ─────────────────────────────────────────────────────────
async function submitToCourt() {
    if (!currentUser || !supabaseClient) return alert('Please sign in before submitting.');

    const caseName    = document.getElementById('assignedCase')?.value;
    const briefType   = document.getElementById('briefType')?.value;
    const studentName = document.getElementById('studentNames')?.value?.trim() || currentUser;

    if (!caseName)  return alert('Please select your assigned case on the Cover Page tab before submitting.');
    if (!briefType) return alert('Please select a brief type.');

    const btn = document.querySelector('button[onclick="submitToCourt()"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating PDF…'; }

    try {
        const element = document.getElementById('render-target');

        console.log('Step 1: Generating PDF blob…');
        const pdfBlob = await html2pdf().from(element).set({
            margin: 0,
            html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0, windowWidth: 816 },
            jsPDF:       { unit: 'in', format: 'letter', orientation: 'portrait' },
            pagebreak:   { mode: 'legacy' }
        }).output('blob');
        console.log('Step 1 done. Size:', pdfBlob.size);

        const fileName = (caseName + '_' + briefType + '_' + currentUser + '_' + Date.now() + '.pdf')
            .replace(/[^a-zA-Z0-9._-]/g, '_');

        console.log('Step 2: Uploading…', fileName);
        const { error: upErr } = await supabaseClient.storage
            .from('court-briefs').upload(fileName, pdfBlob,
                { contentType: 'application/pdf', upsert: false });
        if (upErr) throw upErr;
        console.log('Step 2 done.');

        const { data: urlData } = supabaseClient.storage
            .from('court-briefs').getPublicUrl(fileName);
        const publicUrl = urlData?.publicUrl;
        if (!publicUrl) throw new Error('Could not get public URL.');
        console.log('Step 3: URL =', publicUrl);

        console.log('Step 4: Inserting into court_docket…');
        const { error: insErr } = await supabaseClient.from('court_docket').insert([{
            case_name: caseName, brief_type: briefType,
            student_name: studentName, pdf_url: publicUrl
        }]);
        if (insErr) throw insErr;
        console.log('Step 4 done.');

        console.log('Step 5: Reloading docket…');
        await loadDocket();
        console.log('Step 5 done.');

        switchTab('docket', true);
        alert('✅ Your brief has been filed to the Public Docket!');

    } catch (err) {
        console.error('submitToCourt failed:', err);
        alert('Error: ' + (err.message || JSON.stringify(err)));
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '⚖️ SUBMIT TO COURT'; }
    }
}

// ─── DOCKET TABLE ─────────────────────────────────────────────────────────────
async function loadDocket() {
    if (!supabaseClient) return;
    const { data: filings, error: fErr } = await supabaseClient.from('court_docket').select('*');
    const { data: cases,   error: cErr } = await supabaseClient.from('active_cases').select('*');
    if (fErr) console.error('loadDocket filings error:', fErr);
    if (cErr) console.error('loadDocket cases error:',   cErr);

    const body = document.getElementById('docket-body');
    if (!body) return;
    body.innerHTML = '';

    const allCases   = cases   || [];
    const allFilings = filings || [];

    if (allCases.length === 0) {
        body.innerHTML =
            '<tr><td colspan="5" style="text-align:center;color:#888;">No cases added yet.</td></tr>';
        return;
    }

    allCases.forEach(c => {
        const cf  = allFilings.filter(f => f.case_name === c.case_name);
        const row = document.createElement('tr');
        row.innerHTML =
            '<td><strong>' + c.case_name + '</strong></td>' +
            '<td>' + (c.drive_link
                ? '<a href="' + c.drive_link + '" target="_blank">&#128279; Briefing</a>'
                : '&mdash;') + '</td>' +
            '<td>' + getLinksByType(cf, 'Petitioner')    + '</td>' +
            '<td>' + getLinksByType(cf, 'Respondent')    + '</td>' +
            '<td>' + getLinksByType(cf, 'Amicus Curiae') + '</td>';
        body.appendChild(row);
    });
}

function getLinksByType(files, type) {
    const matches = files.filter(f => f.brief_type === type && f.pdf_url);
    if (matches.length === 0) return '<span style="color:#bbb;">&mdash;</span>';
    return matches.map(f =>
        '<div class="docket-link-wrapper">' +
            '<a href="' + f.pdf_url + '" target="_blank">&#128196; ' + f.student_name + '</a>' +
            (currentUser === TEACHER_EMAIL
                ? ' <span onclick="deleteSubmission(' + f.id + ')" ' +
                  'style="color:red;cursor:pointer;">[x]</span>'
                : '') +
        '</div>'
    ).join('');
}

async function deleteSubmission(id) {
    if (!confirm("Remove this student's filing?")) return;
    const { error } = await supabaseClient.from('court_docket').delete().eq('id', id);
    if (!error) loadDocket();
    else alert('Delete failed: ' + error.message);
}

// ─── TEACHER ADMIN ────────────────────────────────────────────────────────────
async function addNewCase() {
    if (!supabaseClient) return alert('Not connected to database.');
    const name = document.getElementById('newCaseName').value.trim();
    const link = document.getElementById('newCaseLink').value.trim();
    if (!name || !link) return alert('Please provide both a Case Name and a Drive Link.');
    const { error } = await supabaseClient
        .from('active_cases').insert([{ case_name: name, drive_link: link }]);
    if (error) {
        alert('Failed to add case: ' + error.message);
    } else {
        document.getElementById('newCaseName').value = '';
        document.getElementById('newCaseLink').value  = '';
        alert('Case added!');
        loadCases(); renderAdminCaseList(); loadDocket();
    }
}

async function renderAdminCaseList() {
    if (!supabaseClient) return;
    const listDiv = document.getElementById('manage-cases-list');
    if (!listDiv) return;
    const { data: cases, error } = await supabaseClient
        .from('active_cases').select('*').order('case_name');
    if (error) { listDiv.innerHTML = "<p style='color:red;'>Error loading cases.</p>"; return; }
    if (!cases || cases.length === 0) {
        listDiv.innerHTML = "<p style='color:#666;'>No cases added yet.</p>"; return;
    }
    listDiv.innerHTML = cases.map(c =>
        '<div style="display:flex;justify-content:space-between;align-items:center;' +
            'padding:10px;border-bottom:1px solid #ddd;">' +
            '<div style="flex-grow:1;">' +
                '<strong>' + c.case_name + '</strong><br>' +
                '<span style="font-size:0.8rem;color:blue;">' + c.drive_link + '</span>' +
            '</div>' +
            '<button onclick="deleteCase(' + c.id + ')" ' +
                'style="background:red;color:white;border:none;padding:5px 10px;' +
                'border-radius:4px;cursor:pointer;flex-shrink:0;margin-left:10px;">Delete</button>' +
        '</div>'
    ).join('');
}

async function deleteCase(id) {
    if (!confirm('Remove this case from the student dropdown?')) return;
    const { error } = await supabaseClient.from('active_cases').delete().eq('id', id);
    if (!error) { renderAdminCaseList(); loadCases(); loadDocket(); }
    else alert('Delete failed: ' + error.message);
}
