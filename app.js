function updatePreview() {
    // 1. Get Data from Form
    const docType = document.getElementById('docType').value;
    const docket = document.getElementById('docketNumber').value || "No. 00-000";
    const petitioner = document.getElementById('petitionerName').value || "[Petitioner]";
    const respondent = document.getElementById('respondentName').value || "[Respondent]";
    const court = document.getElementById('lowerCourt').value || "[Lower Court Name]";
    const lawFirm = document.getElementById('lawFirm').value || "[Law Firm Name]";
    
    // 2. Build the Cover Page HTML
    let titleText = (docType === 'amicus') 
        ? `BRIEF OF ${lawFirm} AS AMICUS CURIAE IN SUPPORT OF THE ${document.getElementById('amicusSupport').value}`
        : `BRIEF FOR THE PETITIONER`;

    let html = `
        <div class="docket-number">${docket}</div>
        <div class="court-name">In the Supreme Court of the United States</div>
        
        <div class="caption-container">
            <div class="parties">
                <div>${petitioner},</div>
                <div class="v-spacer">v.</div>
                <div>${respondent},</div>
            </div>
            <div class="bracket">
                Petitioners.
            </div>
        </div>

        <p style="text-align:center;">On Writ of Certiorari to the ${court}</p>

        <div class="brief-title">${titleText}</div>
    `;

    // 3. Update the Preview Window
    document.getElementById('preview-content').innerHTML = html;
}

// Function to switch tabs
function openTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}


function addQuestionField() {
    const container = document.getElementById('questions-container');
    const count = container.getElementsByClassName('question-entry').length + 1;
    
    const div = document.createElement('div');
    div.className = 'question-entry';
    div.innerHTML = `
        <label>Question ${count}:</label>
        <textarea class="question-input" onkeyup="updatePreview()"></textarea>
    `;
    container.appendChild(div);
}

// Update your existing updatePreview() function to include this logic:
function updatePreview() {
    // ... previous code for cover ...

    // Get Questions
    const questions = document.querySelectorAll('.question-input');
    let questionsHtml = '<div class="preview-page-break"></div><h3 style="text-align:center;">QUESTION PRESENTED</h3>';
    
    // Logic: If 1 question, don't number it. If multiple, number them.
    if (questions.length === 1) {
        questionsHtml += `<div class="question-text centered-block">${questions[0].value}</div>`;
    } else {
        questions.forEach((q, index) => {
            if (q.value.trim() !== "") {
                questionsHtml += `<div class="question-text"><strong>${index + 1}.</strong> ${q.value}</div><br>`;
            }
        });
    }

    // Append to preview (we will expand this as we add more tabs)
    document.getElementById('preview-content').innerHTML = coverHtml + questionsHtml;
}
