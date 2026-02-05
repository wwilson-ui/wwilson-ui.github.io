let questions = [];
let authorities = [];
let argumentSections = [];

// Tab Logic
function openTab(evt, tabName) {
    let contents = document.getElementsByClassName("tab-content");
    for (let i = 0; i < contents.length; i++) contents[i].classList.remove("active");
    let buttons = document.getElementsByClassName("tab-btn");
    for (let i = 0; i < buttons.length; i++) buttons[i].classList.remove("active");
    document.getElementById(tabName).classList.add("active");
    evt.currentTarget.classList.add("active");
}

function toggleAmicusFields() {
    const isAmicus = document.getElementById('docType').value === 'amicus';
    document.getElementById('amicus-support-div').style.display = isAmicus ? 'block' : 'none';
    document.getElementById('amicus-interest-div').style.display = isAmicus ? 'block' : 'none';
}

function addStudentField() {
    const container = document.getElementById('student-list');
    const input = document.createElement('input');
    input.type = "text";
    input.className = "student-name-input";
    input.placeholder = "Student Name";
    input.onkeyup = updatePreview;
    container.appendChild(input);
}

function addQuestionField() {
    const q = prompt("Enter the Constitutional Question:");
    if (q) { questions.push(q); updatePreview(); renderQuestionList(); }
}

function renderQuestionList() {
    const container = document.getElementById('questions-container');
    container.innerHTML = questions.map((q, i) => `<div class="arg-section-input"><b>Q${i+1}:</b> ${q}</div>`).join('');
}

function registerAuthority() {
    const name = document.getElementById('new-auth-name').value;
    const year = document.getElementById('new-auth-year').value;
    const type = document.getElementById('new-auth-type').value;
    if (name) {
        authorities.push({ name, year, type });
        document.getElementById('new-auth-name').value = "";
        document.getElementById('new-auth-year').value = "";
        renderAuthList();
        updatePreview();
    }
}

function renderAuthList() {
    const container = document.getElementById('auth-list-container');
    container.innerHTML = authorities.map((a, i) => `<div>• ${a.name} (${a.year})</div>`).join('');
}

function addArgumentSection(type) {
    argumentSections.push({ type, title: "", body: "" });
    renderArgumentInputs();
}

function renderArgumentInputs() {
    const container = document.getElementById('argument-sections-container');
    container.innerHTML = argumentSections.map((sec, i) => `
        <div class="arg-section-input">
            <input type="text" placeholder="${sec.type === 'heading' ? 'Main Point Title' : 'Sub-point Title'}" 
                onkeyup="argumentSections[${i}].title = this.value; updatePreview()" value="${sec.title}">
            <textarea placeholder="Legal reasoning..." onkeyup="argumentSections[${i}].body = this.value; updatePreview()">${sec.body}</textarea>
        </div>
    `).join('');
}

function romanize(num) {
    const lookup = {M:1000,CM:900,D:500,CD:400,C:100,XC:90,L:50,XL:40,X:10,IX:9,V:5,IV:4,I:1};
    let roman = '';
    for (let i in lookup) { while (num >= lookup[i]) { roman += i; num -= lookup[i]; } }
    return roman;
}

function updatePreview() {
    const getVal = (id) => document.getElementById(id) ? document.getElementById(id).value : "";
    const isAmicus = getVal('docType') === 'amicus';
    
    // 1. Cover Page
    let students = Array.from(document.querySelectorAll('.student-name-input')).map(i => i.value).join('<br>');
    
    let html = `
        <div class="docket">${getVal('docketNumber') || 'No. 24-XXXX'}</div>
        <div class="court-header">In the Supreme Court of the United States</div>
        <div class="caption-box">
            <div class="parties">
                ${getVal('petitionerName') || '[Petitioner]'},<br>
                <div class="v-mark">v.</div>
                ${getVal('respondentName') || '[Respondent]'},
            </div>
            <div class="bracket-side">
                On Writ of Certiorari to the ${getVal('lowerCourt') || '[Lower Court]'}
            </div>
        </div>
        <div class="title-block">
            ${isAmicus ? 'BRIEF OF ' + getVal('lawFirm') + ' AS AMICUS CURIAE SUPPORTING ' + getVal('amicusSupport') : 'BRIEF FOR THE PETITIONER'}
        </div>
        <div style="text-align:center; margin-top:50px;">
            <b>Counsel for Filing Party:</b><br>${students || '[Student Names]'}
        </div>

        <div class="page-break-indicator"></div>
        <h3 style="text-align:center">QUESTIONS PRESENTED</h3>
        ${questions.map((q, i) => `<p><b>${questions.length > 1 ? (i+1)+'.' : ''}</b> ${q}</p>`).join('')}

        <div class="page-break-indicator"></div>
        <h3 style="text-align:center">TABLE OF AUTHORITIES</h3>
        ${authorities.sort((a,b) => a.name.localeCompare(b.name)).map(a => `<p>${a.name} (${a.year}) ................... [Page]</p>`).join('')}

        <div class="page-break-indicator"></div>
        <h3 style="text-align:center">ARGUMENT</h3>
        <i>Summary: ${getVal('summaryArgument')}</i>
        <hr>
    `;

    // 2. Arguments with correct labels
    let mainI = 0; let subA = 0;
    argumentSections.forEach(sec => {
        if (sec.type === 'heading') {
            mainI++; subA = 0;
            html += `<h4>${romanize(mainI)}. ${sec.title}</h4><p>${sec.body}</p>`;
        } else {
            subA++;
            html += `<div style="margin-left:30px;"><b>${String.fromCharCode(64 + subA)}. ${sec.title}</b><p>${sec.body}</p></div>`;
        }
    });

    html += `<div class="page-break-indicator"></div><h3 style="text-align:center">CONCLUSION</h3><p>${getVal('conclusionText')}</p>`;
    
    document.getElementById('preview-content').innerHTML = html;
}

function generatePDF() {
    const element = document.getElementById('printable-content');
    const opt = { margin: 0.5, filename: 'MootCourt_Brief.pdf', html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } };
    html2pdf().from(element).set(opt).save();
}

function handleCredentialResponse(response) { console.log("Token: " + response.credential); alert("Logged in successfully!"); }

// Initialize
updatePreview();
