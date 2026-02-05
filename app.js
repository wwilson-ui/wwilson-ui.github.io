// STATE VARIABLES
let questions = [];
let authorities = [];
let args = [];

// INITIALIZATION
window.onload = function() {
    console.log("Moot Court App Initialized");
    updatePreview(); // Run once on startup
};

// TAB NAVIGATION
function openTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    // Highlight the button (simple loop match)
    const btns = document.querySelectorAll('.tab-btn');
    btns.forEach(btn => {
        if(btn.textContent.toLowerCase().includes(tabId) || 
           (tabId === 'export' && btn.textContent.includes('Finish'))) {
            btn.classList.add('active');
        }
    });
}

// DATA HANDLERS
function addQuestion() {
    questions.push("");
    renderQuestions();
    updatePreview();
}

function updateQuestion(index, value) {
    questions[index] = value;
    updatePreview();
}

function removeQuestion(index) {
    questions.splice(index, 1);
    renderQuestions();
    updatePreview();
}

function renderQuestions() {
    const container = document.getElementById('questions-list');
    container.innerHTML = questions.map((q, i) => `
        <div class="list-item-box">
            <button class="delete-x" onclick="removeQuestion(${i})">X</button>
            <label>Question ${i+1}:</label>
            <textarea oninput="updateQuestion(${i}, this.value)">${q}</textarea>
        </div>
    `).join('');
}

function addAuthority() {
    const type = document.getElementById('authType').value;
    const name = document.getElementById('authName').value;
    const year = document.getElementById('authYear').value;
    if(name) {
        authorities.push({type, name, year});
        // Clear inputs
        document.getElementById('authName').value = '';
        document.getElementById('authYear').value = '';
        renderAuthorities();
        updatePreview();
    }
}

function removeAuthority(index) {
    authorities.splice(index, 1);
    renderAuthorities();
    updatePreview();
}

function renderAuthorities() {
    const container = document.getElementById('auth-display-list');
    container.innerHTML = authorities.map((a, i) => `
        <div class="list-item-box" style="font-size:0.8rem;">
            <button class="delete-x" onclick="removeAuthority(${i})">X</button>
            <strong>${a.type}:</strong> ${a.name} (${a.year})
        </div>
    `).join('');
}

function addArgSection(type) {
    args.push({type: type, title: "", body: ""});
    renderArgs();
    updatePreview();
}

function updateArg(index, field, value) {
    args[index][field] = value;
    updatePreview();
}

function removeArg(index) {
    args.splice(index, 1);
    renderArgs();
    updatePreview();
}

function renderArgs() {
    const container = document.getElementById('argument-builder');
    container.innerHTML = args.map((arg, i) => `
        <div class="list-item-box" style="${arg.type === 'sub' ? 'margin-left:30px; border-left:4px solid #1a237e;' : ''}">
            <button class="delete-x" onclick="removeArg(${i})">X</button>
            <label>${arg.type === 'heading' ? 'Main Heading' : 'Sub-Point'}:</label>
            <input type="text" placeholder="Title" value="${arg.title}" oninput="updateArg(${i}, 'title', this.value)">
            <textarea placeholder="Text..." oninput="updateArg(${i}, 'body', this.value)">${arg.body}</textarea>
        </div>
    `).join('');
}

// HELPER: Roman Numerals
function romanize(num) {
    const lookup = {M:1000,CM:900,D:500,CD:400,C:100,XC:90,L:50,XL:40,X:10,IX:9,V:5,IV:4,I:1};
    let roman = '';
    for (let i in lookup ) {
      while ( num >= lookup[i] ) { roman += i; num -= lookup[i]; }
    }
    return roman;
}

