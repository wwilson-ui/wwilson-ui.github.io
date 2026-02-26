// app.js

let sb = null;
let currentUser = null;
let isTeacher = false;
let currentSubFilter = 'all';
let currentOpenPostId = null; 
let myVotes = { posts: {}, comments: {} };
let showRealNames = false; // DEPRECATED - now using per-subreddit system
let currentSort = 'hot'; // hot, new, or top
let currentView = 'all'; // 'all' or 'mine'
let unreadNotifications = 0; // Count of posts with new comments

// Name masking state
let nameMaskingCache = {};
let lastPollTime = null;
let pollingInterval = null;

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
    await loadTeacherSettings(); 
    await fetchNameMaskingSettings(); 
    pollingInterval = setInterval(checkForNameChanges, 5000); 

    // --- NEW: CATCH DYNAMIC LINKS FROM CLASSCAST ---
    const urlParams = new URLSearchParams(window.location.search);
    const subId = urlParams.get('sub');
    if (subId) {
        currentSubFilter = subId; // Instantly filter to this specific Sub-Spark
    }
    // -----------------------------------------------

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

// ================= VIEW SWITCHING =================
window.switchToMyPosts = function() {
    currentView = 'mine';
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.style.background = 'white';
        btn.style.color = 'black';
    });
    const myPostsBtn = document.querySelector('[data-view="mine"]');
    if (myPostsBtn) {
        myPostsBtn.style.background = '#FF4500';
        myPostsBtn.style.color = 'white';
    }
    loadPosts();
};

window.switchToAllPosts = function() {
    currentView = 'all';
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.style.background = 'white';
        btn.style.color = 'black';
    });
    const allPostsBtn = document.querySelector('[data-view="all"]');
    if (allPostsBtn) {
        allPostsBtn.style.background = '#FF4500';
        allPostsBtn.style.color = 'white';
    }
    loadPosts();
};

window.showNotifications = async function() {
    if (!currentUser) return;
    
    // Fetch my posts with new comments
    const { data: myPosts } = await sb
        .from('posts')
        .select(`
            *,
            subreddits(name),
            profiles(email),
            comments(created_at)
        `)
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
    
    if (!myPosts || myPosts.length === 0) {
        alert('You haven\'t created any posts yet!');
        return;
    }
    
    // Check which have new comments
    const { data: viewData } = await sb
        .from('post_views')
        .select('post_id, last_viewed_at')
        .eq('user_id', currentUser.id);
    
    const viewMap = {};
    if (viewData) {
        viewData.forEach(v => {
            viewMap[v.post_id] = new Date(v.last_viewed_at);
        });
    }
    
    const postsWithNewComments = myPosts.filter(post => {
        const lastViewed = viewMap[post.id];
        if (!lastViewed) return post.comments.length > 0; // Never viewed, has comments
        
        // Check if there are comments after last viewed
        return post.comments.some(c => new Date(c.created_at) > lastViewed);
    });
    
    if (postsWithNewComments.length === 0) {
        alert('No new activity on your posts!');
        return;
    }
    
    // Switch to my posts view and highlight those with activity
    currentView = 'mine';
    loadPosts();
};

// Calculate unread notifications
async function updateNotificationCount() {
    if (!currentUser) {
        unreadNotifications = 0;
        updateNotificationBadge();
        return;
    }
    
    const { data: myPosts } = await sb
        .from('posts')
        .select(`id, comments(created_at)`)
        .eq('user_id', currentUser.id);
    
    if (!myPosts) {
        unreadNotifications = 0;
        updateNotificationBadge();
        return;
    }
    
    const { data: viewData } = await sb
        .from('post_views')
        .select('post_id, last_viewed_at')
        .eq('user_id', currentUser.id);
    
    const viewMap = {};
    if (viewData) {
        viewData.forEach(v => {
            viewMap[v.post_id] = new Date(v.last_viewed_at);
        });
    }
    
    let count = 0;
    myPosts.forEach(post => {
        const lastViewed = viewMap[post.id];
        if (!lastViewed) {
            if (post.comments.length > 0) count++;
        } else {
            const hasNewComments = post.comments.some(c => new Date(c.created_at) > lastViewed);
            if (hasNewComments) count++;
        }
    });
    
    unreadNotifications = count;
    updateNotificationBadge();
}

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        badge.textContent = unreadNotifications;
        badge.style.display = unreadNotifications > 0 ? 'inline-block' : 'none';
    }
}

