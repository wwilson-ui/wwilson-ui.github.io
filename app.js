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
