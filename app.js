// DATA STORAGE
let questions = [];
let authorities = [];
let arguments = [];

// 1. NAVIGATION
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    
    // Highlight button logic
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        if (btn.innerText.toLowerCase().includes(tabId)) btn.classList.add('active');
        if (tabId === 'export' && btn.innerText.includes('Export')) btn.classList.add('active');
    });
}

// 2. DATA MANAGEMENT
function addQuestion() {
    questions.push("");
    renderQuestions();
    updatePreview();
}

function updateQuestion(index, value) {
    questions[index] = value;
    updatePreview(); // Trigger update immediately
}

function renderQuestions() {
    const container = document.getElementById('questions-list');
    container.innerHTML = questions.map((q, i) => `
        <div class="dynamic-item">
            <button class="delete-x" onclick="questions.splice(${i},1); renderQuestions(); updatePreview();">X</button>
            <label>Question ${i+1}:</label>
            <textarea oninput="updateQuestion(${i}, this.value)">${q}</textarea>
        </div>
    `).join('');
}

function addAuthority() {
    const type = document.getElementById('authType').value;
    const name = document.getElementById('authName').value;
    const year = document.getElementById('authYear').value;
    if (name) {
        authorities.push({ type, name, year });
        document.getElementById('authName').value = "";
        document.getElementById('authYear').value = "";
        renderAuthorities();
        updatePreview();
    }
}

function renderAuthorities() {
    const container = document.getElementById('auth-display-list');
    container.innerHTML = authorities.map((a, i) => `
        <div class="dynamic-item" style="font-size:0.9rem;">
            <button class="delete-x" onclick="authorities.splice(${i},1); renderAuthorities(); updatePreview();">X</button>
            <b>${a.type}:</b> ${a.name} (${a.year})
        </div>
    `).join('');
}

function addArgSection(type) {
    arguments.push({ type, title: "", body: "" });
    renderArgs();
    updatePreview();
}

function updateArg(index, field, value) {
    arguments[index][field] = value;
    updatePreview();
}

function renderArgs() {
    const container = document.getElementById('argument-builder');
    container.innerHTML = arguments.map((arg, i) => `
        <div class="dynamic-item" style="${arg.type === 'sub' ? 'margin-left:30px; border-left:4px solid #1a237e;' : ''}">
            <button class="delete-x" onclick="arguments.splice(${i},1); renderArgs(); updatePreview();">X</button>
            <label>${arg.type === 'heading' ? 'Main Point' : 'Sub-Point'}:</label>
            <input type="text" placeholder="Title" value="${arg.title}" oninput="updateArg(${i}, 'title', this.value)">
            <textarea placeholder="Text..." oninput="updateArg(${i}, 'body', this.value)">${arg.body}</textarea>
        </div>
    `).join('');
}

function romanize(num) {
    const lookup = {M:1000,CM:900,D:500,CD:400,C:100,XC:90,L:50,XL:40,X:10,IX:9,V:5,IV:4,I:1};
    let roman = '';
    for (let i in lookup) { while (num >= lookup[i]) { roman += i; num -= lookup[i]; } }
    return roman;
}

