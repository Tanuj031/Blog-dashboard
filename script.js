
const EDITOR_PASSWORD = 'admin123';
const WORDS_PER_MINUTE = 200;

/** @type {'light' | 'dark'} */
let currentTheme = 'light';

/** @type {'home' | 'article' | 'editor'} */
let currentView = 'home';

/** @type {string | null} */
let activeArticleId = null;

/** @type {string} */
let activeCategoryFilter = 'all';

/** @type {string} */
let searchQuery = '';

/** @type {boolean} */
let isEditorAuthenticated = false;

/**
 * Article schema — structured for future backend/CMS integration
 * @typedef {Object} Article
 * @property {string} id
 * @property {string} title
 * @property {string} subheading
 * @property {string} category
 * @property {string} body
 * @property {string} publishedDate - ISO date string
 * @property {number} readTimeMinutes
 * @property {string} accentClass
 */

/** @type {Article[]} */
let articles = [];

/** @type {Record<string, Array<{name: string, text: string, date: string}>>} */
let commentsByArticle = {};

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
    shareLinkedin: document.getElementById('share-linkedin'),
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
    toastMessage: document.getElementById('toast-message')
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
 * Generates a unique article ID
 * @returns {string}
 */
function generateArticleId() {
    return `article-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
 * Finds article by ID
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
 * Renders homepage article preview cards
 */
function renderHomepage() {
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
        `;

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

    updateShareLinks(article);
    renderComments(articleId);
    renderSidebar();
}

/**
 * Updates social share intent URLs
 * @param {Article} article
 */
function updateShareLinks(article) {
    const pageUrl = encodeURIComponent(window.location.href.split('#')[0] + `#/article/${article.id}`);
    const shareText = encodeURIComponent(`${article.title} — Tejas Ramteke Writes`);

    DOM.shareLinkedin.href = `https://www.linkedin.com/sharing/share-offsite/?url=${pageUrl}`;
    
}

/**
 * Renders comments for an article
 * @param {string} articleId
 */
function renderComments(articleId) {
    const comments = commentsByArticle[articleId] || [];
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
        closePasswordModal();
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
 * Creates and publishes an article from editor field values
 * @param {{ titleEl: HTMLTextAreaElement, subheadingEl: HTMLTextAreaElement, categoryEl: HTMLSelectElement, bodyEl: HTMLTextAreaElement }} fields
 * @param {{ navigateHome?: boolean }} options
 */
function publishArticleFromFields(fields, options = {}) {
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

    const newArticle = {
        id: generateArticleId(),
        title,
        subheading,
        category,
        body,
        publishedDate: new Date().toISOString().split('T')[0],
        readTimeMinutes: calculateReadTime(body),
        accentClass: getCategoryAccentClass(category)
    };

    articles.unshift(newArticle);
    clearEditorFields(fields);
    showToast('Article published successfully!');

    if (options.navigateHome) {
        navigateToHome();
    } else {
        renderHomepage();
        renderSidebar();
    }
}

function publishPrivateArticle() {
    publishArticleFromFields(privateEditorFields(), { navigateHome: true });
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
    DOM.backFromEditor.addEventListener('click', navigateToHome);

    DOM.footerLockBtn.addEventListener('click', promptEditorAccess);

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

    DOM.publishBtn?.addEventListener('click', publishPrivateArticle);

    DOM.downloadPdfBtn?.addEventListener('click', downloadArticlePdf);

    DOM.commentForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!activeArticleId) return;

        const name = DOM.commentName.value.trim();
        const text = DOM.commentText.value.trim();
        if (!name || !text) return;

        if (!commentsByArticle[activeArticleId]) {
            commentsByArticle[activeArticleId] = [];
        }

        commentsByArticle[activeArticleId].push({
            name,
            text,
            date: new Date().toISOString().split('T')[0]
        });

        DOM.commentName.value = '';
        DOM.commentText.value = '';
        renderComments(activeArticleId);
        showToast('Comment posted');
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
    renderHomepage();
    renderSidebar();
    handleRoute();
}

document.addEventListener('DOMContentLoaded', init);