async function markPostAsViewed(postId) {
    if (!currentUser) return;
    
    // Upsert post view
    await sb.from('post_views').upsert({
        user_id: currentUser.id,
        post_id: postId,
        last_viewed_at: new Date().toISOString()
    }, {
        onConflict: 'user_id,post_id'
    });
    
    // Update notification count
    await updateNotificationCount();
}

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

    // Mark post as viewed if it's the user's own post
    if (currentUser && currentUser.id === post.user_id) {
        markPostAsViewed(post.id);
    }

    // Toggle Views
    document.getElementById('feedView').style.display = 'none';
    document.getElementById('postView').style.display = 'block';
    window.scrollTo(0, 0);

    // Fill Data
    document.getElementById('detailSub').textContent = `r/${post.subreddits ? post.subreddits.name : 'Unknown'}`;
    
    // Use per-subreddit name setting
    const showReal = getEffectiveNameSetting(post.subreddit_id);
    const isAuthor = currentUser && currentUser.id === post.user_id;
    const email = post.profiles?.email || realIdentity || '';
    
    let displayName;
    if (showReal) {
        displayName = email.split('@')[0] || 'Unknown';
        if (isAuthor) displayName += ' (you)';
    } else {
        displayName = authorName;
        if (isAuthor) displayName += ' (you)';
        else if (isTeacher) displayName += ` <span style="color:#ff4500;">(${email})</span>`;
    }
    
    document.getElementById('detailAuthor').innerHTML = displayName;
    
    // Add action buttons (edit/delete/flag) to the post header
    const detailHeader = document.querySelector('#postView .post-header');
    if (detailHeader) {
        // Remove existing action buttons if any
        const existingActions = detailHeader.querySelector('.detail-actions');
        if (existingActions) existingActions.remove();
        
        // Create action buttons container
        const actionsDiv = document.createElement('span');
        actionsDiv.className = 'detail-actions';
        actionsDiv.style.cssText = 'margin-left: auto; display: flex; gap: 5px;';
        
        // Edit button (for post author)
        if (isAuthor) {
            const editBtn = document.createElement('button');
            editBtn.className = 'delete-icon';
            editBtn.style.color = '#0079D3';
            editBtn.title = 'Edit post';
            editBtn.innerHTML = '✏️';
            editBtn.onclick = () => editPost(post.id);
            actionsDiv.appendChild(editBtn);
        }
        
        // Flag button (for non-authors)
        if (currentUser && !isAuthor) {
            const flagBtn = document.createElement('button');
            flagBtn.className = 'delete-icon';
            flagBtn.style.color = '#ff8800';
            flagBtn.title = 'Flag for teacher';
            flagBtn.innerHTML = '🚩';
            flagBtn.onclick = () => flagContent(post.id, 'post');
            actionsDiv.appendChild(flagBtn);
        }
        
        // Delete button (for author or teacher)
        if (isAuthor || isTeacher) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-icon';
            deleteBtn.title = 'Delete post';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.onclick = () => {
                if (confirm('Delete this post?')) {
                    deletePost(post.id);
                    showFeed(); // Return to feed after deletion
                }
            };
            actionsDiv.appendChild(deleteBtn);
        }
        
        detailHeader.appendChild(actionsDiv);
    }

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
    // ... (Your existing voting code below works fine, leave it as is) ...
    
    // Add voting buttons to the expanded post view
    // (Copy the rest of your existing function logic here or leave it alone if you just paste the top part)
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
    
    // Create score display with 'detail-' prefix
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
    if (divider) {
        divider.parentNode.insertBefore(voteSection, divider);
    } else {
        // Fallback if divider missing
        document.getElementById('detailTitle').after(voteSection);
    }

    // Fetch fresh vote count
    (async () => {
        const { data: freshPost } = await sb.from('posts').select('vote_count').eq('id', post.id).single();
        if (freshPost && scoreSpan) {
            scoreSpan.textContent = freshPost.vote_count || 0;
        }
    })();

    // Show Comments Input
    document.getElementById('detailCommentInput').style.display = currentUser ? 'block' : 'none';
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
        
        // --- NEW: REVEAL AURA BADGE ---
        const auraDisplay = document.getElementById('auraDisplay');
        const auraScoreValue = document.getElementById('auraScoreValue');
        if (auraDisplay) auraDisplay.style.display = 'flex';
        if (auraScoreValue) auraScoreValue.innerText = currentUser.aura_score || 0;
        // ------------------------------
        
        isTeacher = currentUser.role === 'teacher';
        
        await loadMyVotes();
        await updateNotificationCount(); // Check for new comments on user's posts
        
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
        
        // Show notification bell for all users
        const notificationContainer = document.getElementById('notificationContainer');
        if (notificationContainer) notificationContainer.style.display = 'block';
        
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
    let action = 'upsert';
    if (currentVote === typeValue) action = 'delete';
    console.log('Action:', action);

    // Optimistic UI Update (Instant feedback)
    updateVoteUI(id, action === 'delete' ? 0 : typeValue, itemType);

    let voteSuccess = false; // <-- Tracks if DB update worked for Aura Math

    if (action === 'delete') {
        // DELETE VOTE
        let query = sb.from('votes').delete().eq('user_id', currentUser.id);
        if (itemType === 'post') query = query.eq('post_id', id);
        else query = query.eq('comment_id', id);
        
        const { error } = await query;
        console.log('Delete result:', { error });
        
        if (error) {
            console.error('❌ Delete vote failed:', error);
            alert('Error deleting vote: ' + error.message);
        } else {
            voteSuccess = true;
            // Update local state
            if (itemType === 'post') delete myVotes.posts[id];
            else delete myVotes.comments[id];
        }

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
            voteSuccess = true;
            
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

    // --- NEW: AURA MATH ---
    if (voteSuccess) {
        const previousVoteForAura = currentVote || 0;
        const newVoteForAura = action === 'delete' ? 0 : typeValue;
        
        const table = itemType === 'post' ? 'posts' : 'comments';
        const { data: targetRecord } = await sb.from(table).select('user_id').eq('id', id).single();
        
        if (targetRecord && targetRecord.user_id) {
            // Voter gets +1 for participating (if they hadn't voted yet)
            if (previousVoteForAura === 0 && newVoteForAura !== 0) {
                await updateAura(currentUser.id, 1);
            }
            
            // Calculate author's Aura change
            let authorChange = 0;
            if (previousVoteForAura === 0 && newVoteForAura === 1) authorChange = 2;
            else if (previousVoteForAura === 0 && newVoteForAura === -1) authorChange = -1;
            else if (previousVoteForAura === 1 && newVoteForAura === 0) authorChange = -2;
            else if (previousVoteForAura === -1 && newVoteForAura === 0) authorChange = 1;
            else if (previousVoteForAura === 1 && newVoteForAura === -1) authorChange = -3;
            else if (previousVoteForAura === -1 && newVoteForAura === 1) authorChange = 3;
            
            if (authorChange !== 0) {
                await updateAura(targetRecord.user_id, authorChange);
            }
        }
    }
    // ----------------------
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
    
    // Filter by user if in "My Posts" view
    if (currentView === 'mine' && currentUser) {
        query = query.eq('user_id', currentUser.id);
    }
    
    // Apply sorting
    if (currentSort === 'new') {
        query = query.order('created_at', { ascending: false });
    } else if (currentSort === 'top') {
        query = query.order('vote_count', { ascending: false });
    } else if (currentSort === 'controversial') {
        query = query.order('created_at', { ascending: false });
    } else { // hot (default)
        query = query.order('vote_count', { ascending: false }).order('created_at', { ascending: false });
    }
    
    if (currentSubFilter !== 'all') query = query.eq('subreddit_id', currentSubFilter);

    const { data: posts, error } = await query;
    if (error) { feed.innerHTML = 'Error loading posts'; return; }

    // Client-side sort for controversial
    if (currentSort === 'controversial' && posts) {
        posts.sort((a, b) => {
            // Controversial = lots of comments but low/divided vote score
            // Formula: comment_count / (abs(vote_count) + 1)
            // Higher = more controversial (many comments, low score)
            
            const aControversy = (a.comment_count || 0) / (Math.abs(a.vote_count || 0) + 1);
            const bControversy = (b.comment_count || 0) / (Math.abs(b.vote_count || 0) + 1);
            
            return bControversy - aControversy;
        });
    }

    feed.innerHTML = '';
    if (posts.length === 0) {
        const message = currentView === 'mine' ? 
            'You haven\'t created any posts yet!' : 
            'No posts yet. Be the first!';
        feed.innerHTML = `<div style="padding:40px; text-align:center; color:#777;">${message}</div>`;
        return;
    }
    posts.forEach(post => feed.appendChild(createPostElement(post)));
}

