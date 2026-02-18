// app.js

let sb = null;
let currentUser = null;
let isTeacher = false;
let currentSubFilter = 'all';
let currentOpenPostId = null; 
let myVotes = { posts: {}, comments: {} };
let showRealNames = false; // Teacher setting for showing real names
let currentSort = 'hot'; // hot, new, or top

const ADJECTIVES = ['Happy', 'Brave', 'Calm', 'Swift', 'Wise', 'Bright', 'Clever', 'Kind', 'Bold'];
const ANIMALS = ['Badger', 'Fox', 'Owl', 'Eagle', 'Bear', 'Dolphin', 'Wolf', 'Hawk', 'Tiger'];

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.supabase !== 'undefined') {
        sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    } else { alert('Supabase not loaded'); return; }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal('createPostModal');
            closeModal('createSubModal');
        }
    });

    await checkUser();
    await loadTeacherSettings(); // Load teacher settings
    loadSubreddits();
    loadPosts(); 
    setupFormListeners();
});

// ================= NAVIGATION =================
function showFeed() {
    document.getElementById('postView').style.display = 'none';
    document.getElementById('feedView').style.display = 'block';
    currentOpenPostId = null;
}

// ================= TEACHER SETTINGS =================
async function loadTeacherSettings() {
    const { data } = await sb.from('teacher_settings').select('*').eq('setting_key', 'show_real_names').single();
    if (data) {
        showRealNames = data.setting_value;
    }
}

window.toggleRealNames = async function() {
    if (!isTeacher) return;
    showRealNames = !showRealNames;
    
    const { error } = await sb.from('teacher_settings')
        .update({ setting_value: showRealNames, updated_at: new Date().toISOString(), updated_by: currentUser.id })
        .eq('setting_key', 'show_real_names');
    
    if (error) {
        console.error('Failed to update setting:', error);
        showRealNames = !showRealNames; // Revert
    } else {
        loadPosts(); // Reload to show/hide names
    }
};

