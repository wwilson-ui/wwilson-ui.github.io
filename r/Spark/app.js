// app.js - FIXED & SIMPLIFIED

let sb = null;
let currentUser = null;
let isTeacher = false;
let currentSubFilter = 'all';
let currentOpenPostId = null; 
let myVotes = { posts: {}, comments: {} }; 

// Fun identity generator
const ADJECTIVES = ['Happy', 'Brave', 'Calm', 'Swift', 'Wise', 'Bright', 'Clever', 'Kind', 'Bold'];
const ANIMALS = ['Badger', 'Fox', 'Owl', 'Eagle', 'Bear', 'Dolphin', 'Wolf', 'Hawk', 'Tiger'];

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. Initialize Supabase
        if (typeof window.supabase === 'undefined') throw new Error('Supabase SDK not loaded.');
        sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

        // 2. Setup Global Listeners
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal('createPostModal');
                closeModal('createSubModal');
                closeModal('postDetailModal');
            }
        });

        // 3. Run Core Logic
        await checkUser();     
        await loadSubreddits();
        await loadPosts();     
        setupFormListeners();

    } catch (err) {
        console.error("CRITICAL APP ERROR:", err);
        document.body.innerHTML = `<div style="padding:20px; color:red; text-align:center;"><h3>Something went wrong</h3><p>${err.message}</p></div>`;
    }
});

// ================= AUTHENTICATION (ROBUST) =================

async function checkUser() {
    const { data: { session } } = await sb.auth.getSession();
    const authSection = document.getElementById('authSection');
    const actionBar = document.getElementById('actionBar');

    if (session) {
        // --- LOGGED IN ---
        console.log('✅ User Session Found:', session.user.email);

        // 1. Try to fetch profile
        let { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();

        // 2. FALLBACK: If profile missing, create it client-side immediately
        if (!profile) {
            console.log('⚠️ Profile missing. Creating one now...');
            const newProfile = {
                id: session.user.id,
                email: session.user.email,
                username: session.user.email.split('@')[0],
                role: 'student' // Default role
            };
            
            const { error: insertError } = await sb.from('profiles').insert([newProfile]);
            
            if (insertError) {
                console.error('❌ Could not auto-create profile:', insertError);
                // We don't return here; we let the UI load as "Guest" to prevent crashing
            } else {
                profile = newProfile; // Success! Use this profile.
            }
        }

        // 3. Set User State
        if (profile) {
            currentUser = profile;
            // Teacher Override
            if (currentUser.email === 'wwilson@mtps.us') {
                currentUser.role = 'teacher';
            }
            isTeacher = currentUser.role === 'teacher';
            
            await loadMyVotes(); // Load votes safely
            
            // Render User UI
            authSection.innerHTML = `
                <div style="display:flex; gap:10px; align-items:center;">
                    <div style="text-align:right; line-height:1.2;">
                        <div style="font-weight:bold; font-size:0.9rem;">${currentUser.username || 'User'}</div>
                        <div style="font-size:0.75rem; color:${isTeacher ? '#0079D3' : '#00D9A5'}; font-weight:bold; text-transform:uppercase;">${isTeacher ? 'TEACHER' : 'STUDENT'}</div>
                    </div>
                    <button class="google-btn" onclick="signOut()" style="padding: 4px 10px; font-size: 0.8rem;">Sign Out</button>
                </div>
            `;
            
            if (actionBar) actionBar.style.display = 'flex';
            const sidebarAddBtn = document.getElementById('sidebarAddBtn');
            if (sidebarAddBtn) sidebarAddBtn.style.display = isTeacher ? 'flex' : 'none';
        }

    } else {
        // --- NOT LOGGED IN ---
        console.log('ℹ️ No User Session');
        authSection.innerHTML = `
            <button class="google-btn" onclick="signIn()">
                <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg" alt="G" style="width:18px; height:18px;">
                Sign in with Google
            </button>
        `;
        if (actionBar) actionBar.style.display = 'none';
    }
}

// Global Auth Functions
window.signIn = async () => {
    const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'https://wwilson-ui.github.io/r/Spark/' }
    });
    if (error) alert(error.message);
};

window.signOut = async () => {
    await sb.auth.signOut();
    location.reload();
};

// ================= VOTING SYSTEM =================

async function loadMyVotes() {
    if (!currentUser) return;
    const { data } = await sb.from('votes').select('*').eq('user_id', currentUser.id);
    myVotes = { posts: {}, comments: {} }; // Reset
    if (data) {
        data.forEach(v => {
            if (v.post_id) myVotes.posts[v.post_id] = v.vote_type;
            if (v.comment_id) myVotes.comments[v.comment_id] = v.vote_type;
        });
    }
}

window.vote = async (id, typeValue, itemType = 'post') => {
    if (!currentUser) return alert("Please sign in to vote.");

    const currentVote = itemType === 'post' ? myVotes.posts[id] : myVotes.comments[id];
    let action = 'upsert';
    
    // Toggle off
    if (currentVote === typeValue) action = 'delete';

    // UI Update
    updateVoteUI(id, action === 'delete' ? 0 : typeValue, itemType);

    // DB Update
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
};