function createPostElement(post) {
    const div = document.createElement('div');
    div.className = 'post-card clickable-card';
    div.setAttribute('data-post-id', post.id);
    
    const isAuthor = currentUser && currentUser.id === post.user_id;
    const authorName = getAnonName(post.user_id);
    const authorEmail = post.profiles?.email || '';
    
    // Use per-subreddit name setting
    const showReal = getEffectiveNameSetting(post.subreddit_id);
    
    let displayName;
    if (showReal) {
        displayName = authorEmail.split('@')[0] || 'Unknown';
        if (isAuthor) displayName += ' (you)';
    } else {
        displayName = authorName;
        if (isAuthor) displayName += ' (you)';
        else if (isTeacher) displayName += ` <span style="color:#999; font-size:0.75em;">(${authorEmail})</span>`;
    }

div.onclick = (e) => {
        if (e.target.closest('button')) return;
        openPostPage(post, authorName, authorEmail);
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
            <span class="comment-count" style="margin-left:15px; font-weight:normal; font-size:0.9rem; color:#888;">
                💬 ${post.comment_count || 0} ${(post.comment_count || 0) === 1 ? 'comment' : 'comments'}
            </span>
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

    await updateAura(currentUser.id, 5); // +5 Aura for Engagement

    if (error) {
        alert(error.message);
    } else {
        txt.value = '';
        
        // Reload comments
        await loadDetailComments(currentOpenPostId);
        
        // Fetch updated post data to get new comment count
        const { data: updatedPost } = await sb.from('posts')
            .select('comment_count')
            .eq('id', currentOpenPostId)
            .single();
        
        // Update comment count display in feed if visible
        if (updatedPost) {
            const feedCommentCount = document.querySelector(`#postsFeed [data-post-id="${currentOpenPostId}"] .comment-count`);
            if (feedCommentCount) {
                feedCommentCount.textContent = `💬 ${updatedPost.comment_count || 0} ${(updatedPost.comment_count || 0) === 1 ? 'comment' : 'comments'}`;
            }
        }
    }
}

function buildCommentTree(comments) {
    const map = {}; const roots = [];
    comments.forEach(c => { c.children = []; map[c.id] = c; });
    comments.forEach(c => {
        if (c.parent_id && map[c.parent_id]) map[c.parent_id].children.push(c);
        else roots.push(c);
    });
    
    // Sort top-level comments by vote_count (descending)
    roots.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));
    
    // Sort replies by creation time (oldest first) within each thread
    roots.forEach(root => {
        if (root.children.length > 0) {
            root.children.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        }
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
    
    let { data: subs, error } = await sb.from('subreddits').select('*').order('name');
    if (error) return console.error(error);
    
    let allowedSubs = [];
    
    if (isTeacher) {
        // Teacher logic: See subs assigned to my classes, or subs I made
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
        // Student logic: Only see subs assigned to enrolled classes
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

    // --- RESTORED ORIGINAL LAYOUT ---
    list.innerHTML = ''; 
    if(postSelect) postSelect.innerHTML = '';
    
    const allLi = document.createElement('li');
    allLi.className = `sub-item ${currentSubFilter === 'all' ? 'active' : ''}`;
    allLi.innerHTML = `<span>r/All</span>`;
    allLi.onclick = () => { currentSubFilter = 'all'; showFeed(); loadSubreddits(); loadPosts(); };
    list.appendChild(allLi);

    allowedSubs.forEach(sub => {
        const li = document.createElement('li');
        li.className = `sub-item ${currentSubFilter === sub.id ? 'active' : ''}`;
        
        let html = `<span onclick="selectSub('${sub.id}')">r/${sub.name}</span>`;
        if (isTeacher) html += `<span class="delete-sub-x" onclick="deleteSub('${sub.id}', '${sub.name}')">✕</span>`;
        li.innerHTML = html;
        list.appendChild(li);

        if(postSelect) {
            const opt = document.createElement('option');
            opt.value = sub.id; opt.textContent = sub.name;
            postSelect.appendChild(opt);
        }
    });
}

window.selectSub = function(id) { 
    currentSubFilter = id; 
    
    // Clean up the URL so it matches what they are looking at
    const url = new URL(window.location);
    if (id === 'all') {
        url.searchParams.delete('sub');
    } else {
        url.searchParams.set('sub', id);
    }
    window.history.pushState({}, '', url);

    showFeed(); 
    loadSubreddits(); 
    loadPosts(); 
};

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
            await updateAura(currentUser.id, 10); // +10 Aura for Initiative/Posting
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

// ========================================
// NAME MASKING SYSTEM
// ========================================

async function fetchNameMaskingSettings() {
    try {
        const { data, error } = await sb.from('name_masking_status').select('*');
        if (error) throw error;
        
        if (data) {
            data.forEach(item => {
                nameMaskingCache[item.subreddit_id] = {
                    subreddit_setting: item.subreddit_setting,
                    teacher_global_setting: item.teacher_global_setting,
                    last_change: item.last_change
                };
            });
        }
        lastPollTime = new Date();
    } catch (error) {
        console.error('Name masking fetch error:', error);
    }
}

async function checkForNameChanges() {
    if (!lastPollTime) return;
    try {
        const { data, error } = await sb.from('name_masking_status').select('*').gt('last_change', lastPollTime.toISOString());
        if (error || !data || data.length === 0) return;
        
        console.log('🎭 Name settings changed');
        data.forEach(item => {
            nameMaskingCache[item.subreddit_id] = {
                subreddit_setting: item.subreddit_setting,
                teacher_global_setting: item.teacher_global_setting,
                last_change: item.last_change
            };
        });
        lastPollTime = new Date();
        loadPosts();
    } catch (error) {
        console.error('Name masking check error:', error);
    }
}

function getEffectiveNameSetting(subredditId) {
    // Override: If the teacher checked the global 'Show Real Names' box, reveal everyone.
    if (typeof showRealNames !== 'undefined' && showRealNames === true) {
        return true;
    }

    const cached = nameMaskingCache[subredditId];
    if (!cached) return false;
    if (cached.subreddit_setting !== null && cached.subreddit_setting !== undefined) {
        return cached.subreddit_setting;
    }
    return cached.teacher_global_setting || false;
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    } else {
        if (!pollingInterval) {
            fetchNameMaskingSettings();
            pollingInterval = setInterval(checkForNameChanges, 5000);
        }
    }
});


