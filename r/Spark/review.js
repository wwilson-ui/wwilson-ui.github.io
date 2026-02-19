// review.js
let sb = null;
let currentUser = null;
let assignmentConfig = null;
let postSequence = [];
let currentIndex = 0;
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

    // Get assignment ID from URL
    const params = new URLSearchParams(window.location.search);
    const assignmentId = params.get('a');

    if (!assignmentId) {
        document.getElementById('loading').innerHTML = '❌ No assignment specified';
        return;
    }

    await checkUser();
    await loadAssignment(assignmentId);
});


async function checkUser() {
    const { data: { session } } = await sb.auth.getSession();
    const authSection = document.getElementById('authSection'); // 1. Get the container
    
    if (session) {
        // If logged in, get their profile
        const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
        currentUser = profile;
        await loadMyVotes();

        // 2. Show Username in header if logged in
        if (authSection) {
            authSection.innerHTML = `
                <div style="font-weight: 600; color: #444;">${profile.email.split('@')[0]}</div>
            `;
        }
    } else {
        // 3. Show Google Button in header if logged out
        console.log('User not logged in, showing public view');
        if (authSection) {
            authSection.innerHTML = `
                <button onclick="signIn()" style="background: white; color: #444; border: 1px solid #ddd; padding: 6px 12px; border-radius: 4px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 0.9rem;">
                    <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg" width="18" height="18" alt="G">
                    Sign in
                </button>
            `;
        }
    }
}


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

async function loadAssignment(assignmentId) {
    // Fetch assignment config
    const { data: assignment, error } = await sb
        .from('assignments')
        .select('*')
        .eq('id', assignmentId)
        .single();

    if (error || !assignment) {
        document.getElementById('loading').innerHTML = '❌ Assignment not found';
        return;
    }

    assignmentConfig = assignment;

    // Display assignment info
    document.getElementById('assignmentName').textContent = 
        assignment.name || 'Review Assignment';
    
    const details = [];
    if (assignment.subreddit_ids) {
        const { data: subs } = await sb.from('subreddits')
            .select('name')
            .in('id', assignment.subreddit_ids);
        if (subs) {
            details.push('Sub-Sparks: ' + subs.map(s => s.name).join(', '));
        }
    }
    document.getElementById('assignmentDetails').textContent = details.join(' • ');

    // Fetch matching posts
    await loadPosts();
}

async function loadPosts() {
    let query = sb.from('posts').select(`
        *,
        subreddits(name),
        profiles(email)
    `);

    // Apply filters
    query = query.in('subreddit_id', assignmentConfig.subreddit_ids);

    if (assignmentConfig.min_votes) {
        query = query.gte('vote_count', assignmentConfig.min_votes);
    }
    if (assignmentConfig.max_votes) {
        query = query.lte('vote_count', assignmentConfig.max_votes);
    }
    if (assignmentConfig.min_comments) {
        query = query.gte('comment_count', assignmentConfig.min_comments);
    }
    if (assignmentConfig.max_comments) {
        query = query.lte('comment_count', assignmentConfig.max_comments);
    }
    if (assignmentConfig.days_ago) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - assignmentConfig.days_ago);
        query = query.gte('created_at', cutoff.toISOString());
    }
    if (assignmentConfig.exclude_own_posts && currentUser) {
        query = query.neq('user_id', currentUser.id);
    }

    const { data: posts, error } = await query;

    if (error) {
        document.getElementById('loading').innerHTML = '❌ Error loading posts';
        console.error(error);
        return;
    }

    if (!posts || posts.length === 0) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('noPostsMessage').style.display = 'block';
        return;
    }

    // Randomize posts
    if (assignmentConfig.random_per_student) {
        // Use user ID as seed for consistent randomization per student
        postSequence = shuffleWithSeed(posts, currentUser ? currentUser.id : 'anonymous');
    } else {
        // Use assignment ID as seed so everyone gets same order
        postSequence = shuffleWithSeed(posts, assignmentConfig.id);
    }

    // Limit post count
    if (assignmentConfig.post_count && postSequence.length > assignmentConfig.post_count) {
        postSequence = postSequence.slice(0, assignmentConfig.post_count);
    }

    // Check localStorage for saved position
    const savedPosition = localStorage.getItem(`assignment_${assignmentConfig.id}_position`);
    if (savedPosition) {
        currentIndex = parseInt(savedPosition);
        if (currentIndex >= postSequence.length) currentIndex = 0;
    }

    document.getElementById('loading').style.display = 'none';
    displayCurrentPost();
}