// ================= SORTING =================
window.changeSortReload = function(sortType) {
    currentSort = sortType;
    
    // Update button styles
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'white';
        btn.style.color = 'black';
    });
    
    const activeBtn = document.querySelector(`[data-sort="${sortType}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.background = '#FF4500';
        activeBtn.style.color = 'white';
    }
    
    loadPosts();
};

// ================= FLAGGING =================
window.flagContent = async function(contentId, contentType) {
    if (!currentUser) return alert('Please sign in to flag content');
    
    const reason = prompt('Why are you flagging this content? (optional)');
    if (reason === null) return; // User cancelled
    
    const payload = {
        user_id: currentUser.id,
        reason: reason || 'No reason provided',
        reviewed: false
    };
    
    if (contentType === 'post') {
        payload.post_id = contentId;
        payload.comment_id = null;
    } else {
        payload.comment_id = contentId;
        payload.post_id = null;
    }
    
    const { error } = await sb.from('flags').insert([payload]);
    
    if (error) {
        alert('Error flagging content: ' + error.message);
    } else {
        alert('Content has been flagged for teacher review');
    }
};

function openPostPage(post, authorName, realIdentity) {
    currentOpenPostId = post.id;
    console.log('📖 Opening post:', post.id);

    // Toggle Views
    document.getElementById('feedView').style.display = 'none';
    document.getElementById('postView').style.display = 'block';
    window.scrollTo(0, 0);

    // Fill Data
    document.getElementById('detailSub').textContent = `r/${post.subreddits ? post.subreddits.name : 'Unknown'}`;
    
    // If showRealNames is on, display the real identity; otherwise just the anon name
    document.getElementById('detailAuthor').innerHTML = showRealNames 
        ? `${authorName} <span style="color:#ff4500;">(${realIdentity})</span>` 
        : authorName;
    document.getElementById('detailTitle').textContent = post.title;
    
    const contentDiv = document.getElementById('detailContent');
    contentDiv.innerHTML = post.content ? escapeHtml(post.content).replace(/\n/g, '<br>') : '';
    
    const imgEl = document.getElementById('detailImage');
    if (post.image_url) { imgEl.src = post.image_url; imgEl.style.display = 'block'; }
    else { imgEl.style.display = 'none'; }
    
    const linkEl = document.getElementById('detailLink');
    if (post.url) { linkEl.href = post.url; linkEl.textContent = `🔗 ${post.url}`; linkEl.style.display = 'block'; }
    else { linkEl.style.display = 'none'; }

    // Add voting buttons to the expanded post view
    const userVote = myVotes.posts[post.id] || 0;
    const upActive = userVote === 1 ? 'active' : '';
    const downActive = userVote === -1 ? 'active' : '';
    
    // Remove existing vote section if it exists
    const existingVoteSection = document.getElementById('detailVoteSection');
    if (existingVoteSection) existingVoteSection.remove();
    
    // Create voting section
    const voteSection = document.createElement('div');
    voteSection.id = 'detailVoteSection';
    voteSection.style.cssText = 'display: flex; align-items: center; gap: 15px; margin: 20px 0; padding: 15px 0; border-top: 1px solid #eee; border-bottom: 1px solid #eee;';
    
    // Create upvote button with 'detail-' prefix
    const upBtn = document.createElement('button');
    upBtn.id = `detail-btn-up-post-${post.id}`;
    upBtn.className = `vote-btn up ${upActive}`;
    upBtn.textContent = '⬆';
    upBtn.onclick = (e) => {
        e.stopPropagation();
        window.vote(post.id, 1, 'post');
    };
    
    // Create score display with 'detail-' prefix - initially use cached value
    const scoreSpan = document.createElement('span');
    scoreSpan.id = `detail-score-post-${post.id}`;
    scoreSpan.className = 'score-text';
    scoreSpan.style.cssText = 'font-weight: bold; font-size: 1rem;';
    scoreSpan.textContent = post.vote_count || 0;
    
    // Create downvote button with 'detail-' prefix
    const downBtn = document.createElement('button');
    downBtn.id = `detail-btn-down-post-${post.id}`;
    downBtn.className = `vote-btn down ${downActive}`;
    downBtn.textContent = '⬇';
    downBtn.onclick = (e) => {
        e.stopPropagation();
        window.vote(post.id, -1, 'post');
    };
    
    // Create helper text
    const helperText = document.createElement('span');
    helperText.style.cssText = 'color: var(--text-secondary); font-size: 0.9rem; margin-left: 10px;';
    helperText.textContent = 'Vote on this post';
    
    // Assemble vote section
    voteSection.appendChild(upBtn);
    voteSection.appendChild(scoreSpan);
    voteSection.appendChild(downBtn);
    voteSection.appendChild(helperText);
    
    // Insert the vote section before the divider
    const divider = document.querySelector('#postView hr.divider');
    divider.parentNode.insertBefore(voteSection, divider);

    // Fetch fresh vote count from database asynchronously
    (async () => {
        const { data: freshPost } = await sb.from('posts').select('vote_count').eq('id', post.id).single();
        if (freshPost && scoreSpan) {
            scoreSpan.textContent = freshPost.vote_count || 0;
            console.log('✅ Refreshed vote count:', freshPost.vote_count);
        }
    })();

    // Show Input if logged in
    document.getElementById('detailCommentInput').style.display = currentUser ? 'block' : 'none';

    // Load Comments
    loadDetailComments(post.id);
}

// ================= AUTH (SELF-HEALING VERSION) =================
async function checkUser() {
    const { data: { session } } = await sb.auth.getSession();
    const authSection = document.getElementById('authSection');
    const actionBar = document.getElementById('actionBar');

    if (session) {
        console.log('✅ Session active:', session.user.email);
        
        // 1. Try to get the profile
        let { data: profile, error: fetchError } = await sb.from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        // 2. If profile is missing, CREATE it (Self-Healing)
        // 2. If profile is missing OR username is missing, FIX IT
if (!profile || !profile.username) {
    console.log('✨ Profile or username missing, fixing now...');
    
    // Generate a username from the email (e.g., "wwilson" from "wwilson@mtps.us")
    const generatedUsername = session.user.email.split('@')[0];

    const { data: updatedProfile, error: upsertError } = await sb.from('profiles').upsert({
        id: session.user.id,
        email: session.user.email,
        username: generatedUsername,
        role: session.user.email === 'wwilson@mtps.us' ? 'teacher' : 'student'
    }).select().single();
    
    if (upsertError) {
        console.error('❌ Could not fix profile:', upsertError);
    } else {
        profile = updatedProfile;
    }
}

        currentUser = profile;
        isTeacher = currentUser.role === 'teacher';
        
        await loadMyVotes();
        
        // Update UI
        authSection.innerHTML = `
            <div style="display:flex; gap:10px; align-items:center;">
                <div style="text-align:right; line-height:1.2;">
                    <div style="font-weight:bold; font-size:0.9rem;">${currentUser.username || currentUser.email.split('@')[0]}</div>
                    <div style="font-size:0.75rem; color:${isTeacher ? '#0079D3' : '#00D9A5'}; font-weight:bold; text-transform:uppercase;">${isTeacher ? 'TEACHER' : 'STUDENT'}</div>
                </div>
                <button class="google-btn" onclick="signOut()" style="padding: 4px 10px; font-size: 0.8rem;">Sign Out</button>
            </div>
        `;
        if (actionBar) actionBar.style.display = 'flex';
        const sidebarAddBtn = document.getElementById('sidebarAddBtn');
        if (sidebarAddBtn) sidebarAddBtn.style.display = isTeacher ? 'flex' : 'none';
        
        // Show admin link for teachers
        const adminLink = document.getElementById('adminLink');
        if (adminLink) adminLink.style.display = isTeacher ? 'block' : 'none';
        
        // Show teacher controls
        const teacherControls = document.getElementById('teacherControls');
        if (teacherControls) teacherControls.style.display = isTeacher ? 'block' : 'none';
        
        // Set checkbox state
        const toggleCheckbox = document.getElementById('toggleNamesCheckbox');
        if (toggleCheckbox) toggleCheckbox.checked = showRealNames;

    } else {
        authSection.innerHTML = `
            <button class="google-btn" onclick="signIn()">
                <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg" alt="G" style="width:18px; height:18px;">
                Sign in with Google
            </button>
        `;
        if (actionBar) actionBar.style.display = 'none';
    }
}



// 1. Load Votes when user logs in
async function loadMyVotes() {
    if (!currentUser) return;
    const { data } = await sb.from('votes').select('*').eq('user_id', currentUser.id);
    if (data) {
        myVotes = { posts: {}, comments: {} }; // Reset
        data.forEach(v => {
            if (v.post_id) myVotes.posts[v.post_id] = v.vote_type;
            if (v.comment_id) myVotes.comments[v.comment_id] = v.vote_type;
        });
    }
}

// 2. The Main Vote Function - GLOBAL
window.vote = async function(id, typeValue, itemType = 'post') { // typeValue is 1 or -1
    console.log('🗳️ Vote called:', { id, typeValue, itemType, currentUser });
    
    if (!currentUser) {
        alert("Please sign in to vote.");
        return;
    }

    // Check current state
    const currentVote = itemType === 'post' ? myVotes.posts[id] : myVotes.comments[id];
    console.log('Current vote state:', currentVote);
    
    // DECIDE ACTION:
    // If clicking the same button -> DELETE vote (toggle off)
    // If clicking different button -> UPSERT (change vote)
    // If no previous vote -> UPSERT (add vote)
    
    let action = 'upsert';
    if (currentVote === typeValue) action = 'delete';
    console.log('Action:', action);

    // Optimistic UI Update (Instant feedback)
    updateVoteUI(id, action === 'delete' ? 0 : typeValue, itemType);

    if (action === 'delete') {
        // DELETE VOTE
        // We match user_id AND the specific post/comment id
        let query = sb.from('votes').delete().eq('user_id', currentUser.id);
        if (itemType === 'post') query = query.eq('post_id', id);
        else query = query.eq('comment_id', id);
        
        const { error } = await query;
        console.log('Delete result:', { error });
        
        if (error) {
            console.error('❌ Delete vote failed:', error);
            alert('Error deleting vote: ' + error.message);
        }
        
        // Update local state
        if (itemType === 'post') delete myVotes.posts[id];
        else delete myVotes.comments[id];

    } else {
        // INSERT/UPDATE VOTE
        const payload = {
            user_id: currentUser.id,
            vote_type: typeValue
        };
        
        // Handle your constraint: One ID must be null
        if (itemType === 'post') {
            payload.post_id = id;
            payload.comment_id = null; 
        } else {
            payload.comment_id = id;
            payload.post_id = null;
        }
        
        console.log('Upserting payload:', payload);

        const { data, error } = await sb.from('votes').upsert(payload, { 
            onConflict: itemType === 'post' ? 'user_id,post_id' : 'user_id,comment_id' 
        });

        console.log('Upsert result:', { data, error });

        if (error) {
            console.error('❌ Vote failed:', error);
            alert('Vote error: ' + error.message);
            // Revert UI if needed
        } else {
            console.log('✅ Vote successful');
            // Update local state
            if (itemType === 'post') myVotes.posts[id] = typeValue;
            else myVotes.comments[id] = typeValue;
            
            // If we're in the detail view, refresh the vote buttons
            if (currentOpenPostId && currentOpenPostId === id && itemType === 'post') {
                console.log('🔄 Refreshing detail view vote buttons');
                const voteSection = document.getElementById('detailVoteSection');
                if (voteSection) {
                    // Simply reload the vote count from database
                    const { data: post } = await sb.from('posts').select('vote_count').eq('id', id).single();
                    const scoreSpan = document.getElementById(`detail-score-post-${id}`);
                    if (scoreSpan && post) {
                        scoreSpan.textContent = post.vote_count || 0;
                    }
                    
                    // Update button states based on new vote
                    const upBtn = document.getElementById(`detail-btn-up-post-${id}`);
                    const downBtn = document.getElementById(`detail-btn-down-post-${id}`);
                    if (upBtn && downBtn) {
                        upBtn.classList.remove('active');
                        downBtn.classList.remove('active');
                        const newVote = myVotes.posts[id] || 0;
                        if (newVote === 1) upBtn.classList.add('active');
                        if (newVote === -1) downBtn.classList.add('active');
                    }
                    console.log('✅ Detail view updated');
                }
            }
        }
    }
}

// 3. Helper to update colors/numbers instantly

function updateVoteUI(id, newValue, type) {
    // Defines a helper to update a specific set of buttons (Feed or Detail)
    const updateButtons = (prefix) => {
        const idPrefix = prefix ? `${prefix}-` : ''; 
        const btnUp = document.getElementById(`${idPrefix}btn-up-${type}-${id}`);
        const btnDown = document.getElementById(`${idPrefix}btn-down-${type}-${id}`);
        const scoreSpan = document.getElementById(`${idPrefix}score-${type}-${id}`);

        if (!btnUp || !btnDown || !scoreSpan) return; // Skip if not found on screen

        // 1. Calculate Score Change
        let currentScore = parseInt(scoreSpan.innerText) || 0;
        const oldValue = (type === 'post' ? myVotes.posts[id] : myVotes.comments[id]) || 0;

        // Undo old vote locally
        if (oldValue === 1) currentScore--;
        if (oldValue === -1) currentScore++;

        // Apply new vote locally
        if (newValue === 1) currentScore++;
        if (newValue === -1) currentScore--;

        scoreSpan.innerText = currentScore;

        // 2. Update Colors
        btnUp.classList.remove('active');
        btnDown.classList.remove('active');
        
        if (newValue === 1) btnUp.classList.add('active');
        if (newValue === -1) btnDown.classList.add('active');
    };

    // Run the helper for BOTH locations
    updateButtons('');       // Main Feed
    updateButtons('detail'); // Expanded View
}

window.signIn = async function() {
    // REMOVED 'hd' restriction to allow testing with any Google account
    await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { 
            redirectTo: 'https://wwilson-ui.github.io/r/Spark/', queryParams: { hd: 'mtps.us' } 
        }
    });
};

window.signOut = async function() { 
    await sb.auth.signOut(); 
    localStorage.clear(); // Clear local storage to ensure a fresh state
    window.location.reload(); 
};

// ================= POSTS & FEED =================
async function loadPosts() {
    const feed = document.getElementById('postsFeed');
    feed.innerHTML = '<div style="padding:20px; text-align:center;">Loading...</div>';
    
    let query = sb.from('posts').select(`*, subreddits(name), profiles(email)`);
    
    // Apply sorting
    if (currentSort === 'new') {
        query = query.order('created_at', { ascending: false });
    } else if (currentSort === 'top') {
        query = query.order('vote_count', { ascending: false });
    } else if (currentSort === 'controversial') {
        // Controversial = posts with lots of votes but close to 0 score (many up AND down votes)
        // We'll fetch all and sort client-side
        query = query.order('created_at', { ascending: false });
    } else { // hot (default)
        // Hot algorithm: score / (hours since creation + 2)^1.5
        query = query.order('vote_count', { ascending: false }).order('created_at', { ascending: false });
    }
    
    if (currentSubFilter !== 'all') query = query.eq('subreddit_id', currentSubFilter);

    const { data: posts, error } = await query;
    if (error) { feed.innerHTML = 'Error loading posts'; return; }

    // Client-side sort for controversial
    if (currentSort === 'controversial' && posts) {
        posts.sort((a, b) => {
            // Controversial score: lower absolute score with higher total engagement
            const aEngagement = Math.abs(a.vote_count || 0);
            const bEngagement = Math.abs(b.vote_count || 0);
            // Prioritize posts with low score but high engagement
            return (bEngagement - Math.abs(b.vote_count || 0)) - (aEngagement - Math.abs(a.vote_count || 0));
        });
    }

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
    const authorName = getAnonName(post.user_id);
    
    // Show real names if teacher has toggled it ON (affects all users)
    let displayName = authorName;
    if (showRealNames) {
        // When toggle is ON, everyone sees real names
        displayName = `${post.profiles?.email?.split('@')[0] || 'Unknown'}`;
        if (isAuthor) displayName += ' (you)';
    } else if (isAuthor) {
        // When OFF, you still see "(you)" on your own posts
        displayName = `${authorName} (you)`;
    } else if (isTeacher) {
        // When OFF, teacher sees both anonymous + real name hint
        displayName = `${authorName} <span style="color:#999; font-size:0.75em;">(${post.profiles?.email || ''})</span>`;
    }

div.onclick = (e) => {
        if (e.target.closest('button')) return;
        
        // Use the same logic as your Feed display to determine what name to show
        let displayIdentity = authorName;
        if (showRealNames) {
            displayIdentity = post.profiles?.email?.split('@')[0] || 'Unknown';
        }

        // Pass the correct identity to the detail page
        openPostPage(post, authorName, displayIdentity);
    };
    // Action buttons
    const deleteBtn = (isTeacher || isAuthor) ? `<button class="delete-icon" onclick="deletePost('${post.id}')" title="Delete post">🗑️</button>` : '';
    const editBtn = isAuthor ? `<button class="delete-icon" onclick="editPost('${post.id}')" title="Edit post" style="color:#0079D3;">✏️</button>` : '';
    const flagBtn = currentUser && !isAuthor ? `<button class="delete-icon" onclick="flagContent('${post.id}', 'post')" title="Flag for teacher" style="color:#ff8800;">🚩</button>` : '';
    
    // Get current user's vote for this post
    const userVote = myVotes.posts[post.id] || 0;
    const upActive = userVote === 1 ? 'active' : '';
    const downActive = userVote === -1 ? 'active' : '';
    
    // Format timestamp
    const timestamp = formatTimestamp(post.created_at);

    div.innerHTML = `
        <div class="post-header">
            <strong>r/${post.subreddits ? post.subreddits.name : 'Unknown'}</strong>
            <span>•</span>
            <span>Posted by ${displayName}</span>
            <span>•</span>
            <span style="color: #999; font-size: 0.85em;">${timestamp}</span>
            <span style="flex-grow:1"></span>
            ${editBtn}${flagBtn}${deleteBtn}
        </div>
        <div class="post-title" style="font-size: 1.1rem; margin-bottom: 5px;">${escapeHtml(post.title)}</div>
        
        <div class="post-footer">
            <button id="btn-up-post-${post.id}" class="vote-btn up ${upActive}" onclick="vote('${post.id}', 1, 'post')">⬆</button>
            <span id="score-post-${post.id}" class="score-text">${post.vote_count || 0}</span>
            <button id="btn-down-post-${post.id}" class="vote-btn down ${downActive}" onclick="vote('${post.id}', -1, 'post')">⬇</button>
            <span style="font-weight:normal; font-size:0.8rem; margin-left:10px;">Click to view comments</span>
        </div>
    `;
    return div;
}

// ================= COMMENTS =================
async function loadDetailComments(postId) {
    const list = document.getElementById('detailCommentsList');
    list.innerHTML = 'Loading comments...';
    
    const { data: comments } = await sb.from('comments')
        .select(`*, profiles(email)`)
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
        post_id: currentOpenPostId, user_id: currentUser.id, content: content
    }]);

    if (error) alert(error.message);
    else { txt.value = ''; loadDetailComments(currentOpenPostId); }
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
        const isAuthor = currentUser && currentUser.id === c.user_id;
        const authorName = getAnonName(c.user_id);
        
        // Show real names if toggle is ON (for everyone)
        let displayName = authorName;
        if (showRealNames) {
            displayName = `${c.profiles?.email?.split('@')[0] || 'Unknown'}`;
            if (isAuthor) displayName += ' (you)';
        } else if (isAuthor) {
            displayName = `${authorName} (you)`;
        } else if (isTeacher) {
            displayName = `${authorName} <span style="color:#999; font-size:0.85em;">(${c.profiles?.email || ''})</span>`;
        }
        
        const deleteBtn = (isTeacher || isAuthor) ? `<button class="delete-sub-x" onclick="deleteComment('${c.id}')">✕</button>` : '';
        const flagBtn = currentUser && !isAuthor ? `<button class="delete-icon" onclick="flagContent('${c.id}', 'comment')" title="Flag" style="color:#ff8800; font-size:0.9rem;">🚩</button>` : '';
        
        // Get current user's vote for this comment
        const userVote = myVotes.comments[c.id] || 0;
        const upActive = userVote === 1 ? 'active' : '';
        const downActive = userVote === -1 ? 'active' : '';
        
        // Format timestamp
        const timestamp = formatTimestamp(c.created_at);

        div.innerHTML = `
            <div class="comment-header">
                <strong>${displayName}</strong> 
                <span style="color: #999; font-size: 0.75em; margin-left: 5px;">${timestamp}</span>
                ${flagBtn}${deleteBtn}
            </div>
            <div style="margin-top:2px;">${escapeHtml(c.content)}</div>
            <div style="margin-top:8px; display:flex; align-items:center; gap:8px;">
                <button id="btn-up-comment-${c.id}" class="vote-btn up ${upActive}" onclick="vote('${c.id}', 1, 'comment')">⬆</button>
                <span id="score-comment-${c.id}" class="score-text" style="font-size:0.85rem;">${c.vote_count || 0}</span>
                <button id="btn-down-comment-${c.id}" class="vote-btn down ${downActive}" onclick="vote('${c.id}', -1, 'comment')">⬇</button>
                <span style="margin-left:10px; font-size:0.8rem; color:#888; cursor:pointer;" onclick="replyToComment('${c.id}', '${authorName}')">Reply</span>
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

window.replyToComment = function(cid, name) {
    if (!currentUser) return alert("Please sign in");
    const box = document.getElementById(`reply-box-${cid}`);
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
};

window.submitReply = async function(pid) {
    const input = document.getElementById(`reply-input-${pid}`);
    const content = input.value.trim();
    if (!content) return;
    await sb.from('comments').insert([{ post_id: currentOpenPostId, user_id: currentUser.id, content, parent_id: pid }]);
    loadDetailComments(currentOpenPostId);
};

// ================= HELPERS (Sidebars, Deletion, etc) =================
// (These are unchanged, just including so the file is complete)
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
        let html = `<span onclick="selectSub('${sub.id}')">r/${sub.name}</span>`;
        if (isTeacher) html += `<span class="delete-sub-x" onclick="deleteSub('${sub.id}', '${sub.name}')">✕</span>`;
        li.innerHTML = html;
        list.appendChild(li);

        const opt = document.createElement('option');
        opt.value = sub.id; opt.textContent = sub.name;
        postSelect.appendChild(opt);
    });
}