// 3. THE PREVIEW ENGINE
function updatePreview() {
    // Helper to get value safely
    const val = (id) => document.getElementById(id) ? document.getElementById(id).value : "";
    
    // Logic checks
    const isAmicus = val('docType') === 'amicus';
    const amicusDiv = document.getElementById('amicus-options');
    const amicusInterest = document.getElementById('amicus-interest-field');
    
    // Toggle Visibility based on Logic
    if(amicusDiv) amicusDiv.style.display = isAmicus ? 'block' : 'none';
    if(amicusInterest) amicusInterest.style.display = isAmicus ? 'block' : 'none';

    // Build HTML
    let html = `
        <div class="docket">${val('docket') || 'No. 24-XXXX'}</div>
        <div class="court-header">In the Supreme Court of the United States</div>
        
        <div class="caption-box">
            <div class="parties">
                ${val('petitioner') || '[Petitioner]'},<br>
                <i>Petitioner</i>,<br>
                <div style="margin:10px 0">v.</div>
                ${val('respondent') || '[Respondent]'},<br>
                <i>Respondent</i>.
            </div>
            <div class="bracket">
                On Writ of Certiorari to the ${val('lowerCourt') || '[Lower Court]'}
            </div>
        </div>
        
        <div style="text-align:center; margin-bottom:20px;">${val('termDate') || ''}</div>

        <div class="title-box">
            ${isAmicus 
                ? `BRIEF OF ${val('firmName') || 'AMICUS'} AS AMICUS CURIAE SUPPORTING ${val('amicusSupport')}` 
                : `BRIEF FOR THE ${val('docType') === 'brief' ? 'PETITIONER' : 'RESPONDENT'}`
            }
        </div>

        <div style="text-align:center; margin-top:40px;">
            <b>Respectfully Submitted,</b><br><br>
            ${val('firmName') || '[Law Firm Name]'}<br>
            <div style="font-size:0.9rem; margin-top:10px;">
                ${val('studentNames').replace(/\n/g, '<br>')}
            </div>
        </div>
    `;

    // QUESTIONS
    html += `<div class="page-break"></div><div class="center-head">QUESTIONS PRESENTED</div>`;
    if (questions.length === 0) html += `<i>[No questions entered]</i>`;
    else questions.forEach((q, i) => html += `<p><b>${i+1}.</b> ${q}</p>`);

    // AUTHORITIES
    html += `<div class="page-break"></div><div class="center-head">TABLE OF AUTHORITIES</div>`;
    let sortedAuths = authorities.sort((a,b) => a.name.localeCompare(b.name));
    sortedAuths.forEach(a => {
        html += `<div style="display:flex; justify-content:space-between; margin-bottom:5px;">
            <span>${a.name} (${a.year})</span>
            <span>[Page]</span>
        </div>`;
    });

    // ARGUMENT
    html += `<div class="page-break"></div><div class="center-head">ARGUMENT</div>`;
    
    if (isAmicus && val('interestAmicus')) {
        html += `<h4>Interest of Amicus Curiae</h4><p>${val('interestAmicus')}</p>`;
    }
    
    if (val('statementCase')) html += `<h4>Statement of the Case</h4><p>${val('statementCase')}</p>`;
    if (val('summaryArg')) html += `<h4>Summary of Argument</h4><p>${val('summaryArg')}</p>`;
    
    html += `<hr style="margin:20px 0;">`;

    // Dynamic Arguments
    let mainCount = 0;
    let subCount = 0;
    arguments.forEach(arg => {
        if (arg.type === 'heading') {
            mainCount++;
            subCount = 0;
            html += `<h4 style="margin-top:20px;">${romanize(mainCount)}. ${arg.title}</h4><p>${arg.body}</p>`;
        } else {
            subCount++;
            let letter = String.fromCharCode(64 + subCount);
            html += `<div style="margin-left:30px; margin-top:10px;"><b>${letter}. ${arg.title}</b><p>${arg.body}</p></div>`;
        }
    });

    // CONCLUSION
    if (val('conclusion')) {
        html += `<div class="page-break"></div><div class="center-head">CONCLUSION</div><p>${val('conclusion')}</p>`;
    }

    document.getElementById('preview-content').innerHTML = html;
}

// PDF EXPORT
function generatePDF() {
    const element = document.getElementById('printable-area');
    html2pdf().from(element).set({
        margin: 0.5,
        filename: 'MootCourt_Brief.pdf',
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    }).save();
}

function handleCredentialResponse(response) {
    alert("Signed in! (Demo)");
}

// GLOBAL EVENT LISTENER (The Magic Fix)
document.addEventListener('input', updatePreview);
document.addEventListener('DOMContentLoaded', updatePreview);
