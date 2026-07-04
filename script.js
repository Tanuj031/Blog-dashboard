/* ============================================================
   FIREBASE CONFIGURATION & INITIALIZATION
   ============================================================ */

// TODO: Update Firestore security rules before production to restrict write access to authenticated owner only
// Current Firestore rules should be in "test mode" (allow read/write) for development

const firebaseConfig = {
    apiKey: "AIzaSyAF8iFIK9d8pG-qeWljUAP5AJOUmaXrl4E",
    authDomain: "legal-blog-cada8.firebaseapp.com",
    projectId: "legal-blog-cada8",
    storageBucket: "legal-blog-cada8.firebasestorage.app",
    messagingSenderId: "200974115018",
    appId: "1:200974115018:web:fe5714033bbbcda85f1433",
    measurementId: "G-ELMMENN7CL"
};

// Initialize Firebase App & Firestore
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore(app);

// Reference to the "articles" collection in Firestore
const articlesCollection = db.collection('articles');
const commentsCollection = db.collection('comments');

/* ============================================================
   CONSTANTS & STATE
   ============================================================ */

const EDITOR_PASSWORD = 'admin123';
const WORDS_PER_MINUTE = 200;

/** @type {'light' | 'dark'} */
let currentTheme = 'dark';

/** @type {'home' | 'article' | 'editor'} */
let currentView = 'home';

/** @type {string | null} */
let activeArticleId = null;

/** @type {string} */
let activeCategoryFilter = 'all';

/** @type {string} */
let searchQuery = '';

/** @type {boolean} */
let isEditorAuthenticated = sessionStorage.getItem('isEditorAuthenticated') === 'true';

/** @type {string | null} - ID of article being edited, null when creating new */
let editingArticleId = null;

/** @type {string | null} - ID of article pending deletion (for confirm modal) */
let pendingDeleteArticleId = null;

/**
 * Article schema — structured for Firestore cloud persistence
 * @typedef {Object} Article
 * @property {string} id           - Firestore document ID
 * @property {string} title
 * @property {string} subheading
 * @property {string} category
 * @property {string} body
 * @property {string} publishedDate - ISO date string
 * @property {number} readTimeMinutes
 * @property {string} accentClass
 */

/** @type {Article[]} - Local cache of articles synced from Firestore in real-time */
let articles = [];

/** @type {boolean} - Tracks whether initial Firestore fetch has completed */
let articlesLoaded = false;

/** @type {(() => void) | null} - Unsubscribe function for active comments listener */
let commentsUnsubscribe = null;

/* ============================================================
   DOM REFERENCES
   ============================================================ */