window.selectSub = function(id) { currentSubFilter = id; showFeed(); loadSubreddits(); loadPosts(); };

window.editPost = async function(id) {
    // Fetch the post
    const { data: post } = await sb.from('posts').select('*').eq('id', id).single();
    if (!post) return alert('Post not found');
    
    // Populate the form
    document.getElementById('postTitle').value = post.title;
    document.getElementById('postContent').value = post.content || '';
    document.getElementById('postImage').value = post.image_url || '';
    document.getElementById('postLink').value = post.url || '';
    document.getElementById('postSubreddit').value = post.subreddit_id;
    
    // Change form to edit mode
    const form = document.getElementById('createPostForm');
    form.dataset.editingId = id;
    const submitBtn = form.querySelector('.submit-btn');
    submitBtn.textContent = 'Update Post';
    
    // Open modal
    document.getElementById('createPostModal').classList.add('active');
};

window.deletePost = async function(id) { if(confirm('Delete post?')) { await sb.from('posts').delete().eq('id', id); loadPosts(); } };
window.deleteSub = async function(id, name) { if(confirm(`Delete r/${name}?`)) { await sb.from('subreddits').delete().eq('id', id); loadSubreddits(); loadPosts(); } };
window.deleteComment = async function(id) { if(confirm('Delete comment?')) { await sb.from('comments').delete().eq('id', id); loadDetailComments(currentOpenPostId); } };

