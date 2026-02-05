let questions = [];
let authorities = [];
let arguments = [];

function openTab(evt, tabName) {
    let contents = document.getElementsByClassName("tab-content");
    for (let i = 0; i < contents.length; i++) contents[i].className = contents[i].className.replace(" active", "");
    let buttons = document.getElementsByClassName("tab-btn");
    for (let i = 0; i < buttons.length; i++) buttons[i].className = buttons[i].className.replace(" active", "");
    document.getElementById(tabName).className += " active";
    evt.currentTarget.className += " active";
}

function toggleAmicusFields() {
    const isAmicus = document.getElementById('docType').value === 'amicus';
    document.getElementById('amicus-support-div').style.display = isAmicus ? 'block' : 'none';
    document.getElementById('amicus-interest-div').style.display = isAmicus ? 'block' : 'none';
}

function updatePreview() {
    const val = (id) => document.getElementById(id).value;
    const isAmicus = val('docType') === 'amicus';
    
    let html = `
        <div class="docket">${val('docketNumber') || 'No. 24-XXXX'}</div>
        <div class="court">In the Supreme Court of the United States</div>
        <div class="caption">
            <div style="flex:1">${val('petitionerName') || '[Petitioner]'},<br><i>Petitioner</i>,<br>v.<br>${val('respondentName') || '[Respondent]'},<br><i>Respondent</i>.</div>
            <div class="bracket">On Writ of Certiorari to the ${val('lowerCourt') || '[Lower Court]'}</div>
        </div>
        <div class="title-box">
            ${isAmicus ? 'BRIEF OF ' + val('lawFirm') + ' AS AMICUS CURIAE SUPPORTING ' + val('amicusSupport') : 'BRIEF FOR THE PETITIONER'}
        </div>
        <div style="text-align:center; margin-top:100px;">
            ${val('studentNames').replace(/\n/g, '<br>')}
        </div>

        <div class="page-break"></div>
        <h3 style="text-align:center">QUESTIONS PRESENTED</h3>
        ${questions.map((q, i) => `<p><b>${i+1}.</b> ${q}</p>`).join('')}

        <div class="page-break"></div>
        <h3 style="text-align:center">TABLE OF CONTENTS</h3>
        <p>Questions Presented .................................... i</p>
        <p>Table of Authorities ................................... iii</p>
        ${isAmicus ? '<p>Interest of Amicus Curiae ........................... 1</p>' : ''}
        <p>Statement of the Case .................................. 2</p>
        <p>Argument ............................................... 3</p>

        <div class="page-break"></div>
        <h3 style="text-align:center">TABLE OF AUTHORITIES</h3>
        ${authorities.sort((a,b) => a.name.localeCompare(b.name)).map(a => `<p>${a.name} (${a.year}) ............. [Page]</p>`).join('')}
        
        <div class="page-break"></div>
        <h3 style="text-align:center">ARGUMENT</h3>
        <p>${val('summaryArgument')}</p>
    `;
    
    document.getElementById('preview-content').innerHTML = html;
}

function addQuestionField() {
    const q = prompt("Enter the question:");
    if(q) { questions.push(q); updatePreview(); }
}

function registerAuthority() {
    const name = document.getElementById('new-auth-name').value;
    const year = document.getElementById('new-auth-year').value;
    if(name) { authorities.push({name, year}); updatePreview(); }
}

function generatePDF() {
    const element = document.getElementById('printable-content');
    html2pdf().from(element).set({
        margin: 0,
        filename: 'Supreme_Court_Brief.pdf',
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    }).save();
}
