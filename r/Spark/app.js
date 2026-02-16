let supabase;
let currentUser = null;

window.addEventListener('load', async () => {
    console.log('START');
    
    await new Promise(r => setTimeout(r, 1000));
    
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase ready');
    
    const btn = document.getElementById('googleSignInBtn');
    btn.onclick = async () => {
        console.log('CLICKED');
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: 'https://wwilson-ui.github.io/r/Spark/' }
        });
    };
    
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        console.log('SIGNED IN:', session.user.email);
        
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
        
        if (profile) {
            currentUser = profile;
            console.log('PROFILE:', profile.username, profile.role);
            
            document.getElementById('authSection').innerHTML = `
                <div class="user-info">
                    <div class="user-avatar">${profile.username[0].toUpperCase()}</div>
                    <div>
                        <div class="user-name">Logged in as ${profile.username}</div>
                        <div class="user-role">${profile.role.toUpperCase()}</div>
                    </div>
                </div>
                <button class="btn btn-secondary" onclick="supabase.auth.signOut()">Sign Out</button>
            `;
            
            document.getElementById('createPostBtn').style.display = 'block';
            
            if (profile.role === 'teacher') {
                document.getElementById('createSubredditBtn').style.display = 'block';
            }
        }
    }
    
    supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') location.reload();
    });
});
