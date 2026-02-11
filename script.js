const SUPABASE_URL = 'https://dfmugytablgldpkadfrl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AoeVLd5TSJMGyhAyDmXTng_5C-_C8nC';
const TEACHER_EMAIL = "wwilson@mtps.us";

let supabaseClient = null;
let currentUser = null;

let data = {
    petitioners: [""],
    respondents: [""],
    questions: [""],
    cases: [""],
    statutes: [""]
};

// ─── SUPABASE INIT ─────────────────────────────────────────────────────────
function initSupabase() {
    if (window.supabase && !supabaseClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        loadCases();
        loadDocket();
    }
}

// ─── PERSISTENT LOGIN ──────────────────────────────────────────────────────
// Stores the user email in localStorage so a page refresh keeps them logged in.
window.onload = () => {
    initSupabase();
    renderInputFields();
    refresh();

    const savedUser = localStorage.getItem('scotus_user');
    if (savedUser) {
        restoreSession(savedUser);
    } else {
        document.getElementById('auth-status').innerText = "Not signed in";
    }
};

function restoreSession(email) {
    currentUser = email;
    showLoggedInState(email);
    if (!supabaseClient) initSupabase();
    if (supabaseClient) {
        loadCases();
        loadSavedVersions();
        loadDocket();
    }
}

function showLoggedInState(email) {
    const statusEl = document.getElementById('auth-status');
    statusEl.innerHTML = `
        <span style="display:block;margin-bottom:4px;">&#10003; ${email}</span>
        <button onclick="signOut()" style="font-size:0.7rem;padding:3px 8px;border:1px solid #ccc;
            border-radius:4px;cursor:pointer;background:white;color:#333;">Sign Out</button>`;
    if (email === TEACHER_EMAIL) {
        const adminBtn = document.getElementById('admin-tab-btn');
        if (adminBtn) adminBtn.style.display = "block";
    }
    const wrapper = document.getElementById('google-btn-wrapper');
    if (wrapper) wrapper.style.display = "none";
}

function signOut() {
    localStorage.removeItem('scotus_user');
    currentUser = null;
    document.getElementById('auth-status').innerText = "Not signed in";
    const wrapper = document.getElementById('google-btn-wrapper');
    if (wrapper) wrapper.style.display = "block";
    const adminBtn = document.getElementById('admin-tab-btn');
    if (adminBtn) adminBtn.style.display = "none";
    const drop = document.getElementById('cloud-projects');
    if (drop) drop.innerHTML = '<option value="">Select a Project...</option>';
}

async function onSignIn(response) {
    const user = JSON.parse(atob(response.credential.split('.')[1]));
    currentUser = user.email;
    localStorage.setItem('scotus_user', currentUser);
    showLoggedInState(currentUser);
    if (!supabaseClient) initSupabase();
    if (supabaseClient) {
        loadCases();
        loadSavedVersions();
        loadDocket();
    }
}