// --- CORE PREVIEW ENGINE ---
function updatePreview() {
    try {
        // Safe Value Getter
        const val = (id) => document.getElementById(id) ? document.getElementById(id).value : "";
        
        // Logic Vars
        const isAmicus = val('docType') === 'amicus';
        document.getElementById('amicus-options').style.display = isAmicus ? 'block' : 'none';
        document.getElementById('amicus-interest-field').style.display = isAmicus ? 'block' : 'none';

        // 1. COVER PAGE HTML
        let html = `
            <div class="docket-num">${val('docket') || 'No. 24-XXXX'}</div>
            <div class="court-header">In the Supreme Court of the United States</div>
            
            <div class="caption-container">
                <div class="parties">
                    ${val('petitioner') || '[Petitioner Name]'},<br>
                    <i>Petitioner</i>,<br>
                    <div style="margin:10px 0;">v.</div>
                    ${val('respondent') || '[Respondent Name]'},<br>
                    <i>Respondent</i>.
                </div>
                <div class="bracket">
                    On Writ of Certiorari to the ${val('lowerCourt') || '[Lower Court Name]'}
                </div>
            </div>
            
            <div style="text-align:center; margin-bottom:20px;">${val('termDate') || ''}</div>

            <div class="doc-title">
                ${isAmicus 
                  ? `BRIEF OF ${val('firmName')} AS AMICUS CURIAE SUPPORTING ${val('amicusSupport')}` 
                  : `BRIEF FOR THE ${val('docType') === 'brief' ? 'PETITIONER' : 'RESPONDENT'}`
                }
            </div>

            <div style="text-align:center; margin-top:50px;">
                <b>Respectfully Submitted,</b><br><br>
                ${val('firmName') || '[Law Firm]'}<br>
                <div style="font-size:0.9rem; margin-top:10px; line-height:1.4;">
                    ${val('studentNames').replace(/\n/g, '<br>')}
                </div>
            </div>
        `;

        // 2. QUESTIONS PRESENTED
        html += `<div class="page-break"></div><div class="center-heading">QUESTIONS PRESENTED</div>`;
        if(questions.length > 0) {
            questions.forEach((q, i) => {
                html += `<p><b>${i+1}.</b> ${q}</p>`;
            });
        } else { html += `<p><i>[No questions entered]</i></p>`; }

        // 3. TABLE OF AUTHORITIES (Sorted)
        html += `<div class="page-break"></div><div class="center-heading">TABLE OF AUTHORITIES</div>`;
        if(authorities.length > 0) {
            // Sort by name
            const sorted = authorities.sort((a,b) => a.name.localeCompare(b.name));
            sorted.forEach(a => {
                html += `<div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span>${a.name} (${a.year})</span>
                    <span>[Page]</span>
                </div>`;
            });
        }

        // 4. ARGUMENT SECTION
        html += `<div class="page-break"></div><div class="center-heading">ARGUMENT</div>`;
        
        if(isAmicus && val('interestAmicus')) {
            html += `<h4>Interest of Amicus Curiae</h4><p>${val('interestAmicus')}</p>`;
        }
        
        if(val('statementCase')) html += `<h4>Statement of the Case</h4><p>${val('statementCase')}</p>`;
        if(val('summaryArg')) html += `<h4>Summary of Argument</h4><p>${val('summaryArg')}</p>`;

        html += `<hr style="margin:20px 0;">`;

        // Loop through dynamic arguments
        let mainCount = 0;
        let subCount = 0;
        args.forEach(arg => {
            if(arg.type === 'heading') {
                mainCount++;
                subCount = 0;
                html += `<div class="arg-heading">${romanize(mainCount)}. ${arg.title}</div><p>${arg.body}</p>`;
            } else {
                subCount++;
                // Convert 1 -> A, 2 -> B
                let letter = String.fromCharCode(64 + subCount);
                html += `<div class="arg-sub"><b>${letter}. ${arg.title}</b><p>${arg.body}</p></div>`;
            }
        });

        // 5. CONCLUSION
        if(val('conclusion')) {
            html += `<div class="page-break"></div><div class="center-heading">CONCLUSION</div><p>${val('conclusion')}</p>`;
        }

        // INJECT INTO PAGE
        document.getElementById('preview-content').innerHTML = html;

    } catch (err) {
        console.error("Preview Error:", err);
    }
}

// EXPORT FUNCTION
function generatePDF() {
    const element = document.getElementById('printable-area');
    const opt = {
        margin: 0.5,
        filename: 'MootCourt_Brief.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().from(element).set(opt).save();
}

// GOOGLE SIGN-IN HANDLER
function handleCredentialResponse(response) {
    console.log("Google Token Received: " + response.credential);
    alert("Signed in successfully (Demo Mode)");
}

// LOCAL SAVE/LOAD (Simple JSON)
function exportData() {
    const data = {
        questions, authorities, args,
        formData: {}
    };
    // Save all inputs
    document.querySelectorAll('input, textarea, select').forEach(el => {
        if(el.id) data.formData[el.id] = el.value;
    });
    
    const blob = new Blob([JSON.stringify(data)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "moot_court_project.civics";
    a.click();
}

function importData(event) {
    const file = event.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = JSON.parse(e.target.result);
        
        // Restore Arrays
        questions = data.questions || [];
        authorities = data.authorities || [];
        args = data.args || [];
        
        // Restore Inputs
        for (const [key, value] of Object.entries(data.formData)) {
            if(document.getElementById(key)) document.getElementById(key).value = value;
        }
        
        // Refresh UI
        renderQuestions();
        renderAuthorities();
        renderArgs();
        updatePreview();
    };
    reader.readAsText(file);
}
