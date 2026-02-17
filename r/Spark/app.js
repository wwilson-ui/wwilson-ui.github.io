// app.js - COMPLETE REPLACEMENT

let sb = null;
let currentUser = null;
let isTeacher = false;
let currentSubFilter = 'all';
let currentOpenPostId = null; 
let myVotes = { posts: {}, comments: {} }; // Stores your votes locally

// Fun identity generator
const ADJECTIVES = ['Happy', 'Brave', 'Calm', 'Swift', 'Wise', 'Bright', 'Clever', 'Kind', 'Bold'];
const ANIMALS = ['Badger', 'Fox', 'Owl', 'Eagle', 'Bear', 'Dolphin', 'Wolf', 'Hawk', 'Tiger'];

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Supabase
    if (typeof window.supabase !== 'undefined') {
        sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    } else { 
        alert('Supabase not loaded'); 
        return; 
    }

    // 2. Setup Global Listeners (Escape key to close modals)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal('createPostModal');
            closeModal('createSubModal');
            closeModal('postDetailModal');
        }
    });

    // 3. Start App
    await checkUser();     // Handles Login logic
    loadSubreddits();      // Loads sidebar
    loadPosts();           // Loads main feed
    setupFormListeners();  // Connects the "Submit" buttons
});

// ================= AUTHENTICATION =================

// Make these global so the HTML buttons can find them
window.signIn = async () => {
    await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'https://wwilson-ui.github.io/r/Spark/' }
    });
};

window.signOut = async () => {
    await sb.auth.signOut();
    location.reload();
};

async function checkUser() {
    const { data: { session } } = await sb.auth.getSession();
    const authSection = document.getElementById('authSection');
    const actionBar = document.getElementById('actionBar');

    if (session) {
        console.log('✅ Session found:', session.user.email);
        
        // --- RETRY LOGIC FOR NEW USERS ---
        let profile = null;
        let attempts = 0;
        const maxAttempts = 5;
        
        while (!profile && attempts < maxAttempts) {
            const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
            
            if (data) {
                profile = data;
            } else {
                console.log(`⏳ Waiting for profile... (attempt ${attempts + 1})`);
                await new Promise(r => setTimeout(r, 500)); // Wait 500ms
            }
            attempts++;
        }
        
        if (!profile) {
            console.error('❌ Profile creation failed.');
            alert('Welcome! Your profile is being created. Please refresh the page in a moment.');
            return;
        }
        
        currentUser = profile;
        
        // Teacher Hardcode
        if (currentUser.email === 'wwilson@mtps.us') {
            currentUser.role = 'teacher';
        }
        isTeacher = currentUser.role === 'teacher';
        
        // Load Votes
        await loadMyVotes();
        
        // Update UI
        authSection.innerHTML = `
            <div style="display:flex; gap:10px; align-items:center;">
                <div style="text-align:right; line-height:1.2;">
                    <div style="font-weight:bold; font-size:0.9rem;">${currentUser.email.split('@')[0]}</div>
                    <div style="font-size:0.75rem; color:${isTeacher ? '#0079D3' : '#00D9A5'}; font-weight:bold; text-transform:uppercase;">${isTeacher ? 'TEACHER' : 'STUDENT'}</div>
                </div>
                <button class="google-btn" onclick="signOut()" style="padding: 4px 10px; font-size: 0.8rem;">Sign Out</button>
            </div>
        `;
        
        if (actionBar) actionBar.style.display = 'flex';
        const sidebarAddBtn = document.getElementById('sidebarAddBtn');
        if (sidebarAddBtn) sidebarAddBtn.style.display = isTeacher ? 'flex' : 'none';

    } else {
        // Not Logged In
        console.log('ℹ️ No session');
        authSection.innerHTML = `
            <button class="google-btn" onclick="signIn()">
                <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg" alt="G" style="width:18px; height:18px;">
                Sign in with Google
            </button>
        `;
        if (actionBar) actionBar.style.display = 'none';
    }
}