// ─── TAB SWITCHING ─────────────────────────────────────────────────────────
function switchTab(id, skipReload) {
    skipReload = skipReload || false;
    document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    var targetTab = document.getElementById(id);
    if (targetTab) targetTab.classList.add('active');
    if (typeof event !== 'undefined' && event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    if (!skipReload) {
        if (id === 'admin' && supabaseClient) renderAdminCaseList();
        if (id === 'docket' && supabaseClient) loadDocket();
    }
}

// ─── AMICUS TOGGLE ─────────────────────────────────────────────────────────
function toggleAmicusField() {
    var type = document.getElementById('briefType').value;
    document.getElementById('amicus-extras').style.display = (type === "Amicus Curiae") ? "block" : "none";
}

// ─── LIVE PREVIEW ──────────────────────────────────────────────────────────
function refresh() {
    var v = function(id) { var el = document.getElementById(id); return el ? el.value : ""; };
    var pNum = 1;
    var makePage = function(html) {
        return '<div class="paper">' + html + '<div class="manual-footer">' + pNum++ + '</div></div>';
    };

    var docket = v('docketNum').trim();
    if (docket && docket.toUpperCase().indexOf("CASE NO.:") !== 0) docket = "Case No.: " + docket;

    var briefType = v('briefType');
    var briefTypeTitle = "BRIEF FOR THE " + briefType.toUpperCase();
    if (briefType === "Amicus Curiae") {
        briefTypeTitle = "BRIEF OF " + (v('amicusName').toUpperCase() || '[AMICUS NAME]') +
            " AS AMICUS CURIAE " + v('amicusSupport').toUpperCase();
    }

    var coverHtml = '<div style="font-weight:bold;">' + (docket.toUpperCase() || 'CASE NO. 00-000') + '</div>' +
        '<div class="court-header" style="margin-top:0.5in;">In the<br>Supreme Court of the United States</div>' +
        '<div style="text-align:center;font-weight:bold;">' + (v('courtTerm').toUpperCase() || 'OCTOBER TERM 202X') + '</div>' +
        '<hr style="border:none;border-top:1.5pt solid black;margin:20px 0;">' +
        '<div style="display:flex;margin:20px 0;">' +
            '<div style="flex:1;padding-right:15px;">' +
                data.petitioners.map(function(p){ return p.toUpperCase() || 'PETITIONER'; }).join(',<br>') +
                ',<br><i>Petitioner</i>,' +
                '<div style="margin:10px 40px;">v.</div>' +
                data.respondents.map(function(r){ return r.toUpperCase() || 'RESPONDENT'; }).join(',<br>') +
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
            '<div style="font-size:11pt;margin-top:10px;">' + v('studentNames').replace(/\n/g,'<br>') + '</div>' +
        '</div>';

    var questionsHtml = '<div class="section-header">QUESTIONS PRESENTED</div>' +
        data.questions.map(function(q,i){ return '<p><b>' + (i+1) + '.</b> ' + (q||'...') + '</p>'; }).join('');

    var authoritiesHtml = '<div class="section-header">TABLE OF AUTHORITIES</div>' +
        '<p><b>Cases:</b></p>' +
        (data.cases.filter(function(x){return x.trim();}).sort().map(function(c){return '<div><i>'+c+'</i></div>';}).join('') || '...') +
        '<p style="margin-top:10px;"><b>Statutes:</b></p>' +
        (data.statutes.filter(function(x){return x.trim();}).sort().map(function(s){return '<div>'+s+'</div>';}).join('') || '...');

    var argumentHtml = '<div class="section-header">SUMMARY OF ARGUMENT</div>' +
        '<p>' + v('summaryArg') + '</p>' +
        '<div class="section-header">ARGUMENT</div>' +
        '<p style="white-space:pre-wrap;">' + v('argBody') + '</p>';

    var conclusionHtml = '<div class="section-header">CONCLUSION</div><p>' + v('conclusionText') + '</p>';

    var target = document.getElementById('render-target');
    if (target) {
        target.innerHTML = makePage(coverHtml) + makePage(questionsHtml) +
            makePage(authoritiesHtml) + makePage(argumentHtml) + makePage(conclusionHtml);
    }
}

// ─── DYNAMIC INPUTS ────────────────────────────────────────────────────────
function addDynamic(type) { data[type + 's'].push(""); renderInputFields(); refresh(); }
function removeDynamic(type, idx) {
    if (data[type + 's'].length > 1) data[type + 's'].splice(idx, 1);
    else data[type + 's'][0] = "";
    renderInputFields(); refresh();
}
function renderInputFields() {
    ['petitioner', 'respondent', 'question', 'case', 'statute'].forEach(function(t) {
        var container = document.getElementById(t + '-inputs');
        if (!container) return;
        container.innerHTML = data[t + 's'].map(function(val, i) {
            return '<div style="display:flex;gap:5px;margin-bottom:5px;">' +
                '<input type="text" value="' + val.replace(/"/g,'&quot;') + '" ' +
                    'oninput="data[\'' + t + 's\'][' + i + ']=this.value;refresh()">' +
                '<button onclick="removeDynamic(\'' + t + '\',' + i + ')" ' +
                    'style="border:none;background:none;cursor:pointer;">&#10060;</button>' +
                '</div>';
        }).join('');
    });
}

// ─── CLOUD SAVE / LOAD / DELETE ───────────────────────────────────────────
async function saveToCloud() {
    if (!currentUser || !supabaseClient) return alert("Please sign in first.");
    var title = (document.getElementById('projectTitle') && document.getElementById('projectTitle').value) ||
        (document.getElementById('assignedCase') && document.getElementById('assignedCase').value) || "Untitled";
    var inputs = {};
    document.querySelectorAll('input, textarea, select').forEach(function(el) { if (el.id) inputs[el.id] = el.value; });
    var result = await supabaseClient.from('briefs').upsert(
        { user_id: currentUser, project_title: title, content_data: data, input_fields: inputs, updated_at: new Date() },
        { onConflict: 'user_id, project_title' }
    );
    if (result.error) alert(result.error.message);
    else { alert("Saved!"); loadSavedVersions(); }
}

async function loadSavedVersions() {
    var select = document.getElementById('cloud-projects');
    if (!select || !currentUser || !supabaseClient) return;
    var result = await supabaseClient.from('briefs').select('project_title')
        .eq('user_id', currentUser).order('updated_at', { ascending: false });
    if (result.error) { console.error("Error loading projects:", result.error); return; }
    select.innerHTML = '<option value="">Select a Project...</option>';
    if (result.data) result.data.forEach(function(p) {
        var o = document.createElement('option');
        o.value = p.project_title; o.textContent = p.project_title;
        select.appendChild(o);
    });
}

async function loadSelectedProject() {
    var title = document.getElementById('cloud-projects').value;
    if (!title) return alert("Select a project first.");
    var result = await supabaseClient.from('briefs').select('*')
        .eq('user_id', currentUser).eq('project_title', title).single();
    var p = result.data;
    if (p) {
        data = p.content_data;
        for (var id in p.input_fields) {
            if (document.getElementById(id)) document.getElementById(id).value = p.input_fields[id];
        }
        toggleAmicusField(); renderInputFields(); refresh(); alert("Loaded: " + title);
    }
}

async function deleteSelectedProject() {
    var title = document.getElementById('cloud-projects').value;
    if (!title || !confirm('Delete "' + title + '"?')) return;
    var result = await supabaseClient.from('briefs').delete()
        .eq('user_id', currentUser).eq('project_title', title);
    if (!result.error) { alert("Deleted."); loadSavedVersions(); }
}

// ─── PDF OPTIONS (shared by download and submit) ──────────────────────────
// pagebreak mode 'css' + before:'.paper' means each .paper div starts a new
// PDF page. No fixed height on .paper means no forced blank continuation pages.
function buildPdfOptions(filename) {
    return {
        margin: 0,
        filename: filename,
        html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0, windowWidth: 816 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: 'css', before: '.paper' }
    };
}

function downloadPDF() {
    var element = document.getElementById('render-target');
    var title = (document.getElementById('assignedCase') && document.getElementById('assignedCase').value) ||
        (document.getElementById('projectTitle') && document.getElementById('projectTitle').value) || "Brief";
    html2pdf().from(element).set(buildPdfOptions(title + '.pdf')).save();
}

// ─── CASE DROPDOWN ─────────────────────────────────────────────────────────
async function loadCases() {
    var select = document.getElementById('assignedCase');
    if (!select || !supabaseClient) return;
    var result = await supabaseClient.from('active_cases').select('*').order('case_name');
    if (result.error) {
        console.error("Error loading cases:", result.error);
        select.innerHTML = '<option value="">-- Error loading cases --</option>';
        return;
    }
    var cases = result.data;
    select.innerHTML = '<option value="">-- Select your assigned Case --</option>' +
        cases.map(function(c) { return '<option value="' + c.case_name + '">' + c.case_name + '</option>'; }).join("");
    select.onchange = function() {
        var chosen = cases.find(function(c) { return c.case_name === this.value; }, this);
        var linkArea = document.getElementById('caseBriefLinkArea');
        if (linkArea) {
            linkArea.innerHTML = (chosen && chosen.drive_link)
                ? '<a href="' + chosen.drive_link + '" target="_blank">View Case Brief</a>' : '';
        }
        refresh();
    };
}

// ─── SUBMIT TO COURT ───────────────────────────────────────────────────────
// FIX: alert() now fires AFTER loadDocket() completes so the table is populated
// before the user dismisses the dialog. Console logs each step for easy debugging.
async function submitToCourt() {
    if (!currentUser || !supabaseClient) return alert("Please sign in before submitting.");

    var caseName = document.getElementById('assignedCase') ? document.getElementById('assignedCase').value : '';
    var briefType = document.getElementById('briefType') ? document.getElementById('briefType').value : '';
    var studentNameEl = document.getElementById('studentNames');
    var studentName = (studentNameEl && studentNameEl.value.trim()) ? studentNameEl.value.trim() : currentUser;

    if (!caseName) return alert("Please select your assigned case on the Cover Page tab before submitting.");
    if (!briefType) return alert("Please select a brief type.");

    var submitBtn = document.querySelector('button[onclick="submitToCourt()"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Generating PDF..."; }

    try {
        var element = document.getElementById('render-target');

        console.log("Step 1: Generating PDF...");
        var pdfBlob = await html2pdf().from(element).set(buildPdfOptions('temp.pdf')).output('blob');
        console.log("Step 1 done. Blob size:", pdfBlob.size);

        var fileName = (caseName + '_' + briefType + '_' + currentUser + '_' + Date.now() + '.pdf')
            .replace(/[^a-zA-Z0-9._-]/g, '_');

        console.log("Step 2: Uploading to storage as", fileName);
        var uploadResult = await supabaseClient.storage.from('court-briefs')
            .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: false });
        if (uploadResult.error) { console.error("Upload error:", uploadResult.error); throw uploadResult.error; }
        console.log("Step 2 done: upload OK");

        var urlResult = supabaseClient.storage.from('court-briefs').getPublicUrl(fileName);
        var publicUrl = urlResult.data ? urlResult.data.publicUrl : null;
        if (!publicUrl) throw new Error("Could not get public URL for uploaded file.");
        console.log("Step 3: Public URL =", publicUrl);

        console.log("Step 4: Inserting into court_docket...");
        var insertResult = await supabaseClient.from('court_docket')
            .insert([{ case_name: caseName, brief_type: briefType, student_name: studentName, pdf_url: publicUrl }])
            .select();
        if (insertResult.error) { console.error("Insert error:", insertResult.error); throw insertResult.error; }
        console.log("Step 4 done. Inserted:", insertResult.data);

        console.log("Step 5: Reloading docket...");
        await loadDocket();
        console.log("Step 5 done.");

        // Switch tab first so the table is already visible when alert appears
        switchTab('docket', true);
        alert("Your brief has been filed to the Public Docket!");

    } catch(err) {
        console.error("submitToCourt failed:", err);
        alert("Error: " + (err.message || JSON.stringify(err)));
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Submit to Court"; }
    }
}

