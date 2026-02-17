// app.js - CLEAN & STABLE VERSION

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
        alert('Supabase not loaded. Check your internet connection.');
        return;
    }

    // 2. Global Event Listeners
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal('createPostModal');
            closeModal('createSubModal');
            closeModal('postDetailModal');
        }
    });

    // 3. Start the App
    await checkUser();     
    loadSubreddits();
    loadPosts();
    setupFormListeners();
});

// ================= AUTHENTICATION (SELF-HEALING) =================

async function checkUser() {
    const { data: { session } } = await sb.auth.getSession();
    const authSection = document.getElementById('authSection');
    const actionBar = document.getElementById('actionBar');

    if (session) {
        console.log('✅ Session found:', session.user.email);

        // 1. Try to fetch existing profile
        let { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();

        // 2. AUTO-FIX: If profile is missing, create it immediately
        if (!profile) {
            console.log('⚠️ New user detected. Creating profile...');
            const { data: newProfile, error } = await sb.from('profiles').insert([{
                id: session.user.id,
                email: session.user.email,
                username: session.user.email.split('@')[0], // Default username from email
                role: 'student'
            }]).select().single();

            if (error) {
                console.error('❌ Critical Error: Could not create profile.', error);
                alert('Login failed: Could not create user profile.');
                return;
            }
            profile = newProfile;
        }

        // 3. Set Global User State
        currentUser = profile;

        // Teacher Override
        if (currentUser.email === 'wwilson@mtps.us') {
            currentUser.role = 'teacher';
        }
        isTeacher = currentUser.role === 'teacher';

        // Load User Data
        await loadMyVotes();

        // 4. Update UI
        authSection.innerHTML = `
            <div style="display:flex; gap:10px; align-items:center;">
                <div style="text-align:right; line-height:1.2;">
                    <div style="font-weight:bold; font-size:0.9rem;">${currentUser.username}</div>
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
        authSection.innerHTML = `
            <button class="google-btn" onclick="signIn()">
                <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg" alt="G" style="width:18px; height:18px;">
                Sign in with Google
            </button>
        `;
        if (actionBar) actionBar.style.display = 'none';
    }
}

// Auth Helpers
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

    // Toggle off if clicking the same vote button
    if (currentVote === typeValue) action = 'delete';

    // 1. Optimistic UI Update
    updateVoteUI(id, action === 'delete' ? 0 : typeValue, itemType);

    // 2. Database Update
    if (action === 'delete') {
        let query = sb.from('votes').delete().eq('user_id', currentUser.id);
        if (itemType === 'post') query = query.eq('post_id', id);
        else query = query.eq('comment_id', id);
        await query;

        // Update local cache
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

        // Update local cache
        if (itemType === 'post') myVotes.posts[id] = typeValue;
        else myVotes.comments[id] = typeValue;
    }
};

function updateVoteUI(id, newValue, type) {
    // Helper to update button states
    const updateButtons = (prefix) => {
        const idPrefix = prefix ? `${prefix}-` : ''; 
        const btnUp = document.getElementById(`${idPrefix}btn-up-${type}-${id}`);
        const btnDown = document.getElementById(`${idPrefix}btn-down-${type}-${id}`);
        const scoreSpan = document.getElementById(`${idPrefix}score-${type}-${id}`);

        if (!btnUp || !btnDown || !scoreSpan) return;

        let currentScore = parseInt(scoreSpan.innerText) || 0;
        const oldValue = (type === 'post' ? myVotes.posts[id] : myVotes.comments[id]) || 0;

        // Undo old vote locally
        if (oldValue === 1) currentScore--;
        if (oldValue === -1) currentScore++;

        // Apply new vote locally
        if (newValue === 1) currentScore++;
        if (newValue === -1) currentScore--;

        scoreSpan.innerText = currentScore;
        btnUp.classList.remove('active');
        btnDown.classList.remove('active');
        
        if (newValue === 1) btnUp.classList.add('active');
        if (newValue === -1) btnDown.classList.add('active');
    };

    // Update BOTH Main Feed and Detail View
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
        feed.innerHTML = '<div style="text-align:center; padding:40px; color:#777;">No posts yet. Be the first!</div>';
        return;
    }

    // Cache posts for quick access
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
    // Don't open if clicking a button
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
    const modal = document.getElementById('postDetailModal'); // Assuming you have this ID in index.html
    // If you used 'postView' in your previous attempt, change the ID here to match your HTML
    // Based on "index.html" snippet provided earlier, users might have "postDetailModal" or "postView" div
    // We will assume the "Single Page App" style (postView) based on previous conversations.
    // However, if you are using the Modal, ensure the ID matches.
    // Let's use the layout from the "Single Page" approach which seemed preferred:
    
    // Toggle Views
    const feedView = document.getElementById('feedView');
    const postView = document.getElementById('postView');
    
    // NOTE: If you are using Modals, swap this logic. 
    // Assuming "Page View" style:
    if (feedView && postView) {
        feedView.style.display = 'none';
        postView.style.display = 'block';
        window.scrollTo(0, 0);
    } else {
        // Fallback to Modal if elements missing
        const modal = document.getElementById('postDetailModal');
        if (modal) modal.classList.add('active');
    }

    // Populate Content
    const score = (post.up_votes || 0) - (post.down_votes || 0);
    const myVote = myVotes.posts[post.id] || 0;

    // Fill elements (Check your index.html IDs!)
    setText('detailSub', `r/${post.subreddits ? post.subreddits.name : 'Unknown'}`);
    setHTML('detailAuthor', `${authorName} <span style="color:#FF4500;">${realIdentity}</span>`);
    setText('detailTitle', post.title);
    setHTML('detailContent', post.content ? escapeHtml(post.content).replace(/\n/g, '<br>') : '');
    
    const imgEl = document.getElementById('detailImage');
    if (imgEl) {
        imgEl.src = post.image_url || '';
        imgEl.style.display = post.image_url ? 'block' : 'none';
    }
    
    const linkEl = document.getElementById('detailLink');
    if (linkEl) {
        linkEl.href = post.url || '#';
        linkEl.textContent = post.url ? `🔗 ${post.url}` : '';
        linkEl.style.display = post.url ? 'block' : 'none';
    }

    // Insert Vote Buttons via JS to ensure IDs are unique ('detail-')
    // We look for a container or inject before title
    const titleEl = document.getElementById('detailTitle');
    if (titleEl) {
        // Remove old vote container if exists
        const oldVote = document.getElementById('detail-vote-container');
        if (oldVote) oldVote.remove();

        const voteDiv = document.createElement('div');
        voteDiv.id = 'detail-vote-container';
        voteDiv.style.cssText = 'display:flex; align-items:center; gap:10px; margin-bottom:15px;';
        voteDiv.innerHTML = `
            <button id="detail-btn-up-post-${post.id}" class="vote-btn up ${myVote === 1 ? 'active' : ''}" onclick="vote('${post.id}', 1, 'post')">⬆</button>
            <span id="detail-score-post-${post.id}" class="score-text" style="font-size: 1.1rem;">${score}</span>
            <button id="detail-btn-down-post-${post.id}" class="vote-btn down ${myVote === -1 ? 'active' : ''}" onclick="vote('${post.id}', -1, 'post')">⬇</button>
        `;
        titleEl.parentNode.insertBefore(voteDiv, titleEl.nextSibling); // Insert AFTER title
    }

    // Show Comment Input
    const commentInput = document.getElementById('detailCommentInput');
    if (commentInput) commentInput.style.display = currentUser ? 'block' : 'none';

    loadDetailComments(post.id);
}

// Helper to safely set text
function setText(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }
function setHTML(id, htm) { const el = document.getElementById(id); if (el) el.innerHTML = htm; }

// ================= COMMENTS =================

async function loadDetailComments(postId) {
    const list = document.getElementById('detailCommentsList');
    if (!list) return;
    
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
    
    if (subs && list) {
        list.innerHTML = `
            <li onclick="filterSub('all')" class="${currentSubFilter === 'all' ? 'active' : ''}">All Posts</li>
            ${subs.map(s => `
                <li onclick="filterSub('${s.id}')" class="${currentSubFilter === s.id ? 'active' : ''}">r/${escapeHtml(s.name)}</li>
            `).join('')}
        `;
        
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
    const modal = document.getElementById('createPostModal');
    if(modal) modal.classList.add('active');
};
window.openSubModal = () => document.getElementById('createSubModal').classList.add('active');
window.closeModal = (id) => {
    const el = document.getElementById(id);
    if(el) el.classList.remove('active');
};
