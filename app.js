// State variables to hold student data
let questions = [];
let authorities = [];
let argumentSections = [];

// 1. ENSURE THE SCRIPT WAITS FOR THE PAGE
window.onload = function() {
    console.log("App initialized.");
    updatePreview(); // Initial call to show empty template
};

// Tab Switching Logic
function openTab(evt, tabName) {
    let contents = document.getElementsByClassName("tab-content");
    for (let i = 0; i < contents.length; i++) contents[i].classList.remove("active");
    
    let buttons = document.getElementsByClassName("tab-btn");
    for (let i = 0; i < buttons.length; i++) buttons[i].classList.remove("active");
    
    document.getElementById(tabName).classList.add("active");
    evt.currentTarget.classList.add("active");
}

function toggleAmicusFields() {
    const docType = document.getElementById('docType').value;
    const isAmicus = (docType === 'amicus');
    document.getElementById('amicus-support-div').style.display = isAmicus ? 'block' : 'none';
    document.getElementById('amicus-interest-div').style.display = isAmicus ? 'block' : 'none';
}

function addStudentField() {
    const container = document.getElementById('student-list');
    const input = document.createElement('input');
    input.type = "text";
    input.className = "student-name-input";
    input.placeholder = "Student Name";
    input.onkeyup = updatePreview; // Ensure new fields also trigger updates
    container.appendChild(input);
}

function addQuestionField() {
    const q = prompt("Enter the Constitutional Question:");
    if (q) { 
        questions.push(q); 
        renderQuestionList();
        updatePreview(); 
    }
}

function renderQuestionList() {
    const container = document.getElementById('questions-container');
    container.innerHTML = questions.map((q, i) => `
        <div class="arg-section-input"><b>Q${i+1}:</b> ${q}</div>
    `).join('');
}

function registerAuthority() {
    const nameInput = document.getElementById('new-auth-name');
    const yearInput = document.getElementById('new-auth-year');
    const typeInput = document.getElementById('new-auth-type');
    
    if (nameInput.value) {
        authorities.push({ 
            name: nameInput.value, 
            year: yearInput.value, 
            type: typeInput.value 
        });
        nameInput.value = "";
        yearInput.value = "";
        renderAuthList();
        updatePreview();
    }
}

function renderAuthList() {
    const container = document.getElementById('auth-list-container');
    container.innerHTML = authorities.map(a => `<div>• ${a.name} (${a.year})</div>`).join('');
}

function addArgumentSection(type) {
    argumentSections.push({ type: type, title: "", body: "" });
    renderArgumentInputs();
}

function renderArgumentInputs() {
    const container = document.getElementById('argument-sections-container');
    container.innerHTML = argumentSections.map((sec, i) => `
        <div class="arg-section-input">
            <input type="text" placeholder="${sec.type === 'heading' ? 'Main Point Title' : 'Sub-point Title'}" 
                onkeyup="argumentSections[${i}].title = this.value; updatePreview()" value="${sec.title}">
            <textarea placeholder="Legal reasoning..." 
                onkeyup="argumentSections[${i}].body = this.value; updatePreview()">${sec.body}</textarea>
        </div>
    `).join('');
}

function romanize(num) {
    const lookup = {M:1000,CM:900,D:500,CD:400,C:100,XC:90,L:50,XL:40,X:10,IX:9,V:5,IV:4,I:1};
    let roman = '';
    for (let i in lookup) { while (num >= lookup[i]) { roman += i; num -= lookup[i]; } }
    return roman;
}

// THE MAIN ENGINE
function updatePreview() {
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : "";
    };

    const isAmicus = getVal('docType') === 'amicus';
    
    // Collect Student Names correctly
    const studentInputs = document.querySelectorAll('.student-name-input');
    let studentsHtml = Array.from(studentInputs)
        .map(i => i.value)
        .filter(v => v !== "")
        .join('<br>');

    // Build the Cover Page
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
            ${isAmicus ? 'BRIEF OF ' + (getVal('lawFirm') || '[Law Firm]') + ' AS AMICUS CURIAE SUPPORTING ' + getVal('amicusSupport') : 'BRIEF FOR THE PETITIONER'}
        </div>
        <div style="text-align:center; margin-top:50px;">
            <b>Counsel for Filing Party:</b><br>${studentsHtml || '[Student Names]'}
        </div>

        <div class="page-break-indicator"></div>
        <h3 style="text-align:center">QUESTIONS PRESENTED</h3>
        ${questions.length > 0 ? questions.map((q, i) => `<p><b>${questions.length > 1 ? (i+1)+'.' : ''}</b> ${q}</p>`).join('') : '<p style="color:gray">[No questions entered yet]</p>'}

        <div class="page-break-indicator"></div>
        <h3 style="text-align:center">TABLE OF AUTHORITIES</h3>
        ${authorities.length > 0 ? authorities.sort((a,b) => a.name.localeCompare(b.name)).map(a => `<p>${a.name} (${a.year}) ................... [Page]</p>`).join('') : '<p style="color:gray">[No authorities registered]</p>'}

        <div class="page-break-indicator"></div>
        <h3 style="text-align:center">ARGUMENT</h3>
        ${getVal('summaryArgument') ? '<i>Summary: ' + getVal('summaryArgument') + '</i><hr>' : ''}
    `;

    // Add Argument Sections
    let mainI = 0; 
    let subA = 0;
    argumentSections.forEach(sec => {
        if (sec.type === 'heading') {
            mainI++; 
            subA = 0;
            html += `<h4>${romanize(mainI)}. ${sec.title || '[Untitled Point]'}</h4><p>${sec.body}</p>`;
        } else {
            subA++;
            html += `<div style="margin-left:30px;"><b>${String.fromCharCode(64 + subA)}. ${sec.title || '[Untitled Sub-point]'}</b><p>${sec.body}</p></div>`;
        }
    });

    // Conclusion
    if (getVal('conclusionText')) {
        html += `<div class="page-break-indicator"></div><h3 style="text-align:center">CONCLUSION</h3><p>${getVal('conclusionText')}</p>`;
    }
    
    document.getElementById('preview-content').innerHTML = html;
}

// PDF Export
function generatePDF() {
    const element = document.getElementById('printable-content');
    const opt = { 
        margin: 0.5, 
        filename: 'MootCourt_Brief.pdf', 
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 }, 
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } 
    };
    html2pdf().from(element).set(opt).save();
}

function handleCredentialResponse(response) { 
    console.log("Encoded JWT ID token: " + response.credential); 
    alert("Logged in to Google successfully!"); 
}
