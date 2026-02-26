// ==========================================
// r/Spark - Classroom Forum Logic
// ==========================================

let sb = null;
let currentUser = null;
let isTeacher = false;
let currentSubFilter = 'all';
let currentOpenPostId = null; 
let myVotes = { posts: {}, comments: {} };
let currentSort = 'hot'; 
let currentView = 'all'; 

// Name masking state
let nameMaskingCache = {};
let lastPollTime = null;
let pollingInterval = null;

const ADJECTIVES = ['Happy', 'Brave', 'Calm', 'Swift', 'Wise', 'Bright', 'Clever', 'Kind', 'Bold'];
const ANIMALS = ['Badger', 'Fox', 'Owl', 'Eagle', 'Bear', 'Dolphin', 'Wolf', 'Hawk', 'Tiger'];

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.supabase !== 'undefined') {
        sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    } else { alert('Supabase not loaded. Check config.js'); return; }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal('createPostModal');
            closeModal('createSubModal');
        }
    });

    // --- CATCH DYNAMIC LINKS FROM CLASSCAST ---
    const urlParams = new URLSearchParams(window.location.search);
    const subId = urlParams.get('sub');
    if (subId) { currentSubFilter = subId; }

    await checkUser();
    await fetchNameMaskingSettings(); 
    pollingInterval = setInterval(checkForNameChanges, 5000); 

    loadSubreddits();
    loadPosts(); 
    setupFormListeners();
});