// ─── DOCKET TABLE ──────────────────────────────────────────────────────────
async function loadDocket() {
    if (!supabaseClient) return;
    var filingsResult = await supabaseClient.from('court_docket').select('*');
    var casesResult  = await supabaseClient.from('active_cases').select('*');
    if (filingsResult.error) console.error("loadDocket filings error:", filingsResult.error);
    if (casesResult.error)   console.error("loadDocket cases error:",   casesResult.error);

    var body = document.getElementById('docket-body');
    if (!body) return;
    body.innerHTML = "";

    var cases   = casesResult.data  || [];
    var filings = filingsResult.data || [];

    if (cases.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#888;">No cases added yet.</td></tr>';
        return;
    }

    cases.forEach(function(c) {
        var caseFilings = filings.filter(function(f) { return f.case_name === c.case_name; });
        var row = document.createElement('tr');
        row.innerHTML =
            '<td><strong>' + c.case_name + '</strong></td>' +
            '<td>' + (c.drive_link ? '<a href="' + c.drive_link + '" target="_blank">Briefing</a>' : '&mdash;') + '</td>' +
            '<td>' + getLinksByType(caseFilings, 'Petitioner')    + '</td>' +
            '<td>' + getLinksByType(caseFilings, 'Respondent')    + '</td>' +
            '<td>' + getLinksByType(caseFilings, 'Amicus Curiae') + '</td>';
        body.appendChild(row);
    });
}

