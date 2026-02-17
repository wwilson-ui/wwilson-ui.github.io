// app.js

let sb = null;
let currentUser = null;
let isTeacher = false;
let currentSubFilter = 'all';
let currentOpenPostId = null; 
let myVotes = { posts: {}, comments: {} }; 

const ADJECTIVES = ['Happy', 'Brave', 'Calm', 'Swift', 'Wise', 'Bright', 'Clever', 'Kind', 'Bold'];
const ANIMALS = ['Badger', 'Fox', 'Owl', 'Eagle', 'Bear', 'Dolphin', 'Wolf', 'Hawk', 'Tiger'];

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.supabase !== 'undefined') {
        sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    } else { 
        alert('Supabase not loaded'); 
        return; 
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal('createPostModal');
            closeModal('createSubModal');
        }
    });

    await checkUser();
    loadSubreddits();
    loadPosts(); 
    setupFormListeners();
});

// ================= AUTHENTICATION (UPDATED) =================
async function checkUser() {
    const { data: { session } } = await sb.auth.getSession();
    const authSection = document.getElementById('authSection');
    const actionBar = document.getElementById('actionBar');

    if (session) {
        console.log('✅ Session active:', session.user.email);
        
        // --- POLLING LOGIC START ---
        // We wait up to 5 seconds for the SQL Trigger to create the profile
        let profile = null;
        let attempts = 0;
        
        while (!profile && attempts < 10) {
            const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
            if (data) {
                profile = data;
            } else {
                console.log(`⏳ Waiting for profile creation... (${attempts + 1}/10)`);
                await new Promise(r => setTimeout(r, 500)); // Wait 0.5s
            }
            attempts++;
        }
        // --- POLLING LOGIC END ---

        if (!profile) {
            // Failsafe: If SQL failed, use session data temporarily so app doesn't crash
            console.error('❌ Profile missing from DB. Using session fallback.');
            currentUser = { 
                id: session.user.id, 
                email: session.user.email, 
                username: session.user.email.split('@')[0], 
                role: 'student' 
            };
        } else {
            currentUser = profile;
        }
        
        // Teacher Check
        if (currentUser.email === 'wwilson@mtps.us') {
            currentUser.role = 'teacher';
        }
        isTeacher = currentUser.role === 'teacher';

        // Load Votes
        await loadMyVotes();

        // Render UI
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
        console.log('ℹ️ No session found');
        authSection.innerHTML = `
            <button class="google-btn" onclick="signIn()">
                <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg" alt="G" style="width:18px; height:18px;">
                Sign in with Google
            </button>
        `;
        if (actionBar) actionBar.style.display = 'none';
    }
}

async function signIn() {
    await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'https://wwilson-ui.github.io/r/Spark/' }
    });
}

async function signOut() {
    await sb.auth.signOut();
    location.reload();
}

// ================= NAVIGATION =================
function showFeed() {
    document.getElementById('postView').style.display = 'none';
    document.getElementById('feedView').style.display = 'block';
    currentOpenPostId = null;
    loadPosts(); // Refresh to show latest votes
}

function openPostPage(post, authorName, realIdentity) {
    currentOpenPostId = post.id;
    console.log('📖 Opening post:', post.id);

    // Toggle Views
    document.getElementById('feedView').style.display = 'none';
    document.getElementById('postView').style.display = 'block';
    window.scrollTo(0, 0);

    // Fill Data
    document.getElementById('detailSub').textContent = `r/${post.subreddits ? post.subreddits.name : 'Unknown'}`;
    document.getElementById('detailAuthor').innerHTML = `${authorName} <span style="color:#ff4500;">${realIdentity}</span>`;
    document.getElementById('detailTitle').textContent = post.title;
    
    const contentDiv = document.getElementById('detailContent');
    contentDiv.innerHTML = post.content ? escapeHtml(post.content).replace(/\n/g, '<br>') : '';
    
    const imgEl = document.getElementById('detailImage');
    if (post.image_url) { imgEl.src = post.image_url; imgEl.style.display = 'block'; }
    else { imgEl.style.display = 'none'; }
    
    const linkEl = document.getElementById('detailLink');
    if (post.url) { linkEl.href = post.url; linkEl.textContent = `🔗 ${post.url}`; linkEl.style.display = 'block'; }
    else { linkEl.style.display = 'none'; }

    // VOTING (Using detail- prefix)
    const score = (post.up_votes || 0) - (post.down_votes || 0);
    const myVote = myVotes.posts[post.id] || 0;

    // Inject Vote Buttons
    const titleEl = document.getElementById('detailTitle');
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
    // Insert AFTER title
    if(titleEl.nextSibling) {
        titleEl.parentNode.insertBefore(voteDiv, titleEl.nextSibling);
    } else {
        titleEl.parentNode.appendChild(voteDiv);
    }

    // Show Comments Input
    document.getElementById('detailCommentInput').style.display = currentUser ? 'block' : 'none';
    loadDetailComments(post.id);
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
    
    if (currentVote === typeValue) action = 'delete';

    updateVoteUI(id, action === 'delete' ? 0 : typeValue, itemType);

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
    feed.innerHTML = '<div style="padding:20px; text-align:center;">Loading...</div>';
    
    let query = sb.from('posts').select(`*, subreddits(name), profiles(username, role)`).order('created_at', { ascending: false });
    if (currentSubFilter !== 'all') query = query.eq('subreddit_id', currentSubFilter);

    const { data: posts, error } = await query;
    if (error) { feed.innerHTML = 'Error loading posts'; return; }

    feed.innerHTML = '';
    if (posts.length === 0) {
        feed.innerHTML = '<div style="padding:40px; text-align:center; color:#777;">No posts yet. Be the first!</div>';
        return;
    }

    posts.forEach(post => feed.appendChild(createPostElement(post)));
}