function updateVoteUI(id, newValue, type) {
    const updateButtons = (prefix) => {
        const idPrefix = prefix ? `${prefix}-` : ''; 
        const btnUp = document.getElementById(`${idPrefix}btn-up-${type}-${id}`);
        const btnDown = document.getElementById(`${idPrefix}btn-down-${type}-${id}`);
        const scoreSpan = document.getElementById(`${idPrefix}score-${type}-${id}`);

        if (!btnUp || !btnDown || !scoreSpan) return;

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

    updateButtons('');       
    updateButtons('detail'); 
}

// ================= FEED & POSTS =================

async function loadPosts() {
    const feed = document.getElementById('postsFeed');
    feed.innerHTML = '<div style="padding:40px; text-align:center;">Loading...</div>';

    let query = sb.from('posts').select(`
        *,
        subreddits (name),
        profiles (username, role)
    `).order('created_at', { ascending: false });

    if (currentSubFilter !== 'all') {
        query = query.eq('subreddit_id', currentSubFilter);
    }

    const { data: posts, error } = await query;

    if (error || !posts) {
        feed.innerHTML = '<div style="text-align:center; padding:20px;">Failed to load posts.</div>';
        return;
    }

    if (posts.length === 0) {
        feed.innerHTML = '<div style="text-align:center; padding:40px; color:#777;">No posts yet.</div>';
        return;
    }

    // Cache for detail view
    window.currentPostsCache = posts;

    feed.innerHTML = posts.map(post => {
        const score = (post.up_votes || 0) - (post.down_votes || 0);
        const myVote = myVotes.posts[post.id] || 0;
        const authorName = post.profiles ? post.profiles.username : 'Unknown';
        const realIdentity = (post.profiles && post.profiles.role === 'teacher') ? ' (Teacher)' : ''; 
        const subName = post.subreddits ? post.subreddits.name : 'general';

        return `
        <div class="post-card clickable-card" onclick="openPostPageFromClick(event, '${post.id}')">
            <div class="post-header">
                <strong>r/${escapeHtml(subName)}</strong>
                <span>•</span>
                <span>Posted by ${escapeHtml(authorName)} <span style="color:#FF4500;">${realIdentity}</span></span>
            </div>
            <div class="post-title" style="font-size: 1.1rem; margin-bottom: 5px;">${escapeHtml(post.title)}</div>
            
            <div class="post-footer">
                <button id="btn-up-post-${post.id}" class="vote-btn up ${myVote === 1 ? 'active' : ''}" onclick="event.stopPropagation(); vote('${post.id}', 1)">⬆</button>
                <span id="score-post-${post.id}" class="score-text">${score}</span>
                <button id="btn-down-post-${post.id}" class="vote-btn down ${myVote === -1 ? 'active' : ''}" onclick="event.stopPropagation(); vote('${post.id}', -1)">⬇</button>
                <span style="font-weight:normal; font-size:0.8rem; margin-left:15px; color:#878A8C;">Click to view comments</span>
            </div>
        </div>
        `;
    }).join('');
}

window.openPostPageFromClick = (e, postId) => {
    if (e.target.closest('button')) return; 
    const post = window.currentPostsCache.find(p => p.id === postId);
    if (post) {
        const authorName = post.profiles ? post.profiles.username : 'Unknown';
        const realIdentity = (post.profiles && post.profiles.role === 'teacher') ? ' (Teacher)' : '';
        openPostPage(post, authorName, realIdentity);
    }
};

function openPostPage(post, authorName, realIdentity) {
    currentOpenPostId = post.id;
    const modal = document.getElementById('postDetailModal');
    const contentDiv = document.getElementById('postDetailContent');
    
    const score = (post.up_votes || 0) - (post.down_votes || 0);
    const myVote = myVotes.posts[post.id] || 0;

    contentDiv.innerHTML = `
        <div style="margin-bottom: 15px;">
            <span style="font-size: 0.9rem; color: #555;">r/${post.subreddits ? escapeHtml(post.subreddits.name) : 'Unknown'}</span>
            <span style="font-size: 0.9rem; color: #777;"> • Posted by ${authorName} <span style="color:#FF4500;">${realIdentity}</span></span>
        </div>

        <h2 style="font-size: 1.5rem; margin-bottom: 10px;">${escapeHtml(post.title)}</h2>

        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
            <button id="detail-btn-up-post-${post.id}" class="vote-btn up ${myVote === 1 ? 'active' : ''}" onclick="vote('${post.id}', 1, 'post')">⬆</button>
            <span id="detail-score-post-${post.id}" class="score-text" style="font-size: 1.1rem;">${score}</span>
            <button id="detail-btn-down-post-${post.id}" class="vote-btn down ${myVote === -1 ? 'active' : ''}" onclick="vote('${post.id}', -1, 'post')">⬇</button>
        </div>

        ${post.image_url ? `<img src="${escapeHtml(post.image_url)}" style="width:100%; max-height:600px; object-fit:contain; border-radius:8px; margin-bottom:15px; display:block;">` : ''}
        ${post.content ? `<div style="font-size: 1rem; line-height: 1.6; margin-bottom: 15px; white-space: pre-wrap;">${escapeHtml(post.content)}</div>` : ''}
        ${post.url ? `<a href="${escapeHtml(post.url)}" target="_blank" style="display:block; color:#0079D3; margin-bottom:15px;">🔗 ${escapeHtml(post.url)}</a>` : ''}

        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">

        <div style="margin-bottom: 20px; display: ${currentUser ? 'block' : 'none'};">
            <textarea id="newCommentText" class="comment-box" placeholder="What are your thoughts?" rows="3" style="width:100%; margin-bottom:10px; padding:10px;"></textarea>
            <button class="submit-btn small-btn" onclick="submitComment('${post.id}')">Comment</button>
        </div>

        <div id="detailCommentsList"></div>
    `;

    modal.classList.add('active');
    loadDetailComments(post.id);
}

// ================= COMMENTS =================

async function loadDetailComments(postId) {
    const list = document.getElementById('detailCommentsList');
    list.innerHTML = 'Loading comments...';
    
    const { data: comments } = await sb
        .from('comments')
        .select('*, profiles(username, role)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

    if (!comments || comments.length === 0) {
        list.innerHTML = '<p style="color:#777;">No comments yet.</p>';
        return;
    }

    list.innerHTML = comments.map(c => {
        const score = (c.up_votes || 0) - (c.down_votes || 0);
        const myVote = myVotes.comments[c.id] || 0;
        const author = c.profiles ? c.profiles.username : 'Unknown';
        
        return `
            <div class="comment" style="margin-bottom:15px; padding:10px; background:#f8f9fa; border-radius:4px;">
                <div style="font-size:0.85rem; color:#555; margin-bottom:4px;">${escapeHtml(author)}</div>
                <div style="margin-bottom:8px;">${escapeHtml(c.content)}</div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <button id="btn-up-comment-${c.id}" class="vote-btn up ${myVote === 1 ? 'active' : ''}" onclick="vote('${c.id}', 1, 'comment')">⬆</button>
                    <span id="score-comment-${c.id}" class="score-text">${score}</span>
                    <button id="btn-down-comment-${c.id}" class="vote-btn down ${myVote === -1 ? 'active' : ''}" onclick="vote('${c.id}', -1, 'comment')">⬇</button>
                </div>
            </div>
        `;
    }).join('');
}

window.submitComment = async (postId) => {
    if (!currentUser) return;
    const txt = document.getElementById('newCommentText').value.trim();
    if (!txt) return;

    const { error } = await sb.from('comments').insert([{
        post_id: postId,
        user_id: currentUser.id,
        content: txt
    }]);

    if (!error) {
        document.getElementById('newCommentText').value = '';
        loadDetailComments(postId);
    }
};

// ================= SIDEBAR & UTILS =================

async function loadSubreddits() {
    const list = document.getElementById('subredditList');
    const { data: subs } = await sb.from('subreddits').select('*');
    
    if (subs) {
        list.innerHTML = `
            <li onclick="filterSub('all')" class="${currentSubFilter === 'all' ? 'active' : ''}">All Posts</li>
            ${subs.map(s => `
                <li onclick="filterSub('${s.id}')" class="${currentSubFilter === s.id ? 'active' : ''}">r/${escapeHtml(s.name)}</li>
            `).join('')}
        `;
        
        // Populate dropdown
        const postSelect = document.getElementById('postSubreddit');
        if (postSelect) {
            postSelect.innerHTML = subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        }
    }
}

window.filterSub = (subId) => {
    currentSubFilter = subId;
    loadPosts();
    loadSubreddits();
};

function setupFormListeners() {
    const postForm = document.getElementById('createPostForm');
    if (postForm) {
        postForm.onsubmit = async (e) => {
            e.preventDefault();
            const { error } = await sb.from('posts').insert([{
                title: document.getElementById('postTitle').value,
                content: document.getElementById('postContent').value,
                url: document.getElementById('postLink').value,
                image_url: document.getElementById('postImage').value,
                subreddit_id: document.getElementById('postSubreddit').value,
                user_id: currentUser.id
            }]);
            if (!error) { closeModal('createPostModal'); loadPosts(); e.target.reset(); }
        };
    }
    const subForm = document.getElementById('createSubForm');
    if (subForm) {
        subForm.onsubmit = async (e) => {
            e.preventDefault();
            const { error } = await sb.from('subreddits').insert([{
                name: document.getElementById('subName').value, 
                created_by: currentUser.id
            }]);
            if (!error) { closeModal('createSubModal'); loadSubreddits(); e.target.reset(); }
        };
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

window.openCreateModal = () => {
    if(!currentUser) return alert("Please sign in to post.");
    document.getElementById('createPostModal').classList.add('active');
};
window.openSubModal = () => document.getElementById('createSubModal').classList.add('active');
window.closeModal = (id) => document.getElementById(id).classList.remove('active');
