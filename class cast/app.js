// 1. INITIALIZE FIREBASE 
const firebaseConfig = {
  apiKey: "AIzaSyBBzr6_TAcxqSED28NopqR8a3kf7wj-VU4",
  authDomain: "student-podcast-tracker.firebaseapp.com",
  projectId: "student-podcast-tracker",
  storageBucket: "student-podcast-tracker.firebasestorage.app",
  messagingSenderId: "723984655102",
  appId: "1:723984655102:web:d14bf2d1dda9ad6525bbaf",
  measurementId: "G-Q7W14WR5X8"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 2. GOOGLE LOGIN WITH ACCOUNT CHOOSER & DOMAIN RESTRICTION
const loginBtn = document.getElementById('loginBtn');
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        
        // Force the account selection screen AND restrict to MTPS.us
        provider.setCustomParameters({ 
            prompt: 'select_account',
            hd: "MTPS.us" 
        }); 

        auth.signInWithPopup(provider).then((result) => {
            const email = result.user.email;
            
            // Double-check the domain just in case
            if (!email.endsWith("@MTPS.us")) {
                auth.signOut();
                alert("Unauthorized: Please use your @MTPS.us email.");
            } else {
                // Route teacher vs student (Change "teacher@MTPS.us" to your actual email)
                if (email === "teacher@MTPS.us") {
                    window.location.href = "teacher.html";
                } else {
                    window.location.href = "student.html";
                }
            }
        }).catch((error) => {
            // This will show you exactly what is going wrong if it fails again
            console.error("Login Error: ", error);
            alert("Login failed: " + error.message);
        });
    });
}

// 3. AUDIO PLAYER CHECKPOINTS & TRACKING (For student.html)
const audioPlayer = document.getElementById('audioPlayer');
const questionModal = document.getElementById('questionModal');
let answeredCheckpoints = [];

// Example checkpoints (pop up at 15 seconds)
const checkpoints = [
    { time: 15, question: "What is the main character's name?", answer: "John", forceCorrect: true }
];

if (audioPlayer) {
    audioPlayer.addEventListener('timeupdate', () => {
        let currentTime = Math.floor(audioPlayer.currentTime);
        
        // Find if current second matches a checkpoint that hasn't been answered yet
        let cp = checkpoints.find(c => c.time === currentTime && !answeredCheckpoints.includes(c.time));
        
        if (cp) {
            audioPlayer.pause();
            questionModal.style.display = "block";
            document.getElementById('questionText').innerText = cp.question;
            
            document.getElementById('submitAnswerBtn').onclick = () => {
                let studentAns = document.getElementById('studentAnswer').value;
                if (cp.forceCorrect && studentAns.toLowerCase() !== cp.answer.toLowerCase()) {
                    document.getElementById('feedback').innerText = "Incorrect, try again before proceeding.";
                } else {
                    questionModal.style.display = "none";
                    answeredCheckpoints.push(cp.time);
                    audioPlayer.play();
                    // Save progress to database here!
                    logProgressToFirebase(currentTime, answeredCheckpoints.length);
                }
            };
        }
    });
}

function logProgressToFirebase(secondsListened, checkpointsPassed) {
    const user = auth.currentUser;
    if(user) {
        db.collection("assignments").doc(user.email).set({
            email: user.email,
            secondsListened: secondsListened,
            checkpointsPassed: checkpointsPassed,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }
}

// 4. CSV EXPORT LOGIC (For teacher.html)
const exportBtn = document.getElementById('exportCsvBtn');
if (exportBtn) {
    exportBtn.addEventListener('click', () => {
        // Fetch data from Firebase
        db.collection("assignments").get().then((querySnapshot) => {
            let csvContent = "data:text/csv;charset=utf-8,Email,Seconds Listened,Checkpoints Passed\n";
            
            querySnapshot.forEach((doc) => {
                let data = doc.data();
                csvContent += `${data.email},${data.secondsListened},${data.checkpointsPassed}\n`;
            });

            // Trigger the download
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "student_audio_progress.csv");
            document.body.appendChild(link);
            link.click();
        });
    });
}
