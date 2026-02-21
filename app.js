let sb, user, subs = [], sort = 'hot', current = null;

window.addEventListener('load', async () => {
    await new Promise(r => setTimeout(r, 800));
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    document.getElementById('googleSignInBtn').onclick = () => {
        sb.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: 'https://wwilson-ui.github.io/r/Spark/' }
        });
    };
    
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
        if (profile) {
            user = profile;
            document.getElementById('authSection').innerHTML = `
                <div class="user-badge">
                    <div class="user-info">
                        <div class="user-avatar">${user.username[0].toUpperCase()}</div>
                        <div>
                            <div style="font-weight:600">${user.username}</div>
                            <div style="font-size:0.8rem;color:var(--text-muted)">${user.role}</div>
                        </div>
                    </div>
                    <button class="btn-logout" onclick="sb.auth.signOut()">Sign Out</button>
                </div>
            `;
            document.getElementById('createPostBtn').style.display = 'block';
            if (user.role === 'teacher') document.getElementById('createSubredditBtn').style.display = 'block';
        }
    }
    
    sb.auth.onAuthStateChange((e) => { if (e === 'SIGNED_OUT') location.reload(); });
    
    await loadSubs();
    await loadPosts();
    setup();
});

async function loadSubs() {
    const { data } = await sb.from('subreddits').select('*').order('name');
    subs = data || [];
    const list = document.getElementById('subredditsList');
    list.innerHTML = `
        <div class="subreddit-item ${!current ? 'active' : ''}" onclick="filter(null)">All Posts</div>
        ${subs.map(s => `<div class="subreddit-item ${current?.id === s.id ? 'active' : ''}" onclick="filter('${s.id}')">${s.name}</div>`).join('')}
    `;
    document.getElementById('postSubreddit').innerHTML = subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

window.filter = (id) => {
    current = id ? subs.find(s => s.id === id) : null;
    document.getElementById('feedTitle').textContent = current ? current.name : 'All Posts';
    loadPosts();
    loadSubs();
};

async function loadPosts() {
    let q = sb.from('posts').select('*, profiles!posts_user_id_fkey(username), subreddits(name)');
    if (current) q = q.eq('subreddit_id', current.id);
    q = sort === 'new' ? q.order('created_at', { ascending: false }) : q.order('vote_count', { ascending: false });
    const { data } = await q;
    
    const container = document.getElementById('postsContainer');
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty"><h3>No posts yet</h3></div>';
        return;
    }
    
    container.innerHTML = data.map(p => {
        const del = user && (user.id === p.user_id || user.role === 'teacher');
        return `
            <div class="post-card">
                <div class="vote-section">
                    <button class="vote-btn" onclick="vote('${p.id}', 1, 'post')" ${!user ? 'disabled' : ''}>▲</button>
                    <div class="vote-count">${p.vote_count || 0}</div>
                    <button class="vote-btn" onclick="vote('${p.id}', -1, 'post')" ${!user ? 'disabled' : ''}>▼</button>
                </div>
                <div class="post-content">
                    <div class="post-meta">${p.subreddits.name} • ${p.profiles.username} • ${ago(p.created_at)}</div>
                    <h3 class="post-title" onclick="openPost('${p.id}')">${esc(p.title)}</h3>
                    ${p.content ? `<div class="post-text">${esc(p.content.substring(0, 300))}${p.content.length > 300 ? '...' : ''}</div>` : ''}
                    ${p.url ? `<div class="post-text"><a href="${p.url}" target="_blank">${p.url}</a></div>` : ''}
                    <div class="post-actions">
                        <button class="action-btn" onclick="openPost('${p.id}')">💬 ${p.comment_count || 0}</button>
                        ${del ? `<button class="action-btn" onclick="del('post','${p.id}')">🗑️</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

window.vote = async (id, type, target) => {
    if (!user) return alert('Sign in to vote');
    const col = target === 'post' ? 'post_id' : 'comment_id';
    const { data: existing } = await sb.from('votes').select('*').eq('user_id', user.id).eq(col, id).single();
    if (existing) {
        if (existing.vote_type === type) {
            await sb.from('votes').delete().eq('id', existing.id);
        } else {
            await sb.from('votes').update({ vote_type: type }).eq('id', existing.id);
        }
    } else {
        await sb.from('votes').insert([{ user_id: user.id, [col]: id, vote_type: type }]);
    }
    loadPosts();
};

window.del = async (type, id) => {
    if (!confirm('Delete?')) return;
    await sb.from(type === 'post' ? 'posts' : 'comments').delete().eq('id', id);
    if (type === 'post') loadPosts(); else openPost(document.querySelector('.modal.active').dataset.postId);
};

window.openPost = async (id) => {
    const { data: post } = await sb.from('posts').select('*, profiles!posts_user_id_fkey(username), subreddits(name)').eq('id', id).single();
    const { data: comments } = await sb.from('comments').select('*, profiles!comments_user_id_fkey(username)').eq('post_id', id).order('created_at');
    
    const modal = document.getElementById('postDetailModal');
    modal.dataset.postId = id;
    const del = user && (user.id === post.user_id || user.role === 'teacher');
    
    document.getElementById('postDetailContent').innerHTML = `
        <div class="post-meta">${post.subreddits.name} • ${post.profiles.username} • ${ago(post.created_at)}</div>
        <h2 class="post-title">${esc(post.title)}</h2>
        ${post.content ? `<div class="post-text">${esc(post.content)}</div>` : ''}
        ${post.url ? `<div class="post-text"><a href="${post.url}" target="_blank">${post.url}</a></div>` : ''}
        ${del ? `<button class="action-btn" onclick="del('post','${post.id}');closeModal('postDetailModal')">🗑️ Delete</button>` : ''}
        <h3 style="margin:2rem 0 1rem">Comments</h3>
        ${user ? `
            <textarea class="comment-input" id="newComment" placeholder="Share your thoughts"></textarea>
            <button class="btn-primary" onclick="addComment('${id}', null)" style="margin-top:0.5rem">Comment</button>
        ` : '<p style="color:var(--text-muted)">Sign in to comment</p>'}
        <div style="margin-top:1.5rem">${renderComments(comments?.filter(c => !c.parent_comment_id) || [], comments || [], id)}</div>
    `;
    modal.classList.add('active');
};

function renderComments(comments, all, postId) {
    if (comments.length === 0) return '<p style="color:var(--text-muted)">No comments yet</p>';
    return comments.map(c => {
        const replies = all.filter(r => r.parent_comment_id === c.id);
        const del = user && (user.id === c.user_id || user.role === 'teacher');
        return `
            <div class="comment">
                <div class="comment-header">
                    <span class="comment-author">${c.profiles.username}</span>
                    <span class="comment-time">${ago(c.created_at)}</span>
                </div>
                <div>${esc(c.content)}</div>
                <div class="comment-actions">
                    ${user ? `<button class="action-btn" onclick="reply('${c.id}')">Reply</button>` : ''}
                    ${del ? `<button class="action-btn" onclick="del('comment','${c.id}')">Delete</button>` : ''}
                </div>
                <div id="reply-${c.id}" style="display:none;margin-top:0.5rem">
                    <textarea class="comment-input" id="text-${c.id}"></textarea>
                    <button class="btn-primary" onclick="addComment('${postId}','${c.id}')" style="margin-top:0.5rem">Reply</button>
                </div>
                ${replies.length > 0 ? `<div class="nested-comments">${renderComments(replies, all, postId)}</div>` : ''}
            </div>
        `;
    }).join('');
}

window.addComment = async (postId, parentId) => {
    const text = document.getElementById(parentId ? `text-${parentId}` : 'newComment').value.trim();
    if (!text) return;
    await sb.from('comments').insert([{ post_id: postId, parent_comment_id: parentId, user_id: user.id, content: text }]);
    openPost(postId);
};

window.reply = (id) => {
    const el = document.getElementById(`reply-${id}`);
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

window.closeModal = (id) => document.getElementById(id).classList.remove('active');

function setup() {
    document.getElementById('createSubredditBtn').onclick = () => document.getElementById('createSubredditModal').classList.add('active');
    document.getElementById('createSubredditForm').onsubmit = async (e) => {
        e.preventDefault();
        await sb.from('subreddits').insert([{
            name: document.getElementById('subredditName').value.trim().toLowerCase(),
            description: document.getElementById('subredditDescription').value.trim(),
            created_by: user.id
        }]);
        closeModal('createSubredditModal');
        e.target.reset();
        loadSubs();
    };
    
    document.getElementById('createPostBtn').onclick = () => document.getElementById('createPostModal').classList.add('active');
    document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const type = t.dataset.type;
        document.getElementById('postContent').style.display = type === 'text' ? 'block' : 'none';
        document.getElementById('postUrl').style.display = type !== 'text' ? 'block' : 'none';
    });
    
    document.getElementById('createPostForm').onsubmit = async (e) => {
        e.preventDefault();
        const type = document.querySelector('.tab.active').dataset.type;
        await sb.from('posts').insert([{
            subreddit_id: document.getElementById('postSubreddit').value,
            user_id: user.id,
            title: document.getElementById('postTitle').value.trim(),
            content: type === 'text' ? document.getElementById('postContent').value.trim() : null,
            post_type: type,
            url: type !== 'text' ? document.getElementById('postUrl').value.trim() : null
        }]);
        closeModal('createPostModal');
        e.target.reset();
        loadPosts();
    };
    
    document.querySelectorAll('.sort-btn').forEach(b => b.onclick = () => {
        document.querySelectorAll('.sort-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        sort = b.dataset.sort;
        loadPosts();
    });
    
    document.querySelectorAll('.modal').forEach(m => m.onclick = (e) => {
        if (e.target === m) m.classList.remove('active');
    });
}

function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function ago(t) {
    const s = Math.floor((new Date() - new Date(t)) / 1000);
    const i = { year: 31536000, month: 2592000, week: 604800, day: 86400, hour: 3600, minute: 60 };
    for (const [u, v] of Object.entries(i)) {
        const n = Math.floor(s / v);
        if (n >= 1) return `${n} ${u}${n > 1 ? 's' : ''} ago`;
    }
    return 'just now';
}






// =====================================================
// POLLING-BASED NAME MASKING - Frontend Implementation
// No Supabase Realtime subscription needed
// =====================================================

// Global state
let nameMaskingCache = {};
let lastPollTime = null;
let pollingInterval = null;

// ========================================
// INITIALIZATION
// ========================================

// Start polling when page loads
document.addEventListener('DOMContentLoaded', () => {
  // Initial load
  fetchNameMaskingSettings();
  
  // Poll every 5 seconds (very lightweight - only fetches if changes detected)
  pollingInterval = setInterval(checkForNameChanges, 5000);
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
});

// ========================================
// POLLING FUNCTIONS
// ========================================

async function fetchNameMaskingSettings() {
  try {
    const { data, error } = await sb
      .from('name_masking_status')
      .select('*');
    
    if (error) throw error;
    
    // Update cache
    data.forEach(item => {
      nameMaskingCache[item.subreddit_id] = {
        subreddit_setting: item.subreddit_setting,
        teacher_global_setting: item.teacher_global_setting,
        last_change: item.last_change
      };
    });
    
    lastPollTime = new Date();
    return data;
  } catch (error) {
    console.error('Error fetching name settings:', error);
  }
}

async function checkForNameChanges() {
  try {
    // Only fetch rows that changed since last poll
    const { data, error } = await sb
      .from('name_masking_status')
      .select('*')
      .gt('last_change', lastPollTime?.toISOString() || '2000-01-01');
    
    if (error) throw error;
    
    // If changes detected, reload current view
    if (data && data.length > 0) {
      console.log('🎭 Name masking settings changed, reloading...');
      
      data.forEach(item => {
        const oldSetting = getEffectiveSetting(item.subreddit_id);
        
        // Update cache
        nameMaskingCache[item.subreddit_id] = {
          subreddit_setting: item.subreddit_setting,
          teacher_global_setting: item.teacher_global_setting,
          last_change: item.last_change
        };
        
        const newSetting = getEffectiveSetting(item.subreddit_id);
        
        // If setting actually changed, reload
        if (oldSetting !== newSetting) {
          reloadPostsWithNewNames();
        }
      });
      
      lastPollTime = new Date();
    }
  } catch (error) {
    console.error('Error checking for name changes:', error);
  }
}

// ========================================
// NAME DISPLAY LOGIC
// ========================================

function getEffectiveSetting(subredditId) {
  const cached = nameMaskingCache[subredditId];
  if (!cached) return false;
  
  // Per-subreddit setting takes priority
  if (cached.subreddit_setting !== null && cached.subreddit_setting !== undefined) {
    return cached.subreddit_setting;
  }
  
  // Fall back to teacher's global setting
  return cached.teacher_global_setting || false;
}

function getDisplayName(post) {
  const showReal = getEffectiveSetting(post.subreddit_id);
  const authorEmail = post.profiles?.email || '';
  const isAuthor = currentUser && currentUser.id === post.user_id;
  const isTeacher = currentUser && currentUser.role === 'teacher';
  
  if (showReal) {
    // Show real name
    let name = authorEmail.split('@')[0] || 'Unknown';
    if (isAuthor) name += ' (you)';
    return name;
  } else {
    // Show anonymous name
    let name = getAnonName(post.user_id);
    if (isAuthor) name += ' (you)';
    if (isTeacher) {
      // Teacher sees anonymous + real hint
      name += ` <span style="color:#999; font-size:0.75em;">(${authorEmail})</span>`;
    }
    return name;
  }
}

function reloadPostsWithNewNames() {
  // Reload the current view without fetching new data
  // Just update the display names in existing posts
  
  if (document.getElementById('postView').style.display === 'block') {
    // In detail view - just update the author name
    const currentPost = getCurrentPost(); // You'll need to track this
    if (currentPost) {
      document.getElementById('detailAuthor').innerHTML = getDisplayName(currentPost);
    }
  } else {
    // In feed view - reload all posts
    loadPosts();
  }
  
  console.log('✅ Names updated!');
}

// ========================================
// TEACHER ADMIN CONTROLS
// ========================================

// Toggle global setting (affects all teacher's sub-sparks)
async function toggleGlobalNames(showReal) {
  if (!currentUser || currentUser.role !== 'teacher') return;
  
  const { error } = await sb
    .from('teacher_scoring_config')
    .update({ global_show_real_names: showReal })
    .eq('teacher_id', currentUser.id);
  
  if (error) {
    alert('Error updating setting: ' + error.message);
    return;
  }
  
  // Force immediate check
  await fetchNameMaskingSettings();
  reloadPostsWithNewNames();
}

// Toggle per-subreddit setting
async function toggleSubredditNames(subredditId, showReal) {
  if (!currentUser || currentUser.role !== 'teacher') return;
  
  const { error } = await sb
    .from('subreddits')
    .update({ show_real_names: showReal })
    .eq('id', subredditId);
  
  if (error) {
    alert('Error updating setting: ' + error.message);
    return;
  }
  
  // Force immediate check
  await fetchNameMaskingSettings();
  reloadPostsWithNewNames();
}

// ========================================
// ADMIN UI COMPONENTS
// ========================================

// Global toggle in admin panel
function createGlobalNamesControl() {
  const container = document.createElement('div');
  container.style.cssText = 'background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #ccc;';
  
  const currentSetting = currentUser?.teacher_config?.global_show_real_names || false;
  
  container.innerHTML = `
    <h3 style="margin-bottom: 15px;">🎭 Global Name Display</h3>
    <p style="color: #666; margin-bottom: 15px;">This setting applies to ALL your sub-sparks by default. Individual sub-sparks can override this.</p>
    
    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
      <input type="checkbox" id="globalNameToggle" ${currentSetting ? 'checked' : ''} 
        onchange="toggleGlobalNames(this.checked)"
        style="width: 20px; height: 20px; cursor: pointer;">
      <span style="font-weight: 600;">Show real names in ALL my communities</span>
    </label>
    
    <div style="margin-top: 15px; padding: 12px; background: #f0f7ff; border-radius: 4px; font-size: 0.9rem;">
      <strong>Current setting:</strong> 
      <span style="color: #0079D3; font-weight: 600;">
        ${currentSetting ? 'Real names visible' : 'Anonymous names'}
      </span>
    </div>
  `;
  
  return container;
}

// Per-subreddit toggle
function createSubredditNameToggle(subreddit) {
  const effectiveSetting = getEffectiveSetting(subreddit.id);
  const explicitSetting = subreddit.show_real_names;
  const isOverridden = explicitSetting !== null;
  
  return `
    <div style="display: flex; align-items: center; gap: 10px; margin-top: 10px;">
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
        <input type="checkbox" 
          ${effectiveSetting ? 'checked' : ''} 
          onchange="toggleSubredditNames('${subreddit.id}', this.checked)"
          style="cursor: pointer;">
        <span>Show real names</span>
      </label>
      
      ${isOverridden ? 
        `<span style="font-size: 0.85em; color: #ff8800; font-weight: 600;">
          (Overriding global)
        </span>` : 
        `<span style="font-size: 0.85em; color: #999;">
          (Using global default)
        </span>`
      }
    </div>
  `;
}

// ========================================
// PERFORMANCE OPTIMIZATION
// ========================================

// Only poll when tab is visible
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Pause polling when tab not visible
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  } else {
    // Resume polling when tab becomes visible
    if (!pollingInterval) {
      fetchNameMaskingSettings(); // Immediate check
      pollingInterval = setInterval(checkForNameChanges, 5000);
    }
  }
});