// ================= AUTH & AURA INITIALIZATION =================
async function checkUser() {
    const { data: { session } } = await sb.auth.getSession();
    const authSection = document.getElementById('authSection');
    
    if (session) {
        const safeEmail = session.user.email.toLowerCase();
        await sb.from('profiles').upsert({ id: session.user.id, email: safeEmail, username: safeEmail.split('@')[0] }, { onConflict: 'id' });

        const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
        currentUser = profile;
        
        const { data: teacherRecord } = await sb.from('classcast_teachers').select('*').eq('email', safeEmail).single();
        isTeacher = !!teacherRecord || safeEmail === 'wwilson@mtps.us';
        
        const adminLink = document.getElementById('adminLink');
        const sidebarAddBtn = document.getElementById('sidebarAddBtn');
        const createPostBar = document.getElementById('createPostBar');
        const sortBar = document.getElementById('sortBar');
        const auraDisplay = document.getElementById('auraDisplay');
        const auraScoreValue = document.getElementById('auraScoreValue');

        if (adminLink) adminLink.style.display = isTeacher ? 'inline' : 'none';
        if (sidebarAddBtn) sidebarAddBtn.style.display = isTeacher ? 'flex' : 'none';
        if (createPostBar) createPostBar.style.display = 'flex';
        if (sortBar) sortBar.style.display = 'flex';
        
        if (auraDisplay) auraDisplay.style.display = 'flex';
        if (auraScoreValue) auraScoreValue.innerText = currentUser.aura_score || 0;
        
        authSection.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: 600;">${profile.username || safeEmail.split('@')[0]}</span>
                <button onclick="signOut()" class="auth-btn">Log Out</button>
            </div>
        `;

        await loadMyVotes();
    } else {
        currentUser = null;
        authSection.innerHTML = `<button onclick="signIn()" class="auth-btn">Sign in with Google</button>`;
    }
}

window.signIn = async function() {
    await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { prompt: 'consent', hd: 'mtps.us' } } });
};

window.signOut = async function() {
    await sb.auth.signOut();
    window.location.reload();
};

// ================= AURA SCORE ENGINE =================
async function updateAura(userId, amount) {
    if (!userId || amount === 0) return;
    try {
        const { data } = await sb.from('profiles').select('aura_score').eq('id', userId).single();
        if (data) {
            const newScore = (data.aura_score || 0) + amount;
            await sb.from('profiles').update({ aura_score: newScore }).eq('id', userId);
            
            if (currentUser && currentUser.id === userId) {
                currentUser.aura_score = newScore;
                const el = document.getElementById('auraScoreValue');
                if (el) el.innerText = newScore;
            }
        }
    } catch(err) { console.error("Aura DB Error:", err); }
}

// ================= ROSTER FILTERING & SUBREDDITS =================
async function loadSubreddits() {
    const list = document.getElementById('subredditList');
    list.innerHTML = '<li><a href="#" style="color:#666;">Loading classes...</a></li>';
    
    let { data: subs, error } = await sb.from('subreddits').select('*').order('name');
    if (error) return console.error(error);
    
    let allowedSubs = [];
    
    if (isTeacher) {
        const { data: myClasses } = await sb.from('classcast_classes').select('class_name').contains('teacher_emails', `["${currentUser.email.toLowerCase()}"]`);
        const myClassNames = myClasses ? myClasses.map(c => c.class_name) : [];
        
        allowedSubs = subs.filter(s => {
            if (s.created_by === currentUser.id) return true;
            let targets = [];
            try { targets = typeof s.target_classes === 'string' ? JSON.parse(s.target_classes) : (s.target_classes || []); } catch(e){}
            if (!targets || targets.length === 0) return true; 
            return targets.some(c => myClassNames.includes(c));
        });
    } else if (currentUser) {
        const { data: myRosters } = await sb.from('classcast_roster').select('class_id').eq('student_email', currentUser.email.toLowerCase());
        const myClassIds = myRosters ? myRosters.map(r => r.class_id) : [];
        let myClassNames = [];
        if (myClassIds.length > 0) {
            const { data: classData } = await sb.from('classcast_classes').select('class_name').in('id', myClassIds);
            if (classData) myClassNames = classData.map(c => c.class_name);
        }
        
        allowedSubs = subs.filter(s => {
            let targets = [];
            try { targets = typeof s.target_classes === 'string' ? JSON.parse(s.target_classes) : (s.target_classes || []); } catch(e){}
            if (!targets || targets.length === 0) return true; 
            return targets.some(c => myClassNames.includes(c));
        });
    }

    list.innerHTML = `<li><a href="#" class="${currentSubFilter === 'all' ? 'active' : ''}" onclick="selectSub('all')"><span class="sub-icon">⚡</span> All Sparks</a></li>`;
    
    allowedSubs.forEach(sub => {
        list.innerHTML += `<li><a href="#" class="${currentSubFilter === sub.id ? 'active' : ''}" onclick="selectSub('${sub.id}')"><span class="sub-icon">💬</span> r/${escapeHtml(sub.name)}</a></li>`;
    });
    
    const postSubSelect = document.getElementById('postSubreddit');
    if(postSubSelect) {
        postSubSelect.innerHTML = '<option value="" disabled selected>Choose Community</option>';
        allowedSubs.forEach(sub => postSubSelect.innerHTML += `<option value="${sub.id}">r/${escapeHtml(sub.name)}</option>`);
    }
}

window.selectSub = function(id) { 
    currentSubFilter = id; 
    const url = new URL(window.location);
    if (id === 'all') url.searchParams.delete('sub');
    else url.searchParams.set('sub', id);
    window.history.pushState({}, '', url);

    showFeed(); loadSubreddits(); loadPosts(); 
};

// ================= MODALS & FORMS =================
window.openSubModal = async function() {
    document.getElementById('createSubModal').style.display = 'flex';
    document.getElementById('subName').value = '';
    
    if (isTeacher) {
        document.getElementById('rosterSelectionGroup').style.display = 'block';
        const select = document.getElementById('subRosters');
        select.innerHTML = '<option value="all" selected>-- Visible to ALL My Classes --</option>';
        
        const { data: myClasses } = await sb.from('classcast_classes').select('class_name').contains('teacher_emails', `["${currentUser.email.toLowerCase()}"]`);
        if (myClasses) {
            myClasses.forEach(c => select.innerHTML += `<option value="${escapeHtml(c.class_name)}">${escapeHtml(c.class_name)}</option>`);
        }
    }
};

window.openPostModal = function() {
    if (!currentUser) return alert('Please sign in to post!');
    document.getElementById('createPostModal').style.display = 'flex';
    if (currentSubFilter !== 'all') document.getElementById('postSubreddit').value = currentSubFilter;
};

window.closeModal = function(id) { document.getElementById(id).style.display = 'none'; };

function setupFormListeners() {
    const subForm = document.getElementById('createSubForm');
    if (subForm) {
        subForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('subName').value.trim().replace(/\s+/g, '_');
            if (!name) return;
            
            let targetClasses = [];
            if (isTeacher) {
                const select = document.getElementById('subRosters');
                const selected = Array.from(select.selectedOptions).map(opt => opt.value);
                if (selected.includes('all')) {
                    const { data: myClasses } = await sb.from('classcast_classes').select('class_name').contains('teacher_emails', `["${currentUser.email.toLowerCase()}"]`);
                    targetClasses = myClasses ? myClasses.map(c => c.class_name) : [];
                } else {
                    targetClasses = selected;
                }
            }
            
            const { data, error } = await sb.from('subreddits').insert([{ name: name, created_by: currentUser.id, target_classes: JSON.stringify(targetClasses) }]).select();
            if (error) return alert("Error: " + error.message);
            
            closeModal('createSubModal'); currentSubFilter = data[0].id; loadSubreddits(); loadPosts();
        });
    }

    const postForm = document.getElementById('createPostForm');
    if (postForm) {
        postForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('postTitle').value;
            const content = document.getElementById('postContent').value;
            const subId = document.getElementById('postSubreddit').value;
            const img = document.getElementById('postImage').value;
            const link = document.getElementById('postLink').value;

            if (!subId) return alert('Please select a community');

            const { error } = await sb.from('posts').insert([{ title: title, content: content, subreddit_id: subId, user_id: currentUser.id, image_url: img, url: link }]);
            if (error) return alert("Posting Error: " + error.message);

            await updateAura(currentUser.id, 10); 
            
            closeModal('createPostModal'); postForm.reset(); loadPosts();
        });
    }
}

// ================= POSTS & RENDERING =================
window.setSort = function(sort) {
    currentSort = sort;
    document.querySelectorAll('#sortBar .sort-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    loadPosts();
};

window.setView = function(view) {
    if (!currentUser && view === 'mine') return alert('Please sign in first');
    currentView = view;
    document.getElementById('viewAllBtn').classList.toggle('active', view === 'all');
    document.getElementById('viewMineBtn').classList.toggle('active', view === 'mine');
    loadPosts();
};

async function loadPosts() {
    const list = document.getElementById('postsList');
    list.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">Loading posts...</div>';

    let query = sb.from('posts').select(`*, profiles(username, email), subreddits(name, id), comments(id)`);

    if (currentSubFilter !== 'all') query = query.eq('subreddit_id', currentSubFilter);
    if (currentView === 'mine' && currentUser) query = query.eq('user_id', currentUser.id);

    if (currentSort === 'new') query = query.order('created_at', { ascending: false });
    else if (currentSort === 'top') query = query.order('points', { ascending: false });
    else query = query.order('created_at', { ascending: false }); 

    const { data: posts, error } = await query;
    if (error) { list.innerHTML = `<div style="padding: 20px; color: red;">Error: ${error.message}</div>`; return; }

    if (!posts || posts.length === 0) { list.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">No posts here yet. Be the first!</div>'; return; }

    let finalPosts = posts;
    if (currentSort === 'hot') {
        finalPosts.sort((a, b) => {
            const aScore = (a.points || 0) + (a.comments ? a.comments.length : 0) * 2;
            const bScore = (b.points || 0) + (b.comments ? b.comments.length : 0) * 2;
            return bScore - aScore;
        });
    }

    list.innerHTML = finalPosts.map(post => createPostHTML(post)).join('');
}

function createPostHTML(post, isExpanded = false) {
    const timeAgo = formatTimestamp(post.created_at);
    const myVote = myVotes.posts[post.id] || 0;
    
    // Safety checks for missing profiles/subreddits
    const subName = post.subreddits ? escapeHtml(post.subreddits.name) : 'Unknown';
    const authorProfile = post.profiles || {};
    const realName = authorProfile.username || (authorProfile.email ? authorProfile.email.split('@')[0] : 'Unknown');
    
    let subSetting = getEffectiveNameSetting(post.subreddits ? post.subreddits.id : null);
    let displayName = (isTeacher || subSetting) ? escapeHtml(realName) : generateAnonName(post.user_id);

    let contentHtml = '';
    if (post.image_url) contentHtml += `<img src="${escapeHtml(post.image_url)}" alt="Post image" class="post-image">`;
    if (post.url) contentHtml += `<a href="${escapeHtml(post.url)}" target="_blank" class="view-post-link" onclick="event.stopPropagation()">🔗 External Link</a>`;
    if (post.content) {
        const text = escapeHtml(post.content);
        contentHtml += `<div class="view-post-text ${isExpanded ? '' : 'collapsed'}" style="margin-top: 10px;">${text}</div>`;
    }

    const unreadIndicator = post.has_unread ? `<span style="background: var(--primary); color: white; border-radius: 50%; padding: 2px 6px; font-size: 0.7rem; margin-left: 5px;">New</span>` : '';
    const commentCount = post.comments ? post.comments.length : 0;

    return `
        <div class="post-card ${isExpanded ? '' : 'clickable-card'}" data-id="${post.id}" ${!isExpanded ? `onclick="openPostDetails('${post.id}')"` : ''}>
            <div class="post-header">
                <span style="font-weight: 600; color: #1A1A1B;">r/${subName}</span>
                <span>•</span>
                <span>Posted by ${displayName} ${timeAgo}</span>
            </div>
            
            <div class="post-title">${escapeHtml(post.title)} ${unreadIndicator}</div>
            
            ${contentHtml}
            
            <div class="post-footer" onclick="event.stopPropagation()">
                <div style="display:flex; align-items:center; gap:5px;">
                    <button class="vote-btn up ${myVote === 1 ? 'active' : ''}" onclick="handleVote('post', '${post.id}', 1)">▲</button>
                    <span class="score-text">${post.points || 0}</span>
                    <button class="vote-btn down ${myVote === -1 ? 'active' : ''}" onclick="handleVote('post', '${post.id}', -1)">▼</button>
                </div>
                
                <div style="cursor: pointer; display:flex; align-items:center; gap:5px;" onclick="openPostDetails('${post.id}')">
                    💬 ${commentCount} Comments
                </div>
                
                ${(isTeacher || (currentUser && currentUser.id === post.user_id)) ? 
                    `<button class="delete-icon" onclick="deletePost('${post.id}')" title="Delete Post">🗑️</button>` : ''}
            </div>
        </div>
    `;
}

// ================= VOTING, COMMENTS, AND DETAILS =================
window.handleVote = async function(type, id, value) {
    if (!currentUser) return alert('Please sign in to vote');

    const previousVote = myVotes[type + 's'][id] || 0;
    if (previousVote === value) value = 0; 

    const voteDiff = value - previousVote;
    if (voteDiff === 0) return;

    myVotes[type + 's'][id] = value;
    
    const container = type === 'post' ? document.querySelector(`.post-card[data-id="${id}"]`) : document.querySelector(`.comment[data-id="${id}"]`);
    if (container) {
        const scoreEl = container.querySelector('.score-text');
        if (scoreEl) scoreEl.textContent = parseInt(scoreEl.textContent) + voteDiff;
        container.querySelector('.vote-btn.up')?.classList.toggle('active', value === 1);
        container.querySelector('.vote-btn.down')?.classList.toggle('active', value === -1);
    }

    const table = type === 'post' ? 'posts' : 'comments';
    const { data: targetRecord } = await sb.from(table).select('user_id, points').eq('id', id).single();
    
    if (targetRecord) {
        await sb.from(table).update({ points: targetRecord.points + voteDiff }).eq('id', id);
        
        // --- AURA MATH ---
        if (previousVote === 0 && value !== 0) await updateAura(currentUser.id, 1); 
        
        let authorChange = 0;
        if (previousVote === 0 && value === 1) authorChange = 2;       
        else if (previousVote === 0 && value === -1) authorChange = -1;
        else if (previousVote === 1 && value === 0) authorChange = -2; 
        else if (previousVote === -1 && value === 0) authorChange = 1; 
        else if (previousVote === 1 && value === -1) authorChange = -3;
        else if (previousVote === -1 && value === 1) authorChange = 3; 
        
        if (authorChange !== 0 && targetRecord.user_id) await updateAura(targetRecord.user_id, authorChange);
    }

    localStorage.setItem('myVotes', JSON.stringify(myVotes));
};

window.openPostDetails = async function(postId) {
    currentOpenPostId = postId;
    document.getElementById('createPostBar').style.display = 'none';
    if(document.getElementById('sortBar')) document.getElementById('sortBar').style.display = 'none';
    
    const list = document.getElementById('postsList');
    list.innerHTML = '<div style="padding: 40px; text-align: center;">Loading post...</div>';

    const { data: post } = await sb.from('posts').select(`*, profiles(username, email), subreddits(name, id)`).eq('id', postId).single();
    if (!post) { showFeed(); return; }

    let html = `<button class="back-btn" onclick="showFeed()">← Back to Feed</button>`;
    
    post.comments = []; 
    html += createPostHTML(post, true); 
    
    html += `
        <div style="background: white; padding: 20px; border-radius: 4px; border: 1px solid var(--border); margin-top: 20px;">
            <textarea id="newCommentText" class="comment-box" rows="3" placeholder="What are your thoughts?"></textarea>
            <button class="submit-btn" style="width: auto; padding: 8px 20px; margin-top: 10px;" onclick="addComment('${postId}')">Comment</button>
        </div>
        <div id="commentsList" style="margin-top: 20px;">Loading comments...</div>
    `;
    list.innerHTML = html;
    loadComments(postId, post.subreddits ? post.subreddits.id : null);
};

window.addComment = async function(postId) {
    if (!currentUser) return alert('Please sign in to comment');
    const text = document.getElementById('newCommentText').value.trim();
    if (!text) return;

    const { error } = await sb.from('comments').insert([{ post_id: postId, user_id: currentUser.id, content: text }]);
    if (error) return alert("Error: " + error.message);

    await updateAura(currentUser.id, 5); 
    
    document.getElementById('newCommentText').value = '';
    const { data: post } = await sb.from('posts').select('subreddit_id').eq('id', postId).single();
    if(post) loadComments(postId, post.subreddit_id);
};

async function loadComments(postId, subredditId) {
    const list = document.getElementById('commentsList');
    const { data: comments } = await sb.from('comments').select(`*, profiles(username, email)`).eq('post_id', postId).order('created_at', { ascending: true });
    
    if (!comments || comments.length === 0) { list.innerHTML = '<p style="color: #666;">No comments yet.</p>'; return; }

    let subSetting = getEffectiveNameSetting(subredditId);

    list.innerHTML = comments.map(c => {
        const authorProfile = c.profiles || {};
        const realName = authorProfile.username || (authorProfile.email ? authorProfile.email.split('@')[0] : 'Unknown');
        let displayName = (isTeacher || subSetting) ? escapeHtml(realName) : generateAnonName(c.user_id);
        const myVote = myVotes.comments[c.id] || 0;
        
        return `
            <div class="comment" data-id="${c.id}" style="display: flex; gap: 15px; margin-bottom: 20px; padding-left: 10px; border-left: 2px solid var(--border);">
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding-top: 5px;">
                    <button class="vote-btn up ${myVote === 1 ? 'active' : ''}" onclick="handleVote('comment', '${c.id}', 1)">▲</button>
                    <span class="score-text" style="font-size: 0.9rem;">${c.points || 0}</span>
                    <button class="vote-btn down ${myVote === -1 ? 'active' : ''}" onclick="handleVote('comment', '${c.id}', -1)">▼</button>
                </div>
                <div style="flex: 1;">
                    <div class="post-header" style="margin-bottom: 5px;">
                        <strong style="color: var(--text-primary);">${displayName}</strong> 
                        <span>•</span> 
                        <span>${formatTimestamp(c.created_at)}</span>
                    </div>
                    <div class="view-post-text" style="margin-bottom: 5px;">${escapeHtml(c.content)}</div>
                    ${(isTeacher || (currentUser && currentUser.id === c.user_id)) ? 
                        `<button class="delete-icon" style="font-size: 0.85rem;" onclick="deleteComment('${c.id}', '${postId}', '${subredditId}')">🗑️ Delete</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

window.showFeed = function() {
    currentOpenPostId = null;
    document.getElementById('createPostBar').style.display = 'flex';
    if(document.getElementById('sortBar')) document.getElementById('sortBar').style.display = 'flex';
    loadPosts();
};

window.deletePost = async function(id) { if (confirm("Delete this post?")) { await sb.from('posts').delete().eq('id', id); showFeed(); }};
window.deleteComment = async function(id, postId, subId) { if (confirm("Delete comment?")) { await sb.from('comments').delete().eq('id', id); loadComments(postId, subId); }};

// ================= UTILITIES & POLLING =================
async function loadMyVotes() {
    try {
        const stored = localStorage.getItem('myVotes');
        if (stored) myVotes = JSON.parse(stored);
    } catch (e) { myVotes = { posts: {}, comments: {} }; }
}

async function fetchNameMaskingSettings() {
    try {
        const { data } = await sb.from('name_masking_status').select('*');
        if (data) {
            data.forEach(item => {
                nameMaskingCache[item.subreddit_id] = { subreddit_setting: item.subreddit_setting, teacher_global_setting: item.teacher_global_setting, last_change: item.last_change };
            });
            lastPollTime = new Date();
        }
    } catch (e) { console.error('Masking fetch error:', e); }
}

async function checkForNameChanges() {
    if (!lastPollTime) return;
    try {
        const { data } = await sb.from('name_masking_status').select('*').gt('last_change', lastPollTime.toISOString());
        if (data && data.length > 0) {
            data.forEach(item => {
                nameMaskingCache[item.subreddit_id] = { subreddit_setting: item.subreddit_setting, teacher_global_setting: item.teacher_global_setting, last_change: item.last_change };
            });
            lastPollTime = new Date();
            if(!currentOpenPostId) loadPosts(); else loadComments(currentOpenPostId, document.getElementById('postSubreddit').value);
        }
    } catch (e) {}
}

function getEffectiveNameSetting(subredditId) {
    const cached = nameMaskingCache[subredditId];
    if (!cached) return false;
    if (cached.subreddit_setting !== null && cached.subreddit_setting !== undefined) return cached.subreddit_setting;
    return cached.teacher_global_setting || false;
}

function generateAnonName(userId) {
    if (!userId) return "Anonymous user";
    let hash = 0; for (let i = 0; i < userId.length; i++) hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    return `${ADJECTIVES[Math.abs(hash) % ADJECTIVES.length]} ${ANIMALS[Math.abs(hash >> 8) % ANIMALS.length]}`;
}

function formatTimestamp(timestamp) {
    const diffMs = new Date() - new Date(timestamp);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 60) return diffMins <= 1 ? 'just now' : `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