function getAnonName(id) {
    let hash = 0; for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    const adj = ADJECTIVES[Math.abs(hash) % ADJECTIVES.length];
    const ani = ANIMALS[Math.abs(hash) % ANIMALS.length];
    return `${adj} ${ani}`;
}
function setupFormListeners() {
    const postForm = document.getElementById('createPostForm');
    postForm.onsubmit = async (e) => {
        e.preventDefault();
        
        const postData = {
            title: document.getElementById('postTitle').value,
            content: document.getElementById('postContent').value,
            url: document.getElementById('postLink').value,
            image_url: document.getElementById('postImage').value,
            subreddit_id: document.getElementById('postSubreddit').value
        };
        
        // Check if we're editing or creating
        const editingId = postForm.dataset.editingId;
        let error;
        
        if (editingId) {
            // Update existing post
            ({ error } = await sb.from('posts').update(postData).eq('id', editingId));
            delete postForm.dataset.editingId;
        } else {
            // Create new post
            postData.user_id = currentUser.id;
            ({ error } = await sb.from('posts').insert([postData]));
        }
        
        if (!error) { 
            closeModal('createPostModal');
            postForm.reset();
            postForm.querySelector('.submit-btn').textContent = 'Post';
            loadPosts();
        } else {
            alert('Error: ' + error.message);
        }
    };
    
    document.getElementById('createSubForm').onsubmit = async (e) => {
        e.preventDefault();
        const { error } = await sb.from('subreddits').insert([{
            name: document.getElementById('subName').value, created_by: currentUser.id
        }]);
        if (!error) { closeModal('createSubModal'); loadSubreddits(); }
    };
}

window.openCreateModal = () => {
    const form = document.getElementById('createPostForm');
    delete form.dataset.editingId;
    form.reset();
    form.querySelector('.submit-btn').textContent = 'Post';
    document.getElementById('createPostModal').classList.add('active');
};
window.openSubModal = () => document.getElementById('createSubModal').classList.add('active');
window.closeModal = (id) => {
    document.getElementById(id).classList.remove('active');
    if (id === 'createPostModal') {
        const form = document.getElementById('createPostForm');
        delete form.dataset.editingId;
        form.reset();
        form.querySelector('.submit-btn').textContent = 'Post';
    }
};
function escapeHtml(t) { return t ? t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : ''; }

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 60) {
        return diffMins <= 1 ? 'just now' : `${diffMins}m ago`;
    }
    if (diffHours < 24) {
        return `${diffHours}h ago`;
    }
    if (diffDays < 7) {
        return `${diffDays}d ago`;
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