function getLinksByType(files, type) {
    var matches = files.filter(function(f) { return f.brief_type === type && f.pdf_url; });
    if (matches.length === 0) return '<span style="color:#bbb;">&mdash;</span>';
    return matches.map(function(f) {
        return '<div class="docket-link-wrapper">' +
            '<a href="' + f.pdf_url + '" target="_blank">&#128196; ' + f.student_name + '</a>' +
            (currentUser === TEACHER_EMAIL
                ? ' <span onclick="deleteSubmission(' + f.id + ')" style="color:red;cursor:pointer;">[x]</span>'
                : '') +
            '</div>';
    }).join("");
}

async function deleteSubmission(id) {
    if (!confirm("Remove this student's filing?")) return;
    var result = await supabaseClient.from('court_docket').delete().eq('id', id);
    if (!result.error) loadDocket();
    else alert("Delete failed: " + result.error.message);
}

// ─── TEACHER ADMIN ─────────────────────────────────────────────────────────
async function addNewCase() {
    if (!supabaseClient) return alert("Not connected to database.");
    var name = document.getElementById('newCaseName').value.trim();
    var link = document.getElementById('newCaseLink').value.trim();
    if (!name || !link) return alert("Please provide both a Case Name and a Drive Link.");
    var result = await supabaseClient.from('active_cases').insert([{ case_name: name, drive_link: link }]);
    if (result.error) {
        alert("Failed to add case: " + result.error.message);
    } else {
        document.getElementById('newCaseName').value = "";
        document.getElementById('newCaseLink').value = "";
        alert("Case added!");
        loadCases(); renderAdminCaseList(); loadDocket();
    }
}