// ================= AURA SCORE ENGINE =================
async function updateAura(userId, amount) {
    if (!userId || amount === 0) return;
    try {
        const { data } = await sb.from('profiles').select('aura_score').eq('id', userId).single();
        if (data) {
            const newScore = (data.aura_score || 0) + amount;
            await sb.from('profiles').update({ aura_score: newScore }).eq('id', userId);
            
            // If the logged-in user got points, update their badge live!
            if (currentUser && currentUser.id === userId) {
                currentUser.aura_score = newScore;
                const el = document.getElementById('auraScoreValue');
                if (el) el.innerText = newScore;
            }
        }
    } catch(err) { console.error("Aura DB Error:", err); }
}


// ================= AURA LEADERBOARD =================
window.openLeaderboard = async function() {
    document.getElementById('leaderboardModal').style.display = 'flex';
    const list = document.getElementById('leaderboardList');
    list.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">Loading champions...</div>';

    try {
        // Fetch top 10 users by aura_score
        const { data, error } = await sb.from('profiles')
            .select('id, email, aura_score')
            .order('aura_score', { ascending: false })
            .limit(10);

        if (error) throw error;

        if (!data || data.length === 0) {
            list.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No Aura scores yet! Be the first to earn points.</div>';
            return;
        }

        let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
        
        data.forEach((user, index) => {
            // Determine name to display based on teacher status & global toggle
            let displayName = getAnonName(user.id);
            if (isTeacher || (typeof showRealNames !== 'undefined' && showRealNames)) {
                displayName = user.email ? user.email.split('@')[0] : displayName;
            }

            // Assign medals to Top 3
            let rankDisplay = `<span style="color: #777; font-weight: bold;">#${index + 1}</span>`;
            if (index === 0) rankDisplay = '<span style="font-size: 1.4rem;" title="1st Place">🥇</span>';
            if (index === 1) rankDisplay = '<span style="font-size: 1.4rem;" title="2nd Place">🥈</span>';
            if (index === 2) rankDisplay = '<span style="font-size: 1.4rem;" title="3rd Place">🥉</span>';

            // Highlight the row if it belongs to the currently logged-in user
            const isMe = currentUser && currentUser.id === user.id;
            const bgClass = isMe ? 'background: #fff8e1; border-color: #ffe082;' : 'background: #f8f9fa; border-color: #eee;';

            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; border-radius: 8px; border: 1px solid transparent; ${bgClass}">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="width: 30px; text-align: center;">${rankDisplay}</div>
                        <span style="font-weight: 600; color: #333; font-size: 1.05rem;">
                            ${displayName} ${isMe ? '<span style="color: #FF8C00; font-size: 0.8rem;">(You)</span>' : ''}
                        </span>
                    </div>
                    <span style="background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); color: white; padding: 5px 12px; border-radius: 20px; font-size: 0.9rem; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        ✨ ${user.aura_score || 0}
                    </span>
                </div>
            `;
        });
        
        html += '</div>';
        list.innerHTML = html;

    } catch (err) {
        console.error("Leaderboard Error:", err);
        list.innerHTML = '<div style="color: red; padding: 20px; text-align: center;">Failed to load leaderboard.</div>';
    }
};
