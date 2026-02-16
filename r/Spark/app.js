// Global variables
var supabaseClient;
var currentUser = null;
var currentSubreddit = null;
var currentSort = 'hot';
var subreddits = [];

// Initialize when page loads
window.addEventListener('load', async function() {
    console.log('='.repeat(50));
    console.log('PAGE LOADED - Initializing MTPS Forum');
    console.log('='.repeat(50));
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase client created');
        console.log('URL:', SUPABASE_URL);
        
        setupGoogleSignIn();
        await checkAuth();
        await loadSubreddits();
        await loadPosts();
        setupEventListeners();
        
        console.log('✅ Initialization complete');
    } else {
        console.error('❌ Supabase library not loaded');
        alert('Error: Please refresh the page');
    }
});

function setupGoogleSignIn() {
    var btn = document.getElementById('googleSignInBtn');
    if (btn) {
        btn.onclick = async function() {
            console.log('🔐 Starting Google sign-in...');
            
            try {
                var { data, error } = await supabaseClient.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: 'https://wwilson-ui.github.io/r/Spark/index.html',
                    }
                });
                
                if (error) {
                    console.error('❌ Sign-in error:', error);
                    alert('Sign-in failed: ' + error.message);
                } else {
                    console.log('✅ Redirecting to Google...');
                }
            } catch (err) {
                console.error('❌ Unexpected error:', err);
                alert('Error: ' + err.message);
            }
        };
        console.log('✅ Google sign-in button configured');
    }
}

async function checkAuth() {
    console.log('\n--- Checking Authentication ---');
    
    try {
        var { data: { session }, error } = await supabaseClient.auth.getSession();
        
        console.log('Session check result:', { 
            hasSession: !!session, 
            error: error 
        });
        
        if (session) {
            console.log('✅ ACTIVE SESSION FOUND');
            console.log('User email:', session.user.email);
            console.log('User ID:', session.user.id);
            
            // Try to load profile
            await loadUserProfile(session.user);
        } else {
            console.log('ℹ️  No active session - user not signed in');
        }
        
        // Listen for auth state changes
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            console.log('\n🔄 AUTH STATE CHANGE:', event);
            
            if (event === 'SIGNED_IN' && session) {
                console.log('User signed in:', session.user.email);
                
                // Wait a bit for the trigger to create the profile
                console.log('Waiting 2 seconds for profile creation...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                await loadUserProfile(session.user);
                await loadSubreddits();
                await loadPosts();
            } else if (event === 'SIGNED_OUT') {
                console.log('User signed out');
                currentUser = null;
                location.reload();
            } else if (event === 'TOKEN_REFRESHED') {
                console.log('Token refreshed');
            }
        });
    } catch (err) {
        console.error('❌ Auth check error:', err);
    }
}