function shuffleWithSeed(array, seed) {
    // Create a seeded random function
    let seedNum = 0;
    for (let i = 0; i < seed.length; i++) {
        seedNum += seed.charCodeAt(i);
    }
    
    const random = () => {
        seedNum = (seedNum * 9301 + 49297) % 233280;
        return seedNum / 233280;
    };

    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function displayCurrentPost() {
    if (postSequence.length === 0) return;

    // Save position
    localStorage.setItem(`assignment_${assignmentConfig.id}_position`, currentIndex);

    const post = postSequence[currentIndex];

    // Update progress
    document.getElementById('progressText').textContent = 
        `Post ${currentIndex + 1} of ${postSequence.length}`;

    // Update arrows
    document.getElementById('leftArrow').classList.toggle('disabled', currentIndex === 0);
    document.getElementById('rightArrow').classList.toggle('disabled', currentIndex === postSequence.length - 1);

    // Display post
    const container = document.getElementById('postContainer');
    container.style.display = 'block';
    container.innerHTML = createPostHTML(post);

    // Load comments
    loadComments(post.id);

    // Track progress
    if (currentUser) {
        trackProgress(post.id);
    }
}


function createPostHTML(post) {
    const authorName = getAnonName(post.user_id);
    const userVote = myVotes.posts[post.id] || 0;
    const upActive = userVote === 1 ? 'active' : '';
    const downActive = userVote === -1 ? 'active' : '';
    const timestamp = formatTimestamp(post.created_at);

    return `
        <div class="post-card" style="background: white; padding: 25px; border-radius: 8px; border: 1px solid #ccc;">
            <div style="font-size: 0.9rem; color: #666; margin-bottom: 10px;">
                <strong>r/${post.subreddits ? post.subreddits.name : 'Unknown'}</strong>
                <span> • </span>
                <span>Posted by ${authorName}</span>
                <span> • </span>
                <span>${timestamp}</span>
            </div>

            <h2 style="font-size: 1.5rem; margin-bottom: 15px;">${escapeHtml(post.title)}</h2>

            ${post.content ? `<div style="margin-bottom: 15px; line-height: 1.6;">${escapeHtml(post.content)}</div>` : ''}
            ${post.image_url ? `<img src="${escapeHtml(post.image_url)}" style="max-width: 100%; border-radius: 8px; margin-bottom: 15px;">` : ''}
            ${post.url ? `<a href="${escapeHtml(post.url)}" target="_blank" style="color: #0079D3; text-decoration: none;">🔗 ${escapeHtml(post.url)}</a>` : ''}

            <div style="display: flex; align-items: center; gap: 15px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
                <button id="btn-up-post-${post.id}" class="vote-btn up ${upActive}" onclick="vote('${post.id}', 1, 'post')" style="font-size: 1.5rem;">⬆</button>
                <span id="score-post-${post.id}" class="score-text" style="font-size: 1.2rem; font-weight: bold;">${post.vote_count || 0}</span>
                <button id="btn-down-post-${post.id}" class="vote-btn down ${downActive}" onclick="vote('${post.id}', -1, 'post')" style="font-size: 1.5rem;">⬇</button>
                <span style="margin-left: 20px; color: #666;">💬 ${post.comment_count || 0} comments</span>
            </div>

            <hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">

            <h3 style="margin-bottom: 15px;">Comments</h3>

            ${currentUser ? `
                <div style="margin-bottom: 20px;">
                    <textarea id="newCommentText" placeholder="Add a comment..." style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; resize: vertical;" rows="3"></textarea>
                    <button onclick="submitComment('${post.id}')" style="margin-top: 8px; padding: 8px 16px; background: #FF4500; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Comment</button>
                </div>
            ` : `
                <div style="margin-bottom: 20px; text-align: center; padding: 20px; background: #f5f5f5; border-radius: 8px;">
                    <p style="margin-bottom: 10px; color: #666;">You must be signed in to vote or comment.</p>
                    <button onclick="signIn()" style="background: white; color: #444; border: 1px solid #ddd; padding: 10px 15px; border-radius: 4px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; font-size: 1rem;">
                        <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg" width="18" height="18" alt="G">
                        Sign in with Google
                    </button>
                </div>
            `}

            <div id="commentsList"></div>
        </div>
    `;
}



async function loadComments(postId) {
    const { data: comments } = await sb.from('comments')
        .select(`*, profiles(email)`)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

    const tree = buildCommentTree(comments || []);
    renderComments(tree, document.getElementById('commentsList'));
}

function buildCommentTree(comments) {
    const map = {}; const roots = [];
    comments.forEach(c => { c.children = []; map[c.id] = c; });
    comments.forEach(c => {
        if (c.parent_id && map[c.parent_id]) map[c.parent_id].children.push(c);
        else roots.push(c);
    });
    
    // Sort top-level by votes
    roots.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));
    
    return roots;
}