async function renderAdminCaseList() {
    if (!supabaseClient) return;
    var listDiv = document.getElementById('manage-cases-list');
    if (!listDiv) return;
    var result = await supabaseClient.from('active_cases').select('*').order('case_name');
    if (result.error) { listDiv.innerHTML = "<p style='color:red;'>Error loading cases.</p>"; return; }
    var cases = result.data || [];
    if (cases.length === 0) { listDiv.innerHTML = "<p style='color:#666;'>No cases added yet.</p>"; return; }
    listDiv.innerHTML = cases.map(function(c) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid #ddd;">' +
            '<div style="flex-grow:1;">' +
                '<strong>' + c.case_name + '</strong><br>' +
                '<span style="font-size:0.8rem;color:blue;">' + c.drive_link + '</span>' +
            '</div>' +
            '<button onclick="deleteCase(' + c.id + ')" style="background:red;color:white;border:none;' +
                'padding:5px 10px;border-radius:4px;cursor:pointer;flex-shrink:0;margin-left:10px;">Delete</button>' +
            '</div>';
    }).join("");
}

async function deleteCase(id) {
    if (!confirm("Remove this case from the student dropdown?")) return;
    var result = await supabaseClient.from('active_cases').delete().eq('id', id);
    if (!result.error) { renderAdminCaseList(); loadCases(); loadDocket(); }
    else alert("Delete failed: " + result.error.message);
}