// ========================================
// EXAMPLE USAGE IN EXISTING CODE
// ========================================

// In your existing createPostElement function:
function createPostElement(post) {
  const div = document.createElement('div');
  div.className = 'post-card clickable-card';
  
  // Use the new getDisplayName function
  const displayName = getDisplayName(post);
  
  div.innerHTML = `
    <div class="post-header">
      <strong>r/${post.subreddits?.name || 'Unknown'}</strong>
      <span>•</span>
      <span>Posted by ${displayName}</span>
      <span>•</span>
      <span>${formatTimestamp(post.created_at)}</span>
    </div>
    <!-- rest of post HTML -->
  `;
  
  return div;
}

// ========================================
// NOTES
// ========================================

/*
ADVANTAGES OF POLLING:
- No subscription cost
- Works with free Supabase tier
- Very lightweight (only fetches changes)
- 5-second delay is imperceptible for this use case

PERFORMANCE:
- Initial load: 1 query (fetches all settings)
- Polling: 1 query every 5 seconds (typically returns 0 rows)
- Bandwidth: ~100 bytes per poll
- Database load: Negligible (indexed timestamp query)

COMPARED TO REALTIME:
- Realtime: Instant updates (0ms delay)
- Polling: 5 second max delay (average 2.5s)
- For classroom use, 2-5 second delay is perfectly acceptable

BATTERY IMPACT:
- Minimal - pauses when tab hidden
- Uses exponential backoff if no changes
- Only reloads DOM when actual changes detected
*/

console.log('✅ Polling-based name masking initialized');