function renderComments(comments, container) {
    container.innerHTML = '';
    if (comments.length === 0) {
        container.innerHTML = '<div style="color: #999; font-style: italic;">No comments yet</div>';
        return;
    }

    comments.forEach(c => {
        const div = document.createElement('div');
        div.style.cssText = 'margin-bottom: 15px; padding: 12px; background: #f9f9f9; border-radius: 4px;';
        
        const authorName = getAnonName(c.user_id);
        const userVote = myVotes.comments[c.id] || 0;
        const upActive = userVote === 1 ? 'active' : '';
        const downActive = userVote === -1 ? 'active' : '';
        const timestamp = formatTimestamp(c.created_at);

        div.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 5px;">
                ${authorName} <span style="color: #999; font-size: 0.85rem; font-weight: normal;">${timestamp}</span>
            </div>
            <div style="margin-bottom: 8px;">${escapeHtml(c.content)}</div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <button id="btn-up-comment-${c.id}" class="vote-btn up ${upActive}" onclick="vote('${c.id}', 1, 'comment')">⬆</button>
                <span id="score-comment-${c.id}" class="score-text" style="font-size: 0.9rem;">${c.vote_count || 0}</span>
                <button id="btn-down-comment-${c.id}" class="vote-btn down ${downActive}" onclick="vote('${c.id}', -1, 'comment')">⬇</button>
            </div>
            ${c.children.length > 0 ? `<div style="margin-left: 20px; margin-top: 10px; border-left: 2px solid #ddd; padding-left: 10px;"></div>` : ''}
        `;
        
        container.appendChild(div);
        if (c.children.length > 0) {
            renderComments(c.children, div.querySelector('div:last-child'));
        }
    });
}

window.vote = async function(id, typeValue, itemType = 'post') {
    if (!currentUser) {
        alert('Please sign in to vote');
        return;
    }

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
            vote_type: typeValue
        };
        if (itemType === 'post') {
            payload.post_id = id;
            payload.comment_id = null;
        } else {
            payload.comment_id = id;
            payload.post_id = null;
        }
        
        await sb.from('votes').upsert(payload, {
            onConflict: itemType === 'post' ? 'user_id,post_id' : 'user_id,comment_id'
        });
        
        if (itemType === 'post') myVotes.posts[id] = typeValue;
        else myVotes.comments[id] = typeValue;
    }
};

function updateVoteUI(id, newValue, type) {
    const btnUp = document.getElementById(`btn-up-${type}-${id}`);
    const btnDown = document.getElementById(`btn-down-${type}-${id}`);
    const scoreSpan = document.getElementById(`score-${type}-${id}`);

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
}

window.submitComment = async function(postId) {
    if (!currentUser) {
        alert('Please sign in to comment');
        return;
    }

    const textarea = document.getElementById('newCommentText');
    const content = textarea.value.trim();
    if (!content) return;

    const { error } = await sb.from('comments').insert([{
        post_id: postId,
        user_id: currentUser.id,
        content: content
    }]);

    if (error) {
        alert('Error posting comment: ' + error.message);
    } else {
        textarea.value = '';
        loadComments(postId);
    }
};

window.nextPost = function() {
    if (currentIndex < postSequence.length - 1) {
        currentIndex++;
        displayCurrentPost();
        window.scrollTo(0, 0);
    }
};

window.previousPost = function() {
    if (currentIndex > 0) {
        currentIndex--;
        displayCurrentPost();
        window.scrollTo(0, 0);
    }
};

// Handle keyboard navigation
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') previousPost();
    if (e.key === 'ArrowRight') nextPost();
});

async function trackProgress(postId) {
    await sb.from('assignment_progress').upsert({
        assignment_id: assignmentConfig.id,
        user_id: currentUser.id,
        post_id: postId,
        viewed_at: new Date().toISOString()
    }, {
        onConflict: 'assignment_id,user_id,post_id'
    });
}

function getAnonName(userId) {
    if (!userId) return 'Anonymous';
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = ((hash << 5) - hash) + userId.charCodeAt(i);
        hash = hash & hash;
    }
    const adjIdx = Math.abs(hash) % ADJECTIVES.length;
    const animalIdx = Math.abs(hash >> 8) % ANIMALS.length;
    return `${ADJECTIVES[adjIdx]} ${ANIMALS[animalIdx]}`;
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 60) return diffMins <= 1 ? 'just now' : `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;");
}


// ================= AUTHENTICATION =================

window.signIn = async function() {
    // IMPORTANT: specific logic for Review Page
    // We want to return to THIS exact assignment, not the home page.
    const returnUrl = window.location.href;
    
    await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { 
            redirectTo: returnUrl,
            // queryParams: { hd: 'mtps.us' } // Uncomment this line if you want to restrict to school emails only
        }
    });
};