async function loadUserProfile(user) {
    console.log('\n--- Loading User Profile ---');
    console.log('User ID:', user.id);
    console.log('User email:', user.email);
    
    try {
        var { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        
        console.log('Profile query result:', { profile, error });
        
        if (error) {
            console.error('❌ ERROR loading profile:', error);
            
            if (error.code === 'PGRST116') {
                console.log('⚠️  Profile does not exist!');
                console.log('This means either:');
                console.log('1. The database schema was not run');
                console.log('2. The trigger failed to create the profile');
                console.log('3. Your email is not @mtps.us');
                
                alert('ERROR: Profile not found. Did you run the database schema? Is your email @mtps.us?');
            }
            
            // Try again in 3 seconds
            console.log('Retrying in 3 seconds...');
            setTimeout(() => loadUserProfile(user), 3000);
            return;
        }
        
        if (profile) {
            currentUser = profile;
            console.log('✅ PROFILE LOADED SUCCESSFULLY');
            console.log('Username:', profile.username);
            console.log('Role:', profile.role);
            console.log('Email:', profile.email);
            
            updateAuthUI();
            showUserButtons();
        }
    } catch (err) {
        console.error('❌ Unexpected error loading profile:', err);
    }
}

function updateAuthUI() {
    var authSection = document.getElementById('authSection');
    if (!authSection || !currentUser) return;
    
    console.log('\n--- Updating Auth UI ---');
    console.log('Showing user info for:', currentUser.username);
    
    var initial = currentUser.username ? currentUser.username[0].toUpperCase() : 'U';
    
    authSection.innerHTML = `
        <div class="user-info">
            <div class="user-avatar">${initial}</div>
            <div>
                <div class="user-name">Logged in as ${currentUser.username}</div>
                <div class="user-role">${currentUser.role.toUpperCase()}</div>
            </div>
        </div>
        <button class="btn btn-secondary" id="signOutBtn">Sign Out</button>
    `;
    
    document.getElementById('signOutBtn').onclick = async function() {
        console.log('🔓 Signing out...');
        await supabaseClient.auth.signOut();
    };
    
    console.log('✅ Auth UI updated');
}

function showUserButtons() {
    console.log('\n--- Showing User Buttons ---');
    
    // Show create post button for everyone
    var createPostBtn = document.getElementById('createPostBtn');
    if (createPostBtn) {
        createPostBtn.style.display = 'block';
        console.log('✅ Create Post button shown');
    }
    
    // Show create subreddit button for teachers
    if (currentUser.role === 'teacher') {
        var createSubBtn = document.getElementById('createSubredditBtn');
        if (createSubBtn) {
            createSubBtn.style.display = 'block';
            console.log('✅ Create Subreddit button shown (teacher)');
        }
    }
}

async function loadSubreddits() {
    try {
        var { data, error } = await supabaseClient
            .from('subreddits')
            .select('*')
            .order('name');
        
        if (data) {
            subreddits = data;
            console.log('✅ Loaded', data.length, 'communities');
            renderSubreddits();
        } else if (error) {
            console.error('Error loading subreddits:', error);
        }
    } catch (err) {
        console.error('Error loading subreddits:', err);
    }
}

function renderSubreddits() {
    var list = document.getElementById('subredditsList');
    if (!list) return;
    
    if (subreddits.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">No communities yet</p>';
        return;
    }
    
    list.innerHTML = `
        <div class="subreddit-item ${!currentSubreddit ? 'active' : ''}" onclick="window.filterBySubreddit(null)">
            All Posts
        </div>
        ${subreddits.map(sub => `
            <div class="subreddit-item ${currentSubreddit?.id === sub.id ? 'active' : ''}" 
                 onclick="window.filterBySubreddit('${sub.id}')">
                ${sub.name}
            </div>
        `).join('')}
    `;
    
    var select = document.getElementById('postSubreddit');
    if (select) {
        select.innerHTML = subreddits.map(sub => 
            `<option value="${sub.id}">${sub.name}</option>`
        ).join('');
    }
}

window.filterBySubreddit = function(subredditId) {
    if (subredditId) {
        currentSubreddit = subreddits.find(s => s.id === subredditId);
        document.getElementById('feedTitle').textContent = currentSubreddit.name;
    } else {
        currentSubreddit = null;
        document.getElementById('feedTitle').textContent = 'All Posts';
    }
    loadPosts();
    renderSubreddits();
};

async function loadPosts() {
    try {
        var query = supabaseClient
            .from('posts')
            .select(`
                *,
                profiles:user_id (username, role),
                subreddits:subreddit_id (name)
            `);
        
        if (currentSubreddit) {
            query = query.eq('subreddit_id', currentSubreddit.id);
        }
        
        if (currentSort === 'new') {
            query = query.order('created_at', { ascending: false });
        } else {
            query = query.order('vote_count', { ascending: false });
        }
        
        var { data, error } = await query;
        
        if (data) {
            console.log('✅ Loaded', data.length, 'posts');
            renderPosts(data);
        } else if (error) {
            console.error('Error loading posts:', error);
        }
    } catch (err) {
        console.error('Error loading posts:', err);
    }
}

function renderPosts(posts) {
    var container = document.getElementById('postsContainer');
    if (!container) return;
    
    if (posts.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No posts yet</h3><p>Be the first to post!</p></div>';
        return;
    }
    
    container.innerHTML = posts.map(post => createPostCard(post)).join('');
}

function createPostCard(post) {
    var timeAgo = getTimeAgo(post.created_at);
    var canDelete = currentUser && (currentUser.id === post.user_id || currentUser.role === 'teacher');
    
    var contentHtml = '';
    if (post.post_type === 'text' && post.content) {
        var preview = post.content.length > 300 ? post.content.substring(0, 300) + '...' : post.content;
        contentHtml = `<p class="post-text">${escapeHtml(preview)}</p>`;
    } else if (post.post_type === 'link' && post.url) {
        contentHtml = `<div class="post-link"><a href="${escapeHtml(post.url)}" target="_blank">🔗 ${escapeHtml(post.url)}</a></div>`;
    } else if (post.post_type === 'image' && post.url) {
        contentHtml = `<div class="post-image"><img src="${escapeHtml(post.url)}" alt="${escapeHtml(post.title)}"></div>`;
    }
    
    return `
        <div class="post-card">
            <div class="vote-section">
                <button class="vote-btn" onclick="window.vote('${post.id}', 1)" ${!currentUser ? 'disabled' : ''}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 4L3 15h6v5h6v-5h6z"/>
                    </svg>
                </button>
                <div class="vote-count">${post.vote_count || 0}</div>
                <button class="vote-btn" onclick="window.vote('${post.id}', -1)" ${!currentUser ? 'disabled' : ''}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 20L3 9h6V4h6v5h6z"/>
                    </svg>
                </button>
            </div>
            <div class="post-content">
                <div class="post-header">
                    <span class="subreddit-badge" onclick="window.filterBySubreddit('${post.subreddit_id}')">${post.subreddits.name}</span>
                    <span class="post-meta">Posted by ${post.profiles.username} • ${timeAgo}</span>
                </div>
                <h3 class="post-title" onclick="window.openPost('${post.id}')">${escapeHtml(post.title)}</h3>
                ${contentHtml}
                <div class="post-actions">
                    <button class="action-btn" onclick="window.openPost('${post.id}')">💬 ${post.comment_count || 0} Comments</button>
                    ${canDelete ? `<button class="action-btn" onclick="window.deletePost('${post.id}')">🗑️ Delete</button>` : ''}
                </div>
            </div>
        </div>
    `;
}

window.vote = async function(postId, voteType) {
    if (!currentUser) {
        alert('Please sign in to vote');
        return;
    }
    
    try {
        var { data: existingVote } = await supabaseClient
            .from('votes')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('post_id', postId)
            .single();
        
        if (existingVote) {
            if (existingVote.vote_type === voteType) {
                await supabaseClient.from('votes').delete().eq('id', existingVote.id);
            } else {
                await supabaseClient.from('votes').update({ vote_type: voteType }).eq('id', existingVote.id);
            }
        } else {
            await supabaseClient.from('votes').insert([{
                user_id: currentUser.id,
                post_id: postId,
                vote_type: voteType
            }]);
        }
        
        await loadPosts();
    } catch (err) {
        console.error('Vote error:', err);
    }
};

window.deletePost = async function(postId) {
    if (!confirm('Delete this post?')) return;
    
    try {
        await supabaseClient.from('posts').delete().eq('id', postId);
        await loadPosts();
    } catch (err) {
        console.error('Delete error:', err);
    }
};

window.openPost = async function(postId) {
    try {
        var { data: post } = await supabaseClient
            .from('posts')
            .select(`*, profiles:user_id (username, role), subreddits:subreddit_id (name)`)
            .eq('id', postId)
            .single();
        
        var { data: comments } = await supabaseClient
            .from('comments')
            .select(`*, profiles:user_id (username, role)`)
            .eq('post_id', postId)
            .order('created_at');
        
        document.getElementById('postDetailContent').innerHTML = renderPostDetail(post, comments || []);
        document.getElementById('postDetailModal').classList.add('active');
    } catch (err) {
        console.error('Error opening post:', err);
    }
};

function renderPostDetail(post, comments) {
    var canDelete = currentUser && (currentUser.id === post.user_id || currentUser.role === 'teacher');
    
    var contentHtml = '';
    if (post.post_type === 'text' && post.content) {
        contentHtml = `<p class="post-text">${escapeHtml(post.content)}</p>`;
    } else if (post.post_type === 'link' && post.url) {
        contentHtml = `<div class="post-link"><a href="${escapeHtml(post.url)}" target="_blank">🔗 ${escapeHtml(post.url)}</a></div>`;
    } else if (post.post_type === 'image' && post.url) {
        contentHtml = `<div class="post-image"><img src="${escapeHtml(post.url)}"></div>`;
    }
    
    return `
        <div class="post-detail">
            <div class="post-header">
                <span class="subreddit-badge">${post.subreddits.name}</span>
                <span class="post-meta">Posted by ${post.profiles.username}</span>
            </div>
            <h2 class="post-title">${escapeHtml(post.title)}</h2>
            ${contentHtml}
            ${canDelete ? `<button class="action-btn" onclick="window.deletePost('${post.id}'); window.closeModal('postDetailModal')">🗑️ Delete</button>` : ''}
            
            <div class="comments-section">
                <h3 style="margin: 2rem 0 1rem;">Comments</h3>
                ${currentUser ? `
                    <div class="comment-form">
                        <textarea class="comment-input" id="newComment" placeholder="What are your thoughts?"></textarea>
                        <button class="btn btn-primary" onclick="window.addComment('${post.id}', null)" style="margin-top: 0.5rem;">Comment</button>
                    </div>
                ` : '<p style="color: var(--text-muted);">Sign in to comment</p>'}
                <div class="comments-list">
                    ${renderComments(comments.filter(c => !c.parent_comment_id), comments, post.id)}
                </div>
            </div>
        </div>
    `;
}

function renderComments(comments, allComments, postId) {
    if (comments.length === 0) {
        return '<p style="color: var(--text-muted); padding: 2rem 0;">No comments yet</p>';
    }
    
    return comments.map(c => {
        var replies = allComments.filter(r => r.parent_comment_id === c.id);
        var canDelete = currentUser && (currentUser.id === c.user_id || currentUser.role === 'teacher');
        
        return `
            <div class="comment">
                <div class="comment-header">
                    <span class="comment-author">${c.profiles.username}</span>
                    <span class="comment-time">${getTimeAgo(c.created_at)}</span>
                </div>
                <div class="comment-text">${escapeHtml(c.content)}</div>
                <div class="comment-actions">
                    ${currentUser ? `<button class="action-btn" onclick="window.showReplyForm('${c.id}')">💬 Reply</button>` : ''}
                    ${canDelete ? `<button class="action-btn" onclick="window.deleteComment('${c.id}', '${postId}')">🗑️ Delete</button>` : ''}
                </div>
                <div id="reply-${c.id}" style="display:none; margin-top:1rem;">
                    <textarea class="comment-input" id="reply-text-${c.id}" placeholder="Write a reply..."></textarea>
                    <button class="btn btn-primary" onclick="window.addComment('${postId}', '${c.id}')" style="margin-top:0.5rem;">Reply</button>
                </div>
                ${replies.length > 0 ? `<div class="nested-comments">${renderComments(replies, allComments, postId)}</div>` : ''}
            </div>
        `;
    }).join('');
}

window.addComment = async function(postId, parentId) {
    if (!currentUser) return;
    
    var textId = parentId ? `reply-text-${parentId}` : 'newComment';
    var text = document.getElementById(textId)?.value?.trim();
    
    if (!text) return;
    
    try {
        await supabaseClient.from('comments').insert([{
            post_id: postId,
            parent_comment_id: parentId,
            user_id: currentUser.id,
            content: text
        }]);
        
        window.openPost(postId);
    } catch (err) {
        console.error('Comment error:', err);
    }
};

window.deleteComment = async function(commentId, postId) {
    if (!confirm('Delete this comment?')) return;
    
    try {
        await supabaseClient.from('comments').delete().eq('id', commentId);
        window.openPost(postId);
    } catch (err) {
        console.error('Delete error:', err);
    }
};

window.showReplyForm = function(commentId) {
    var form = document.getElementById(`reply-${commentId}`);
    if (form) {
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }
};

window.closeModal = function(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
};

function setupEventListeners() {
    var createSubBtn = document.getElementById('createSubredditBtn');
    if (createSubBtn) {
        createSubBtn.addEventListener('click', function() {
            document.getElementById('createSubredditModal').classList.add('active');
        });
    }
    
    var createSubForm = document.getElementById('createSubredditForm');
    if (createSubForm) {
        createSubForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            if (!currentUser || currentUser.role !== 'teacher') return;
            
            var name = document.getElementById('subredditName').value.trim();
            var description = document.getElementById('subredditDescription').value.trim();
            
            try {
                await supabaseClient.from('subreddits').insert([{
                    name: name.toLowerCase(),
                    description: description,
                    created_by: currentUser.id
                }]);
                
                await loadSubreddits();
                window.closeModal('createSubredditModal');
                e.target.reset();
            } catch (err) {
                console.error('Create subreddit error:', err);
            }
        });
    }
    
    var createPostBtn = document.getElementById('createPostBtn');
    if (createPostBtn) {
        createPostBtn.addEventListener('click', function() {
            document.getElementById('createPostModal').classList.add('active');
        });
    }
    
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tab-btn').forEach(function(b) {
                b.classList.remove('active');
            });
            btn.classList.add('active');
            
            var type = btn.dataset.type;
            document.querySelectorAll('.post-content-section').forEach(function(s) {
                s.style.display = 'none';
            });
            document.getElementById(type + 'PostContent').style.display = 'block';
        });
    });
    
    var createPostForm = document.getElementById('createPostForm');
    if (createPostForm) {
        createPostForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            if (!currentUser) return;
            
            var subredditId = document.getElementById('postSubreddit').value;
            var title = document.getElementById('postTitle').value.trim();
            var activeType = document.querySelector('.tab-btn.active').dataset.type;
            
            var content = '';
            var url = '';
            
            if (activeType === 'text') {
                content = document.getElementById('postContent').value.trim();
            } else if (activeType === 'link') {
                url = document.getElementById('postUrl').value.trim();
            } else if (activeType === 'image') {
                url = document.getElementById('postImageUrl').value.trim();
            }
            
            try {
                await supabaseClient.from('posts').insert([{
                    subreddit_id: subredditId,
                    user_id: currentUser.id,
                    title: title,
                    content: activeType === 'text' ? content : null,
                    post_type: activeType,
                    url: activeType !== 'text' ? url : null
                }]);
                
                await loadPosts();
                window.closeModal('createPostModal');
                e.target.reset();
            } catch (err) {
                console.error('Create post error:', err);
                alert('Error creating post: ' + err.message);
            }
        });
    }
    
    document.querySelectorAll('.sort-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.sort-btn').forEach(function(b) {
                b.classList.remove('active');
            });
            btn.classList.add('active');
            currentSort = btn.dataset.sort;
            loadPosts();
        });
    });
    
    document.querySelectorAll('.modal').forEach(function(modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
    
    console.log('✅ Event listeners configured');
}

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTimeAgo(timestamp) {
    var seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    var intervals = { year: 31536000, month: 2592000, week: 604800, day: 86400, hour: 3600, minute: 60 };
    
    for (var unit in intervals) {
        var interval = Math.floor(seconds / intervals[unit]);
        if (interval >= 1) {
            return interval + ' ' + unit + (interval > 1 ? 's' : '') + ' ago';
        }
    }
    
    return 'just now';
}