function createPostElement(post) {
    const div = document.createElement('div');
    div.className = 'post-card clickable-card';
    
    const isAuthor = currentUser && currentUser.id === post.user_id;
    const authorName = post.profiles ? post.profiles.username : 'Unknown';
    const realIdentity = (post.profiles && post.profiles.role === 'teacher') ? ' (Teacher)' : ''; 

    const myVote = myVotes.posts[post.id] || 0;
    const score = (post.up_votes || 0) - (post.down_votes || 0);

    div.onclick = (e) => {
        if (e.target.closest('button')) return;
        openPostPage(post, authorName, realIdentity);
    };

    const deleteBtn = isTeacher ? `<button class="delete-icon" onclick="deletePost('${post.id}')">🗑</button>` : '';

    div.innerHTML = `
        <div class="post-header">
            <strong>r/${post.subreddits ? post.subreddits.name : 'Unknown'}</strong>
            <span>•</span>
            <span>Posted by ${escapeHtml(authorName)} <span style="color:#ff4500; font-size:0.8em;">${realIdentity}</span></span>
            <span style="flex-grow:1"></span>
            ${deleteBtn}
        </div>
        <div class="post-title" style="font-size: 1.1rem; margin-bottom: 5px;">${escapeHtml(post.title)}</div>
        
        <div class="post-footer">
            <button id="btn-up-post-${post.id}" class="vote-btn up ${myVote === 1 ? 'active' : ''}" onclick="vote('${post.id}', 1, 'post')">⬆</button>
            <span id="score-post-${post.id}" class="score-text">${score}</span>
            <button id="btn-down-post-${post.id}" class="vote-btn down ${myVote === -1 ? 'active' : ''}" onclick="vote('${post.id}', -1, 'post')">⬇</button>
            <span style="font-weight:normal; font-size:0.8rem; margin-left:10px; color:#878A8C;">Click to view comments</span>
        </div>
    `;
    return div;
}

// ================= COMMENTS =================
async function loadDetailComments(postId) {
    const list = document.getElementById('detailCommentsList');
    list.innerHTML = 'Loading comments...';
    
    const { data: comments } = await sb.from('comments')
        .select(`*, profiles(username, role)`)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

    const tree = buildCommentTree(comments || []);
    renderComments(tree, list);
}

async function submitNewComment() {
    const txt = document.getElementById('newCommentText');
    const content = txt.value.trim();
    if (!content) return;

    const { error } = await sb.from('comments').insert([{
        post_id: currentOpenPostId,
        user_id: currentUser.id,
        content: content
    }]);

    if (error) alert(error.message);
    else {
        txt.value = '';
        loadDetailComments(currentOpenPostId);
    }
}

function buildCommentTree(comments) {
    const map = {}; const roots = [];
    comments.forEach(c => { c.children = []; map[c.id] = c; });
    comments.forEach(c => {
        if (c.parent_id && map[c.parent_id]) map[c.parent_id].children.push(c);
        else roots.push(c);
    });
    return roots;
}