const DOM = {
    body: document.body,
    logoLink: document.getElementById('logo-link'),
    themeToggle: document.getElementById('theme-toggle'),
    searchInput: document.getElementById('search-input'),
    searchContainer: document.getElementById('search-container'),
    categoriesBtn: document.getElementById('categories-btn'),
    categoriesMenu: document.getElementById('categories-menu'),
    categoryItems: document.querySelectorAll('.category-item'),
    homepageView: document.getElementById('homepage-view'),
    articleView: document.getElementById('article-view'),
    editorView: document.getElementById('editor-view'),
    articlesGrid: document.getElementById('articles-grid'),
    emptyStateHome: document.getElementById('empty-state-home'),
    activeFilterLabel: document.getElementById('active-filter-label'),
    sidebarArticleList: document.getElementById('sidebar-article-list'),
    emptyStateSidebar: document.getElementById('empty-state-sidebar'),
    backToHome: document.getElementById('back-to-home'),
    backFromEditor: document.getElementById('back-from-editor'),
    footerLockBtn: document.getElementById('footer-lock-btn'),
    articleCategoryBadge: document.getElementById('article-category-badge'),
    articleFullTitle: document.getElementById('article-full-title'),
    articleFullSubheading: document.getElementById('article-full-subheading'),
    articleFullDate: document.getElementById('article-full-date'),
    articleFullReadtime: document.getElementById('article-full-readtime'),
    articleBodyContent: document.getElementById('article-body-content'),
    downloadPdfBtn: document.getElementById('download-pdf-btn'),
    commentForm: document.getElementById('comment-form'),
    commentName: document.getElementById('comment-name'),
    commentText: document.getElementById('comment-text'),
    commentsList: document.getElementById('comments-list'),
    noCommentsText: document.getElementById('no-comments-text'),
    editorTitle: document.getElementById('editor-title'),
    editorSubheading: document.getElementById('editor-subheading'),
    editorCategory: document.getElementById('editor-category'),
    editorBody: document.getElementById('editor-body'),
    publishBtn: document.getElementById('publish-btn'),
    passwordModalOverlay: document.getElementById('password-modal-overlay'),
    passwordForm: document.getElementById('password-form'),
    passwordInput: document.getElementById('password-input'),
    passwordCancelBtn: document.getElementById('password-cancel-btn'),
    profilePicInput: document.getElementById('profile-pic-input'),
    profilePreview: document.getElementById('profile-preview'),
    resetProfileBtn: document.getElementById('reset-profile-btn'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message'),
    deleteModalOverlay: document.getElementById('delete-modal-overlay'),
    deleteModalTitle: document.getElementById('delete-modal-title'),
    deleteConfirmBtn: document.getElementById('delete-confirm-btn'),
    deleteCancelBtn: document.getElementById('delete-cancel-btn'),
    fullArticleOwnerDot: document.getElementById('full-article-owner-dot'),
    fullArticleOwnerActions: document.getElementById('full-article-owner-actions'),
    fullEditBtn: document.getElementById('full-edit-btn'),
    fullDeleteBtn: document.getElementById('full-delete-btn')
};

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */

/**
 * Maps category name to CSS accent class
 * @param {string} category
 * @returns {string}
 */
function getCategoryAccentClass(category) {
    const map = {
        'Criminal Law': 'category-criminal-law',
        'Constitutional Law': 'category-constitutional-law',
        'Case Analysis': 'category-case-analysis',
        'Legal Tech': 'category-legal-tech',
        'Current Affairs': 'category-current-affairs',
        'Other': 'category-other'
    };
    return map[category] || 'category-other';
}

/**
 * Formats ISO date to readable string (e.g., "July 4, 2026")
 * @param {string} isoDate
 * @returns {string}
 */
function formatDate(isoDate) {
    return new Date(isoDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Estimates read time from word count
 * @param {string} text
 * @returns {number}
 */
function calculateReadTime(text) {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/**
 * Creates a plain-text excerpt from body content
 * @param {string} body
 * @param {number} maxLength
 * @returns {string}
 */
function createExcerpt(body, maxLength = 140) {
    const plain = body
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    if (plain.length <= maxLength) return plain;
    return `${plain.slice(0, maxLength).trim()}…`;
}

/**
 * Parses legal formatting markers in article body
 * *Case Name* → italics, **Section X** → bold, paragraphs on blank lines
 * @param {string} body
 * @returns {string}
 */
function parseLegalBody(body) {
    const escaped = body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const paragraphs = escaped.split(/\n\s*\n/).filter(p => p.trim());

    return paragraphs
        .map(para => {
            let html = para.trim()
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/\*([^*]+)\*/g, '<em>$1</em>')
                .replace(/\n/g, '<br>');
            return `<p>${html}</p>`;
        })
        .join('');
}

/**
 * Shows a toast notification
 * @param {string} message
 * @param {number} duration
 */
function showToast(message, duration = 3000) {
    DOM.toastMessage.textContent = message;
    DOM.toast.classList.add('show');
    setTimeout(() => DOM.toast.classList.remove('show'), duration);
}

/**
 * Auto-expands textarea height to fit content (respects CSS min-height)
 * @param {HTMLTextAreaElement} textarea
 */
function adjustTextareaHeight(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    const minHeight = parseInt(getComputedStyle(textarea).minHeight, 10) || 0;
    const manualHeight = parseInt(textarea.dataset.manualHeight, 10) || 0;
    const targetHeight = Math.max(textarea.scrollHeight, minHeight, manualHeight);
    textarea.style.height = `${targetHeight}px`;
}

/**
 * Enables drag-to-resize on the home editor body field
 * @param {HTMLButtonElement} handle
 * @param {HTMLTextAreaElement} textarea
 */
function initBodyResizeHandle(handle, textarea) {
    if (!handle || !textarea) return;

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startY = e.clientY;
        const startHeight = textarea.offsetHeight;

        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';

        const onMouseMove = (moveEvent) => {
            const minHeight = parseInt(getComputedStyle(textarea).minHeight, 10) || 150;
            const newHeight = Math.max(minHeight, startHeight + (moveEvent.clientY - startY));
            textarea.dataset.manualHeight = String(newHeight);
            textarea.style.height = `${newHeight}px`;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            adjustTextareaHeight(textarea);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

/* ============================================================
   FILTERING & SEARCH
   ============================================================ */

/**
 * Returns articles filtered by category and search query
 * @returns {Article[]}
 */
function getFilteredArticles() {
    let result = [...articles];

    if (activeCategoryFilter !== 'all') {
        result = result.filter(a => a.category === activeCategoryFilter);
    }

    if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        result = result.filter(a =>
            a.title.toLowerCase().includes(query) ||
            a.subheading.toLowerCase().includes(query) ||
            a.body.toLowerCase().includes(query) ||
            a.category.toLowerCase().includes(query)
        );
    }

    return result.sort((a, b) => new Date(b.publishedDate) - new Date(a.publishedDate));
}

/**
 * Finds article by ID from local cache
 * @param {string} id
 * @returns {Article | undefined}
 */
function getArticleById(id) {
    return articles.find(a => a.id === id);
}

/* ============================================================
   RENDERING
   ============================================================ */

/**
 * Renders SVG icon for article cards/sidebar
 * @returns {string}
 */
function getArticleIconSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
}

/**
 * Shows a loading indicator in the articles grid while fetching from Firestore
 */
function showLoadingState() {
    DOM.articlesGrid.innerHTML = `
        <div class="loading-state" style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-muted, #6b7280);">
            <div class="loading-spinner" style="
                width: 36px; height: 36px; margin: 0 auto 1rem;
                border: 3px solid var(--border-color, #e5e7eb);
                border-top-color: var(--accent-color, #8b5cf6);
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
            "></div>
            <p style="font-size: 0.95rem; font-weight: 500;">Loading articles...</p>
        </div>
    `;
    DOM.emptyStateHome.classList.add('hidden');

    // Inject spinner keyframes if not already present
    if (!document.getElementById('loading-spinner-style')) {
        const style = document.createElement('style');
        style.id = 'loading-spinner-style';
        style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
        document.head.appendChild(style);
    }
}

/**
 * Renders homepage article preview cards
 */
function renderHomepage() {
    // If articles haven't loaded from Firestore yet, show loading state
    if (!articlesLoaded) {
        showLoadingState();
        return;
    }

    const filtered = getFilteredArticles();
    DOM.articlesGrid.innerHTML = '';

    const hasFilter = activeCategoryFilter !== 'all' || searchQuery.trim();
    if (hasFilter) {
        const parts = [];
        if (activeCategoryFilter !== 'all') parts.push(activeCategoryFilter);
        if (searchQuery.trim()) parts.push(`"${searchQuery.trim()}"`);
        DOM.activeFilterLabel.textContent = `Showing results for ${parts.join(' · ')}`;
    } else {
        DOM.activeFilterLabel.textContent = '';
    }

    if (filtered.length === 0) {
        DOM.emptyStateHome.classList.remove('hidden');
        const msgEl = DOM.emptyStateHome.querySelector('.empty-state-message');
        if (articles.length === 0) {
            msgEl.textContent = 'No articles published yet';
        } else {
            msgEl.textContent = 'No matching articles — try a different search or category filter.';
        }
        return;
    }

    DOM.emptyStateHome.classList.add('hidden');

    filtered.forEach(article => {
        const card = document.createElement('article');
        card.className = 'article-card';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Read article: ${article.title}`);

        // Build owner action buttons (only shown when authenticated)
        const ownerActionsHtml = isEditorAuthenticated ? `
            <div class="card-owner-actions">
                <button class="card-action-btn card-edit-btn" title="Edit article" aria-label="Edit article">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    <span>Edit</span>
                </button>
                <button class="card-action-btn card-delete-btn" title="Delete article" aria-label="Delete article">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    <span>Delete</span>
                </button>
            </div>
        ` : '';

        card.innerHTML = `
            <div class="card-top-row">
                <div class="card-icon-square ${article.accentClass}" aria-hidden="true">
                    ${getArticleIconSvg()}
                </div>
                <div class="card-body">
                    <span class="card-category-badge">${escapeHtml(article.category)}</span>
                    <h2 class="card-title">${escapeHtml(article.title)}</h2>
                    <p class="card-excerpt">${escapeHtml(createExcerpt(article.body))}</p>
                    <div class="card-footer">
                        <span class="card-meta-info">${formatDate(article.publishedDate)} · ${article.readTimeMinutes} min read</span>
                        <span class="card-read-link">Read Article →</span>
                    </div>
                </div>
            </div>
            ${ownerActionsHtml}
        `;

        // Wire up edit button (stop propagation so card click doesn't fire)
        const editBtn = card.querySelector('.card-edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                editArticle(article.id);
            });
        }

        // Wire up delete button
        const deleteBtn = card.querySelector('.card-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                confirmDeleteArticle(article.id, article.title);
            });
        }

        card.addEventListener('click', () => navigateToArticle(article.id));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigateToArticle(article.id);
            }
        });

        DOM.articlesGrid.appendChild(card);
    });
}

/**
 * Renders sidebar article list (excludes current article when viewing one)
 */
function renderSidebar() {
    const sidebarArticles = articles
        .filter(a => a.id !== activeArticleId)
        .sort((a, b) => new Date(b.publishedDate) - new Date(a.publishedDate))
        .slice(0, 6);

    DOM.sidebarArticleList.innerHTML = '';

    if (sidebarArticles.length === 0) {
        DOM.emptyStateSidebar.classList.remove('hidden');
        return;
    }

    DOM.emptyStateSidebar.classList.add('hidden');

    sidebarArticles.forEach(article => {
        const item = document.createElement('div');
        item.className = 'sidebar-article-item';
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.innerHTML = `
            <div class="sidebar-item-icon ${article.accentClass}" aria-hidden="true">
                ${getArticleIconSvg()}
            </div>
            <div class="sidebar-item-content">
                <span class="sidebar-item-title">${escapeHtml(article.title)}</span>
                <span class="sidebar-item-excerpt">${escapeHtml(createExcerpt(article.body, 80))}</span>
                <span class="sidebar-item-link">Read Article →</span>
            </div>
        `;

        item.addEventListener('click', () => navigateToArticle(article.id));
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigateToArticle(article.id);
            }
        });

        DOM.sidebarArticleList.appendChild(item);
    });
}

/**
 * Renders full article page
 * @param {string} articleId
 */
function renderArticlePage(articleId) {
    const article = getArticleById(articleId);
    if (!article) {
        navigateToHome();
        return;
    }

    activeArticleId = articleId;

    DOM.articleCategoryBadge.textContent = article.category;
    DOM.articleFullTitle.textContent = article.title;
    DOM.articleFullSubheading.textContent = article.subheading;
    DOM.articleFullDate.textContent = formatDate(article.publishedDate);
    DOM.articleFullReadtime.textContent = `${article.readTimeMinutes} min read`;
    DOM.articleBodyContent.innerHTML = parseLegalBody(article.body);

    if (isEditorAuthenticated) {
        DOM.fullArticleOwnerDot?.classList.remove('hidden');
        DOM.fullArticleOwnerActions?.classList.remove('hidden');
    } else {
        DOM.fullArticleOwnerDot?.classList.add('hidden');
        DOM.fullArticleOwnerActions?.classList.add('hidden');
    }

    subscribeToComments(articleId);
    renderSidebar();
}

/**
 * Sets up a real-time listener for comments of a specific article.
 * @param {string} articleId
 */
function subscribeToComments(articleId) {
    // Unsubscribe from any active comments listener
    unsubscribeFromComments();

    DOM.commentsList.innerHTML = '';
    DOM.noCommentsText.classList.add('hidden');

    try {
        // Query comments belonging to this article. We perform client-side sorting 
        // to avoid requiring a custom composite Firestore index.
        commentsUnsubscribe = commentsCollection
            .where('articleId', '==', articleId)
            .onSnapshot(
                (snapshot) => {
                    const comments = snapshot.docs.map(doc => {
                        const data = doc.data();
                        const jsDate = data.timestamp ? data.timestamp.toDate() : new Date();
                        return {
                            id: doc.id,
                            name: data.name,
                            text: data.text,
                            timestamp: jsDate.getTime(),
                            date: jsDate.toISOString()
                        };
                    });

                    // Sort comments oldest to newest
                    comments.sort((a, b) => a.timestamp - b.timestamp);

                    displayComments(comments);
                },
                (error) => {
                    console.error('Error listening to comments:', error);
                    showToast('Failed to load comments in real-time.');
                }
            );
    } catch (error) {
        console.error('Error subscribing to comments:', error);
        showToast('Failed to connect to comments database.');
    }
}

/**
 * Renders comment items in the UI.
 * @param {Array<{id: string, name: string, text: string, date: string}>} comments
 */
function displayComments(comments) {
    DOM.commentsList.innerHTML = '';

    if (comments.length === 0) {
        DOM.noCommentsText.classList.remove('hidden');
        return;
    }

    DOM.noCommentsText.classList.add('hidden');

    comments.forEach(comment => {
        const el = document.createElement('div');
        el.className = 'comment-item';
        el.innerHTML = `
            <span class="comment-author">${escapeHtml(comment.name)}</span>
            <span class="comment-date">${formatDate(comment.date)}</span>
            <p class="comment-body">${escapeHtml(comment.text)}</p>
        `;
        DOM.commentsList.appendChild(el);
    });
}

/**
 * Unsubscribes from the active comments listener.
 */
function unsubscribeFromComments() {
    if (commentsUnsubscribe) {
        commentsUnsubscribe();
        commentsUnsubscribe = null;
    }
}

/**
 * Escapes HTML to prevent XSS
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/* ============================================================
   NAVIGATION & ROUTING
   ============================================================ */

/**
 * Shows a specific view and hides others
 * @param {'home' | 'article' | 'editor'} view
 */
function showView(view) {
    currentView = view;
    DOM.homepageView.classList.toggle('hidden', view !== 'home');
    DOM.articleView.classList.toggle('hidden', view !== 'article');
    DOM.editorView.classList.toggle('hidden', view !== 'editor');

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function navigateToHome() {
    activeArticleId = null;
    unsubscribeFromComments();
    showView('home');
    renderHomepage();
    renderSidebar();
    history.replaceState(null, '', '#/');
}

/**
 * @param {string} articleId
 */
function navigateToArticle(articleId) {
    showView('article');
    renderArticlePage(articleId);
    history.replaceState(null, '', `#/article/${articleId}`);
}

function navigateToEditor() {
    showView('editor');
    history.replaceState(null, '', '#/editor');
    updatePublishButtonState();
    [DOM.editorTitle, DOM.editorSubheading, DOM.editorBody].forEach(adjustTextareaHeight);
}

/**
 * Handles hash-based routing (#/, #/article/:id, #/editor)
 */
function handleRoute() {
    const hash = window.location.hash.slice(1) || '/';

    if (hash === '/editor') {
        if (isEditorAuthenticated) {
            navigateToEditor();
        } else {
            promptEditorAccess();
        }
        return;
    }

    const articleMatch = hash.match(/^\/article\/(.+)$/);
    if (articleMatch) {
        navigateToArticle(articleMatch[1]);
        return;
    }

    navigateToHome();
}

/**
 * Prompts for editor password using modal dialog
 * @returns {boolean}
 */
function promptEditorAccess() {
    DOM.passwordModalOverlay.classList.add('active');
    DOM.passwordInput.value = '';
    DOM.passwordInput.focus();
}

/**
 * Validates password and navigates to editor
 */
function validateEditorPassword() {
    const password = DOM.passwordInput.value.trim();
    
    if (password === EDITOR_PASSWORD) {
        isEditorAuthenticated = true;
        sessionStorage.setItem('isEditorAuthenticated', 'true');
        closePasswordModal();
        updateAuthUI();
        navigateToEditor();
        showToast('Welcome to the editor');
        return true;
    }
    
    showToast('Incorrect password');
    DOM.passwordInput.value = '';
    DOM.passwordInput.focus();
    return false;
}

/**
 * Closes the password modal
 */
function closePasswordModal() {
    DOM.passwordModalOverlay.classList.remove('active');
    DOM.passwordInput.value = '';
}

/**
 * Updates the lock icon, homepage cards, and full article view actions based on authentication status.
 */
function updateAuthUI() {
    // 1. Update the lock icon in the footer
    if (DOM.footerLockBtn) {
        if (isEditorAuthenticated) {
            // Unlock icon (unlocked padlock)
            DOM.footerLockBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 8-4v4"></path></svg>`;
            DOM.footerLockBtn.setAttribute('aria-label', 'Logout of editor');
            DOM.footerLockBtn.setAttribute('title', 'Logout of editor');
        } else {
            // Lock icon (locked padlock)
            DOM.footerLockBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
            DOM.footerLockBtn.setAttribute('aria-label', 'Access private editor');
            DOM.footerLockBtn.setAttribute('title', 'Access private editor');
        }
    }

    // 2. Refresh the homepage rendering if we are on it, so owner actions appear/disappear
    if (currentView === 'home') {
        renderHomepage();
    }

    // 3. Update full article owner actions
    if (currentView === 'article' && activeArticleId) {
        const article = getArticleById(activeArticleId);
        if (article) {
            renderArticlePage(activeArticleId);
        }
    }
}

/* ============================================================
   PROFILE PICTURE MANAGEMENT
   ============================================================ */

function loadProfilePicture() {
    const storedImage = localStorage.getItem('profilePicture');
    if (storedImage) {
        applyProfilePicture(storedImage);
    }
}

function applyProfilePicture(imageData) {
    // Update sidebar avatar
    const sidebarAvatar = document.querySelector('.about-author-card .author-avatar');
    if (sidebarAvatar) {
        sidebarAvatar.textContent = '';
        sidebarAvatar.style.backgroundImage = `url('${imageData}')`;
        sidebarAvatar.style.backgroundSize = 'cover';
        sidebarAvatar.style.backgroundPosition = 'center';
        sidebarAvatar.classList.add('profile-image-active');
    }
    
    // Update editor preview
    if (DOM.profilePreview) {
        DOM.profilePreview.textContent = '';
        DOM.profilePreview.style.backgroundImage = `url('${imageData}')`;
        DOM.profilePreview.style.backgroundSize = 'cover';
        DOM.profilePreview.style.backgroundPosition = 'center';
        DOM.profilePreview.classList.add('with-image');
    }
}

function handleProfilePictureUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('Please upload an image file');
        return;
    }
    
    if (file.size > 2 * 1024 * 1024) { // 2MB limit
        showToast('Image size must be less than 2MB');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const imageData = e.target.result;
        localStorage.setItem('profilePicture', imageData);
        applyProfilePicture(imageData);
        showToast('Profile picture updated successfully!');
        DOM.profilePicInput.value = '';
    };
    reader.readAsDataURL(file);
}

function resetProfilePicture() {
    localStorage.removeItem('profilePicture');
    
    // Reset sidebar avatar
    const sidebarAvatar = document.querySelector('.about-author-card .author-avatar');
    if (sidebarAvatar) {
        sidebarAvatar.textContent = 'TR';
        sidebarAvatar.style.backgroundImage = '';
        sidebarAvatar.style.backgroundColor = '';
        sidebarAvatar.classList.remove('profile-image-active');
        sidebarAvatar.style.background = 'linear-gradient(135deg, var(--accent-color), #ec4899)';
    }
    
    // Reset editor preview
    if (DOM.profilePreview) {
        DOM.profilePreview.textContent = 'TR';
        DOM.profilePreview.style.backgroundImage = '';
        DOM.profilePreview.classList.remove('with-image');
    }
    
    DOM.profilePicInput.value = '';
    showToast('Profile picture reset to default');
}

/* ============================================================
   FIRESTORE — REAL-TIME LISTENER (onSnapshot)
   ============================================================
   Listens to the "articles" collection in real-time.
   Any changes (add, modify, delete) from any client are
   automatically reflected in all open browser tabs.
   ============================================================ */

/**
 * Sets up a real-time Firestore listener on the "articles" collection.
 * This replaces the old in-memory array approach — articles are now
 * fetched from the cloud and kept in sync automatically.
 */
function subscribeToArticles() {
    // Show loading state on first load
    showLoadingState();

    // onSnapshot() listens for real-time updates from Firestore
    // Sorted by publishedDate descending (newest first)
    try {
        articlesCollection
            .orderBy('publishedDate', 'desc')
            .onSnapshot(
                (snapshot) => {
                    // Convert Firestore snapshot to local Article array
                    articles = snapshot.docs.map(doc => ({
                        id: doc.id,               // Use Firestore document ID
                        ...doc.data(),             // Spread all document fields
                        accentClass: getCategoryAccentClass(doc.data().category)
                    }));

                    // Mark initial load as complete
                    articlesLoaded = true;

                    // Re-render the UI with the latest data
                    renderHomepage();
                    renderSidebar();

                    // If user is currently viewing an article, refresh it too
                    if (currentView === 'article' && activeArticleId) {
                        const stillExists = articles.find(a => a.id === activeArticleId);
                        if (stillExists) {
                            renderArticlePage(activeArticleId);
                        } else {
                            // Article was deleted — navigate home
                            navigateToHome();
                        }
                    }
                },
                (error) => {
                    console.error('Firestore onSnapshot error:', error);
                    articlesLoaded = true; // Stop loading state even on error
                    showToast('Failed to load articles. Check your connection.');
                    renderHomepage();
                    renderSidebar();
                }
            );
    } catch (error) {
        console.error('Failed to subscribe to Firestore:', error);
        articlesLoaded = true;
        showToast('Failed to connect to database.');
        renderHomepage();
        renderSidebar();
    }
}

/* ============================================================
   FIRESTORE — PUBLISH ARTICLE (write to cloud)
   ============================================================ */

/**
 * Saves an article document to the Firestore "articles" collection.
 * The onSnapshot listener will automatically pick up the new document
 * and update the UI across all open tabs.
 *
 * @param {Object} articleData - The article fields to save
 * @returns {Promise<string|null>} - The new document ID, or null on failure
 */
async function saveArticleToFirestore(articleData) {
    try {
        const docRef = await articlesCollection.add(articleData);
        console.log('Article saved to Firestore with ID:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('Error saving article to Firestore:', error);
        showToast('Failed to publish article. Please try again.');
        return null;
    }
}

/**
 * Deletes an article document from Firestore by ID.
 * @param {string} articleId
 * @returns {Promise<boolean>}
 */
async function deleteArticleFromFirestore(articleId) {
    try {
        await articlesCollection.doc(articleId).delete();
        console.log('Article deleted from Firestore:', articleId);
        return true;
    } catch (error) {
        console.error('Error deleting article from Firestore:', error);
        showToast('Failed to delete article. Please try again.');
        return false;
    }
}

/**
 * Updates an existing article document in Firestore.
 * @param {string} articleId
 * @param {Object} articleData
 * @returns {Promise<boolean>}
 */
async function updateArticleInFirestore(articleId, articleData) {
    try {
        await articlesCollection.doc(articleId).update(articleData);
        console.log('Article updated in Firestore:', articleId);
        return true;
    } catch (error) {
        console.error('Error updating article in Firestore:', error);
        showToast('Failed to update article. Please try again.');
        return false;
    }
}

/* ============================================================
   EDITOR — PUBLISH
   ============================================================ */

function clearEditorFields(fields) {
    fields.titleEl.value = '';
    fields.subheadingEl.value = '';
    fields.bodyEl.value = '';
    fields.categoryEl.selectedIndex = 0;
    delete fields.bodyEl.dataset.manualHeight;
    [fields.titleEl, fields.subheadingEl, fields.bodyEl].forEach(adjustTextareaHeight);
}

const privateEditorFields = () => ({
    titleEl: DOM.editorTitle,
    subheadingEl: DOM.editorSubheading,
    categoryEl: DOM.editorCategory,
    bodyEl: DOM.editorBody
});

/**
 * Creates and publishes an article from editor field values.
 * Saves to Firestore instead of an in-memory array.
 * @param {{ titleEl: HTMLTextAreaElement, subheadingEl: HTMLTextAreaElement, categoryEl: HTMLSelectElement, bodyEl: HTMLTextAreaElement }} fields
 * @param {{ navigateHome?: boolean }} options
 */
async function publishArticleFromFields(fields, options = {}) {
    if (!isEditorAuthenticated) {
        showToast('Unauthorized: Only the owner can publish or edit articles');
        return;
    }

    const title = fields.titleEl.value.trim();
    const subheading = fields.subheadingEl.value.trim();
    const category = fields.categoryEl.value;
    const body = fields.bodyEl.value.trim();

    if (!title) {
        showToast('Please add a title before publishing');
        fields.titleEl.focus();
        return;
    }
    if (!body) {
        showToast('Please add article body content');
        fields.bodyEl.focus();
        return;
    }

    const isEditing = !!editingArticleId;

    // Disable publish button to prevent duplicate submissions
    if (DOM.publishBtn) {
        DOM.publishBtn.disabled = true;
        DOM.publishBtn.textContent = isEditing ? 'Updating...' : 'Publishing...';
    }

    // Prepare article data for Firestore
    const articleData = {
        title,
        subheading,
        category,
        body,
        readTimeMinutes: calculateReadTime(body)
    };

    let success = false;

    if (isEditing) {
        // Update existing article (preserve original publishedDate)
        success = await updateArticleInFirestore(editingArticleId, articleData);
    } else {
        // Create new article
        articleData.publishedDate = new Date().toISOString().split('T')[0];
        const docId = await saveArticleToFirestore(articleData);
        success = !!docId;
    }

    // Re-enable publish button
    if (DOM.publishBtn) {
        DOM.publishBtn.disabled = false;
    }

    if (success) {
        const msg = isEditing ? 'Article updated successfully!' : 'Article published successfully!';
        clearEditorFields(fields);
        editingArticleId = null;
        updatePublishButtonState();
        showToast(msg);

        // The onSnapshot listener will automatically update the UI,
        // but we navigate home for immediate feedback
        if (options.navigateHome) {
            navigateToHome();
        }
    } else {
        updatePublishButtonState();
    }
}

function publishPrivateArticle() {
    publishArticleFromFields(privateEditorFields(), { navigateHome: true });
}

/**
 * Updates the publish button text/icon based on editing vs. creating mode
 */
function updatePublishButtonState() {
    if (!DOM.publishBtn) return;
    if (editingArticleId) {
        DOM.publishBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
            Update Article
        `;
    } else {
        DOM.publishBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Publish Article
        `;
    }
}

/* ============================================================
   EDIT & DELETE ARTICLE ACTIONS
   ============================================================ */

/**
 * Loads an article into the editor for editing
 * @param {string} articleId
 */
function editArticle(articleId) {
    if (!isEditorAuthenticated) {
        showToast('Unauthorized: Only the owner can edit articles');
        return;
    }

    const article = getArticleById(articleId);
    if (!article) {
        showToast('Article not found');
        return;
    }

    // Set editing state
    editingArticleId = articleId;

    // Populate editor fields with article data
    DOM.editorTitle.value = article.title;
    DOM.editorSubheading.value = article.subheading || '';
    DOM.editorBody.value = article.body;
    DOM.editorCategory.value = article.category;

    // Navigate to editor
    navigateToEditor();
    showToast('Editing: ' + article.title);
}

/**
 * Shows the delete confirmation modal
 * @param {string} articleId
 * @param {string} articleTitle
 */
function confirmDeleteArticle(articleId, articleTitle) {
    if (!isEditorAuthenticated) {
        showToast('Unauthorized: Only the owner can delete articles');
        return;
    }

    pendingDeleteArticleId = articleId;
    if (DOM.deleteModalTitle) {
        DOM.deleteModalTitle.textContent = articleTitle;
    }
    if (DOM.deleteModalOverlay) {
        DOM.deleteModalOverlay.classList.add('active');
    }
}

/**
 * Closes the delete confirmation modal
 */
function closeDeleteModal() {
    pendingDeleteArticleId = null;
    if (DOM.deleteModalOverlay) {
        DOM.deleteModalOverlay.classList.remove('active');
    }
}

/**
 * Executes the pending article deletion
 */
async function executeDeleteArticle() {
    if (!isEditorAuthenticated) {
        showToast('Unauthorized: Only the owner can delete articles');
        return;
    }
    if (!pendingDeleteArticleId) return;

    const articleId = pendingDeleteArticleId;
    closeDeleteModal();

    showToast('Deleting article...');
    const success = await deleteArticleFromFirestore(articleId);

    if (success) {
        showToast('Article deleted successfully');
        // If currently viewing the deleted article, go home
        if (activeArticleId === articleId) {
            navigateToHome();
        }
        // onSnapshot will automatically update the UI
    }
}

/* ============================================================
   PDF EXPORT
   ============================================================ */

function downloadArticlePdf() {
    const article = getArticleById(activeArticleId);
    if (!article) return;

    if (typeof html2pdf === 'undefined') {
        showToast('PDF library is loading. Please try again.');
        return;
    }

    const pdfContainer = document.createElement('div');
    pdfContainer.style.padding = '24px';
    pdfContainer.style.fontFamily = 'Inter, Helvetica, sans-serif';
    pdfContainer.style.color = '#111827';
    pdfContainer.innerHTML = `
        <h1 style="font-size: 22px; margin-bottom: 8px;">${escapeHtml(article.title)}</h1>
        <p style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">${escapeHtml(article.subheading)}</p>
        <p style="font-size: 12px; color: #9ca3af; margin-bottom: 20px;">${escapeHtml(article.category)} · ${formatDate(article.publishedDate)} · ${article.readTimeMinutes} min read</p>
        <div style="font-size: 14px; line-height: 1.7;">${parseLegalBody(article.body)}</div>
        <p style="font-size: 11px; color: #9ca3af; margin-top: 24px; font-style: italic;">This blog is for educational purposes only and does not constitute legal advice.</p>
    `;

    const safeFilename = article.title.replace(/[^a-z0-9]/gi, '_').slice(0, 50);

    html2pdf()
        .set({
            margin: 15,
            filename: `${safeFilename}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        })
        .from(pdfContainer)
        .save()
        .then(() => showToast('PDF downloaded'))
        .catch(() => showToast('Failed to generate PDF'));
}

/* ============================================================
   THEME
   ============================================================ */

function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    DOM.body.classList.toggle('dark-mode', currentTheme === 'dark');
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */

function initEventListeners() {
    DOM.logoLink.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToHome();
    });

    DOM.themeToggle.addEventListener('click', toggleTheme);

    DOM.searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        if (currentView !== 'home') {
            activeArticleId = null;
            showView('home');
            history.replaceState(null, '', '#/');
        }
        renderHomepage();
        renderSidebar();
    });

    DOM.categoriesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = DOM.categoriesMenu.classList.toggle('open');
        DOM.categoriesBtn.setAttribute('aria-expanded', String(isOpen));
    });

    DOM.categoryItems.forEach(item => {
        item.addEventListener('click', () => {
            activeCategoryFilter = item.dataset.category;
            DOM.categoryItems.forEach(i => i.classList.toggle('active', i === item));
            DOM.categoriesMenu.classList.remove('open');
            DOM.categoriesBtn.setAttribute('aria-expanded', 'false');
            if (currentView === 'home') renderHomepage();
        });
    });

    document.addEventListener('click', (e) => {
        if (!document.getElementById('categories-dropdown').contains(e.target)) {
            DOM.categoriesMenu.classList.remove('open');
            DOM.categoriesBtn.setAttribute('aria-expanded', 'false');
        }
    });

    DOM.backToHome.addEventListener('click', navigateToHome);
    DOM.backFromEditor.addEventListener('click', () => {
        // Clear editing state when leaving editor
        editingArticleId = null;
        updatePublishButtonState();
        clearEditorFields(privateEditorFields());
        navigateToHome();
    });

    DOM.footerLockBtn.addEventListener('click', () => {
        if (isEditorAuthenticated) {
            isEditorAuthenticated = false;
            sessionStorage.removeItem('isEditorAuthenticated');
            updateAuthUI();
            showToast('Logged out of editor');
            if (currentView === 'editor') {
                navigateToHome();
            }
        } else {
            promptEditorAccess();
        }
    });

    DOM.passwordForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        validateEditorPassword();
    });

    DOM.passwordCancelBtn?.addEventListener('click', closePasswordModal);

    DOM.passwordModalOverlay?.addEventListener('click', (e) => {
        if (e.target === DOM.passwordModalOverlay) {
            closePasswordModal();
        }
    });

    DOM.profilePicInput?.addEventListener('change', handleProfilePictureUpload);
    DOM.resetProfileBtn?.addEventListener('click', resetProfilePicture);

    // Delete confirmation modal events
    DOM.deleteConfirmBtn?.addEventListener('click', executeDeleteArticle);
    DOM.deleteCancelBtn?.addEventListener('click', closeDeleteModal);
    DOM.deleteModalOverlay?.addEventListener('click', (e) => {
        if (e.target === DOM.deleteModalOverlay) {
            closeDeleteModal();
        }
    });

    DOM.publishBtn?.addEventListener('click', publishPrivateArticle);

    DOM.downloadPdfBtn?.addEventListener('click', downloadArticlePdf);

    DOM.fullEditBtn?.addEventListener('click', () => {
        if (activeArticleId) {
            editArticle(activeArticleId);
        }
    });

    DOM.fullDeleteBtn?.addEventListener('click', () => {
        if (activeArticleId) {
            const article = getArticleById(activeArticleId);
            if (article) {
                confirmDeleteArticle(activeArticleId, article.title);
            }
        }
    });

    DOM.commentForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!activeArticleId) return;

        const name = DOM.commentName.value.trim();
        const text = DOM.commentText.value.trim();
        if (!name || !text) return;

        const submitBtn = DOM.commentForm.querySelector('.comment-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Posting...';
        }

        try {
            await commentsCollection.add({
                name,
                text,
                articleId: activeArticleId,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            DOM.commentName.value = '';
            DOM.commentText.value = '';
            showToast('Comment posted successfully');
        } catch (error) {
            console.error('Error posting comment:', error);
            showToast('Failed to post comment. Please try again.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Post Comment';
            }
        }
    });

    const allEditorTextareas = [
        DOM.editorTitle,
        DOM.editorSubheading,
        DOM.editorBody
    ];

    allEditorTextareas.forEach(textarea => {
        if (!textarea) return;
        textarea.addEventListener('input', () => adjustTextareaHeight(textarea));
        adjustTextareaHeight(textarea);
    });

    window.addEventListener('resize', () => {
        allEditorTextareas.forEach(textarea => adjustTextareaHeight(textarea));
    });

    window.addEventListener('hashchange', handleRoute);
}

/* ============================================================
   INITIALIZATION
   ============================================================ */

function init() {
    initEventListeners();
    loadProfilePicture();
    
    // Set initial authorization state UI
    updateAuthUI();

    // Start the real-time Firestore listener (replaces old in-memory array)
    // This will fetch all articles from the cloud and keep them synced
    subscribeToArticles();

    // Handle initial route (after articles start loading)
    handleRoute();
}

document.addEventListener('DOMContentLoaded', init);
