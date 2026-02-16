// Simple, working version
let supabase;
let currentUser = null;

// Wait for page to load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Page loaded');
    
    // Wait for Supabase to load
    await new Promise(r => setTimeout(r, 500));
    
    // Initialize Supabase
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase initialized');
    
    // Set up sign-in button
    const btn = document.getElementById('googleSignInBtn');
    if (btn) {
        btn.onclick = async () => {
            console.log('Sign in clicked');
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: 'https://wwilson-ui.github.io/r/Spark/'
                }
            });
            if (error) console.error(error);
        };
    }
    
    // Check if signed in
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        console.log('User signed in:', session.user.email);
        
        // Get profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
        
        if (profile) {
            currentUser = profile;
            console.log('Profile loaded:', profile);
            
            // Update UI
            const authSection = document.getElementById('authSection');
            authSection.innerHTML = `
                <div class="user-info">
                    <div class="user-avatar">${profile.username[0].toUpperCase()}</div>
                    <div>
                        <div class="user-name">Logged in as ${profile.username}</div>
                        <div class="user-role">${profile.role.toUpperCase()}</div>
                    </div>
                </div>
                <button class="btn btn-secondary" onclick="signOut()">Sign Out</button>
            `;
            
            // Show create post button
            document.getElementById('createPostBtn').style.display = 'block';
            
            // Show create community button for teachers
            if (profile.role === 'teacher') {
                document.getElementById('createSubredditBtn').style.display = 'block';
            }
        } else {
            console.error('No profile found for user');
        }
    }
    
    // Listen for sign out
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            location.reload();
        }
    });
});

async function signOut() {
    await supabase.auth.signOut();
}

window.signOut = signOut;

console.log('App.js loaded');