function renderComments(comments, container) {
    container.innerHTML = '';
    if (comments.length === 0) { container.innerHTML = '<div style="color:#999; font-style:italic;">No comments yet.</div>'; return; }

    comments.forEach(c => {
        const div = document.createElement('div');
        div.className = 'comment';
        const authorName = c.profiles ? c.profiles.username : 'Unknown';
        const realIdentity = (c.profiles && c.profiles.role === 'teacher') ? ' (Teacher)' : ''; 
        const deleteBtn = isTeacher ? `<button class="delete-sub-x" onclick="deleteComment('${c.id}')">✕</button>` : '';

        const myVote = myVotes.comments[c.id] || 0;
        const score = (c.up_votes || 0) - (c.down_votes || 0);

        div.innerHTML = `
            <div class="comment-header">
                <strong>${escapeHtml(authorName)}</strong> <span style="font-size:0.8em; color:#ff4500;">${realIdentity}</span>
                ${deleteBtn}
            </div>
            <div style="margin-top:2px;">${escapeHtml(c.content)}</div>
            
            <div style="display:flex; align-items:center; gap:10px; margin-top:5px;">
                <button id="btn-up-comment-${c.id}" class="vote-btn up ${myVote === 1 ? 'active' : ''}" onclick="vote('${c.id}', 1, 'comment')">⬆</button>
                <span id="score-comment-${c.id}" class="score-text" style="font-size:0.8rem">${score}</span>
                <button id="btn-down-comment-${c.id}" class="vote-btn down ${myVote === -1 ? 'active' : ''}" onclick="vote('${c.id}', -1, 'comment')">⬇</button>
                
                <span style="font-size:0.8rem; color:#888; cursor:pointer; margin-left:10px;" onclick="replyToComment('${c.id}', '${authorName}')">Reply</span>
            </div>

            <div id="reply-box-${c.id}" style="display:none; margin-top:5px;">
                <input type="text" id="reply-input-${c.id}" placeholder="Reply to ${authorName}..." style="width:100%; padding:5px;">
                <button onclick="submitReply('${c.id}')" style="margin-top:5px; padding:2px 8px;">Send</button>
            </div>
            <div id="children-${c.id}" style="margin-left:15px; border-left:2px solid #eee; padding-left:10px;"></div>
        `;
        container.appendChild(div);
        if (c.children.length) renderComments(c.children, div.querySelector(`#children-${c.id}`));
    });
}

function replyToComment(commentId, name) {
    if (!currentUser) return alert("Please sign in to reply");
    const box = document.getElementById(`reply-box-${commentId}`);
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

async function submitReply(parentId) {
    const input = document.getElementById(`reply-input-${parentId}`);
    const content = input.value.trim();
    if (!content) return;

    const { error } = await sb.from('comments').insert([{
        post_id: currentOpenPostId,
        user_id: currentUser.id,
        content: content,
        parent_id: parentId
    }]);

    if (!error) loadDetailComments(currentOpenPostId);
}

// ================= SIDEBAR & UTILS =================
async function loadSubreddits() {
    const list = document.getElementById('subredditList');
    const postSelect = document.getElementById('postSubreddit');
    const { data: subs } = await sb.from('subreddits').select('*').order('name');
    
    list.innerHTML = ''; postSelect.innerHTML = '';
    
    const allLi = document.createElement('li');
    allLi.className = `sub-item ${currentSubFilter === 'all' ? 'active' : ''}`;
    allLi.innerHTML = `<span>r/All</span>`;
    allLi.onclick = () => { currentSubFilter = 'all'; showFeed(); loadSubreddits(); loadPosts(); };
    list.appendChild(allLi);

    if (subs) subs.forEach(sub => {
        const li = document.createElement('li');
        li.className = `sub-item ${currentSubFilter === sub.id ? 'active' : ''}`;
        let html = `<span onclick="filterSub('${sub.id}')">r/${escapeHtml(sub.name)}</span>`;
        if (isTeacher) html += `<span class="delete-sub-x" onclick="deleteSub('${sub.id}', '${sub.name}')">✕</span>`;
        li.innerHTML = html;
        list.appendChild(li);

        const opt = document.createElement('option');
        opt.value = sub.id; opt.textContent = sub.name;
        postSelect.appendChild(opt);
    });
}

function filterSub(subId) { currentSubFilter = subId; loadSubreddits(); loadPosts(); }

async function deletePost(id) { if(confirm('Delete post?')) { await sb.from('posts').delete().eq('id', id); loadPosts(); } }
async function deleteSub(id, name) { if(confirm(`Delete r/${name}?`)) { await sb.from('subreddits').delete().eq('id', id); loadSubreddits(); loadPosts(); } }
async function deleteComment(id) { if(confirm('Delete comment?')) { await sb.from('comments').delete().eq('id', id); loadDetailComments(currentOpenPostId); } }

function setupFormListeners() {
    document.getElementById('createPostForm').onsubmit = async (e) => {
        e.preventDefault();
        const { error } = await sb.from('posts').insert([{
            title: document.getElementById('postTitle').value,
            content: document.getElementById('postContent').value,
            url: document.getElementById('postLink').value,
            image_url: document.getElementById('postImage').value,
            subreddit_id: document.getElementById('postSubreddit').value,
            user_id: currentUser.id
        }]);
        if (!error) { closeModal('createPostModal'); loadPosts(); }
    };
    document.getElementById('createSubForm').onsubmit = async (e) => {
        e.preventDefault();
        const { error } = await sb.from('subreddits').insert([{
            name: document.getElementById('subName').value, created_by: currentUser.id
        }]);
        if (!error) { closeModal('createSubModal'); loadSubreddits(); }
    };
}
window.openCreateModal = () => document.getElementById('createPostModal').classList.add('active');
window.openSubModal = () => document.getElementById('createSubModal').classList.add('active');
window.closeModal = (id) => document.getElementById(id).classList.remove('active');
function escapeHtml(t) { return t ? t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : ''; }