// ================= VOTING SYSTEM =================

async function loadMyVotes() {
    if (!currentUser) return;
    const { data } = await sb.from('votes').select('*').eq('user_id', currentUser.id);
    if (data) {
        myVotes = { posts: {}, comments: {} };
        data.forEach(v => {
            if (v.post_id) myVotes.posts[v.post_id] = v.vote_type;
            if (v.comment_id) myVotes.comments[v.comment_id] = v.vote_type;
        });
    }
}

async function vote(id, typeValue, itemType = 'post') {
    if (!currentUser) return alert("Please sign in to vote.");

    const currentVote = itemType === 'post' ? myVotes.posts[id] : myVotes.comments[id];
    let action = 'upsert';
    
    // Toggle off if clicking same button
    if (currentVote === typeValue) action = 'delete';

    // Optimistic Update (Update UI immediately)
    updateVoteUI(id, action === 'delete' ? 0 : typeValue, itemType);

    // Database Update
    if (action === 'delete') {
        let query = sb.from('votes').delete().eq('user_id', currentUser.id);
        if (itemType === 'post') query = query.eq('post_id', id);
        else query = query.eq('comment_id', id);
        await query;
        
        if (itemType === 'post') delete myVotes.posts[id];
        else delete myVotes.comments[id];
    } else {
        const payload = {
            user_id: currentUser.id,
            vote_type: typeValue,
            post_id: itemType === 'post' ? id : null,
            comment_id: itemType === 'comment' ? id : null
        };
        await sb.from('votes').upsert(payload, { onConflict: itemType === 'post' ? 'user_id, post_id' : 'user_id, comment_id' });
        
        if (itemType === 'post') myVotes.posts[id] = typeValue;
        else myVotes.comments[id] = typeValue;
    }
}

function updateVoteUI(id, newValue, type) {
    // Helper to update one set of buttons
    const updateButtons = (prefix) => {
        const idPrefix = prefix ? `${prefix}-` : ''; 
        const btnUp = document.getElementById(`${idPrefix}btn-up-${type}-${id}`);
        const btnDown = document.getElementById(`${idPrefix}btn-down-${type}-${id}`);
        const scoreSpan = document.getElementById(`${idPrefix}score-${type}-${id}`);

        if (!btnUp || !btnDown || !scoreSpan) return;

        // Calculate Score Change
        let currentScore = parseInt(scoreSpan.innerText) || 0;
        const oldValue = (type === 'post' ? myVotes.posts[id] : myVotes.comments[id]) || 0;

        if (oldValue === 1) currentScore--;
        if (oldValue === -1) currentScore++;
        if (newValue === 1) currentScore++;
        if (newValue === -1) currentScore--;

        scoreSpan.innerText = currentScore;
        btnUp.classList.remove('active');
        btnDown.classList.remove('active');
        if (newValue === 1) btnUp.classList.add('active');
        if (newValue === -1) btnDown.classList.add('active');
    };

    // Update BOTH Feed and Detail views
    updateButtons('');       // Main Feed
    updateButtons('detail'); // Expanded View
}

// ================= POSTS & FEED =================

async function loadPosts() {
    const feed = document.getElementById('postsFeed');
    feed.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    let query = sb.from('posts').select(`
        *,
        subreddits (name),
        profiles (username, fake_identity, role)
    `).order('created_at', { ascending: false });

    if (currentSubFilter !== 'all') {
        query = query.eq('subreddit_id', currentSubFilter);
    }

    const { data: posts, error } = await query;

    if (error || !posts) {
        feed.innerHTML = '<div class="empty-state">Failed to load posts.</div>';
        return;
    }
    
    if (posts.length === 0) {
        feed.innerHTML = '<div class="empty-state"><h3>No posts yet</h3><p>Be the first to share something!</p></div>';
        return;
    }

    feed.innerHTML = posts.map(post => {
        const score = (post.up_votes || 0) - (post.down_votes || 0);
        const myVote = myVotes.posts[post.id] ||
