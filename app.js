let books, chapters, titles, contents;
let navigationStack = [];
let currentView = null;
let searchResults = [];
let currentScopeBookId = null; // book id for section-scoped search
let globalSearchOutsideHandler = null;
let navOutsideHandler = null;
let currentBookViewMode = "chapters"; // "chapters" or "pages" for special books
let currentFontSize = 100; // percentage, default 100%
let currentContentHtml = null; // Store original HTML content for zoom scaling
let currentTitleIndex = -1; // Track current title index for prev/next navigation
let currentTitlesList = []; // Store current list of titles for prev/next navigation
const specialBooks = ["Fihirana", "Salamo", "H.A.A"];
const numberedBooks = ["Fihirana", "H.A.A"];

// Load saved font size on page load
async function loadFontSize() {
    const saved = localStorage.getItem("fontSizePercentage");
    if (saved) {
        currentFontSize = parseInt(saved);
        applyFontSize();
    }
}

async function loadData() {
    books = await fetch("data/books.json").then(r => r.json());
    chapters = await fetch("data/chapters.json").then(r => r.json());
    titles = await fetch("data/titles.json").then(r => r.json());
    contents = await fetch("data/contents.json").then(r => r.json());

    setupSearch();
    showBooks();
}

function applyZoomToHtml(htmlString, zoomPercent) {
    // Scale all font-size values in inline styles according to zoom factor
    return htmlString.replace(/font-size:\s*(\d+(?:\.\d+)?)\s*pt/gi, (match, fontSize) => {
        const baseFontSize = parseFloat(fontSize);
        const zoomedFontSize = baseFontSize * (zoomPercent / 100);
        return `font-size:${zoomedFontSize}pt`;
    });
}

function renderContent(htmlContent) {
    // Helper function to render content HTML with current zoom applied
    const container = document.getElementById("content");
    const scaledHtml = applyZoomToHtml(htmlContent, currentFontSize);
    container.innerHTML = `<div id="lyrics">${scaledHtml}</div>`;
    window.scrollTo(0, 0);
}

function updateBottomNav() {
    const backBtn = document.getElementById("bnav-back");
    const prevBtn = document.getElementById("bnav-prev");
    const nextBtn = document.getElementById("bnav-next");

    // Back: enabled when there's somewhere to go back to
    if (backBtn) backBtn.disabled = navigationStack.length === 0;

    // Prev/Next: only enabled in lyrics/content view
    const inLyrics = currentContentHtml !== null;
    if (prevBtn) prevBtn.disabled = !inLyrics || currentTitleIndex <= 0;
    if (nextBtn) nextBtn.disabled = !inLyrics || currentTitleIndex >= currentTitlesList.length - 1;
}

function navigatePrev() {
    if (currentTitleIndex > 0) {
        showContent(currentTitlesList[currentTitleIndex - 1].id);
    }
}

function navigateNext() {
    if (currentTitleIndex < currentTitlesList.length - 1) {
        showContent(currentTitlesList[currentTitleIndex + 1].id);
    }
}

function focusSearch() {
    // If section search is visible, focus it; otherwise open/focus global search
    const sectionContainer = document.getElementById("sectionSearchContainer");
    const sectionField = document.getElementById("sectionSearchField");
    if (sectionContainer && sectionContainer.style.display !== "none" && sectionField) {
        sectionField.focus();
        sectionField.scrollIntoView({ behavior: "instant", block: "nearest" });
        return;
    }
    // Otherwise open global search if not already visible, then focus
    const globalContainer = document.getElementById("globalSearchContainer");
    if (globalContainer && globalContainer.style.display === "none") {
        toggleGlobalSearch();
    } else {
        const globalField = document.getElementById("globalSearchField");
        if (globalField) globalField.focus();
    }
}

// NEW helper: remove any floating toggle button
function removeFloatingToggle() {
    const existingToggle = document.querySelector(".floating-toggle-btn");
    if (existingToggle) existingToggle.remove();
}

function renderSpecialToggle(bookId, mode = "chapters") {
    removeFloatingToggle();

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "floating-toggle-btn";

    if (mode === "chapters") {
        toggleBtn.innerText = "123";
        toggleBtn.onclick = () => showPageSortedTitles(bookId);
    } else {
        toggleBtn.innerText = "Ch";
        toggleBtn.onclick = () => showChapters(bookId);
    }

    document.body.appendChild(toggleBtn);
}

function setupSearch() {
    const globalField = document.getElementById("globalSearchField");
    const sectionField = document.getElementById("sectionSearchField");

    if (globalField) {
        globalField.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (query === "") {
                searchResults = [];
                restoreCurrentView();
            } else {
                performSearch(query);
            }
        });
        globalField.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                globalField.blur();
            }
        });
    }

    if (sectionField) {
        sectionField.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (query === "") {
                searchResults = [];
                restoreCurrentView();
            } else {
                performSearch(query, currentScopeBookId);
            }
        });
        sectionField.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                sectionField.blur();
            }
        });
    }
}

function toggleGlobalSearch() {
    const container = document.getElementById("globalSearchContainer");
    const searchBtn = document.getElementById("bnav-search");
    if (!container) return;
    const shown = container.style.display !== "none";
    if (shown) {
        // hide and remove outside click listener
        container.style.display = "none";
        if (globalSearchOutsideHandler) {
            document.removeEventListener("mousedown", globalSearchOutsideHandler);
            globalSearchOutsideHandler = null;
        }
    } else {
        // show and focus
        container.style.display = "block";
        const field = document.getElementById("globalSearchField");
        if (field) field.focus();

        // add outside-click handler to close when clicking outside
        globalSearchOutsideHandler = function (e) {
            const target = e.target;
            if (!container.contains(target) && target !== searchBtn && !searchBtn.contains(target)) {
                const field = document.getElementById("globalSearchField");
                const hasText = field && field.value.trim() !== "";
                if (!hasText) {
                    container.style.display = "none";
                    document.removeEventListener("mousedown", globalSearchOutsideHandler);
                    globalSearchOutsideHandler = null;
                }
            }
        };
        // use mousedown to catch before focus shifts
        document.addEventListener("mousedown", globalSearchOutsideHandler);
    }
}

function performSearch(query, scopeBookId = null) {
    searchResults = [];

    // Search books (respect scope if provided)
    books.forEach(book => {
        if (book.cat_name.toLowerCase().includes(query)) {
            if (scopeBookId == null || book.id == scopeBookId) {
                searchResults.push({ type: "book", id: book.id, title: book.cat_name });
            }
        }
    });

    // Search chapters (must belong to scope if provided)
    chapters.forEach(ch => {
        if (ch.chp_title.toLowerCase().includes(query)) {
            if (scopeBookId == null || ch.book_id == scopeBookId) {
                const book = books.find(b => b.id == ch.book_id);
                searchResults.push({ type: "chapter", id: ch.id, bookId: ch.book_id, title: ch.chp_title, subtitle: book ? book.cat_name : "" });
            }
        }
    });

    // Search titles (must belong to scope if provided)
    titles.forEach(t => {
        // match by title text
        let matched = false;
        if (t.text.toLowerCase().includes(query)) matched = true;
        const chapter = chapters.find(c => c.id == t.chapter_id);
        if (!chapter) return;
        // check content page number for special books
        const bookForTitle = books.find(b => b.id == chapter.book_id);
        if (!matched && specialBooks.includes(bookForTitle ? bookForTitle.cat_name : "")) {
            const contentForTitle = contents.find(c => c.id_title == t.id);
            if (contentForTitle && String(t.number).toLowerCase().includes(query)) {
                matched = true;
            }
        }

        if (matched) {
            if (scopeBookId == null || chapter.book_id == scopeBookId) {
                const book = bookForTitle;
                searchResults.push({ type: "title", id: t.id, number: t.number, chapterId: t.chapter_id, bookId: chapter.book_id, title: t.text, subtitle: `${book ? book.cat_name : ""} → ${chapter.chp_title}` });
            }
        }
    });

    showSearchResults();
}

function showSearchResults() {
    // ensure toggle removed when showing search results (search is not a special-view)
    removeFloatingToggle();

    const container = document.getElementById("content");
    container.innerHTML = "";

    searchResults.forEach(result => {
        const div = document.createElement("div");
        div.className = "item";

        // if this is a title result and has a page number, show it before the title
        let displayTitle = result.title;
        if (result.type === "title") {
            const contentForResult = contents.find(c => c.id_title == result.id);
            if (contentForResult && result.number) {
                displayTitle = `${result.number} - ${displayTitle}`;
            }
        }

        if (result.subtitle) {
            div.innerHTML = `<strong>${displayTitle}</strong><br><small style="color: #666;">${result.subtitle}</small>`;
        } else {
            div.innerText = displayTitle;
        }

        div.onclick = () => {
            const g = document.getElementById("globalSearchField");
            const s = document.getElementById("sectionSearchField");
            if (g) g.value = "";
            if (s) s.value = "";
            const gd = document.getElementById("globalSearchContainer");
            if (gd) gd.style.display = "none";
            searchResults = [];

            if (result.type === "book") {
                navigationStack.push(showBooks);
                showChapters(result.id);
            } else if (result.type === "chapter") {
                navigationStack.push(showBooks);
                navigationStack.push(() => showChapters(result.bookId));
                showTitles(result.id);
            } else if (result.type === "title") {
                navigationStack.push(showBooks);
                navigationStack.push(() => showChapters(result.bookId));
                const titleBook = books.find(b => b.id == result.bookId);
                const isSpecial = !!(titleBook && specialBooks.includes(titleBook.cat_name));
                const isNumbered = !!(titleBook && numberedBooks.includes(titleBook.cat_name));
                if (isSpecial) {
                    // For special books: back goes to the sorted titles list, scrolled to this title
                    navigationStack.push(() => showPageSortedTitlesAndScroll(result.bookId, result.id));
                } else {
                    navigationStack.push(() => showTitles(result.chapterId, isNumbered));
                }
                showContent(result.id);
            }
        };

        container.appendChild(div);
    });
}

function restoreCurrentView() {
    if (currentView) {
        currentView();
    }
}

function updateHeader(title, subtitle = "") {
    document.getElementById("headerTitle").innerText = title;
    document.getElementById("headerSubtitle").innerText = subtitle;
    updateBottomNav();
}

function goBack() {
    currentContentHtml = null;
    currentTitleIndex = -1;
    currentTitlesList = [];
    const previous = navigationStack.pop();
    const g = document.getElementById("globalSearchField");
    const s = document.getElementById("sectionSearchField");
    if (g) g.value = "";
    if (s) s.value = "";
    const sectionContainer = document.getElementById("sectionSearchContainer");
    if (sectionContainer) sectionContainer.style.display = "none";
    searchResults = [];
    updateBottomNav();
    if (previous) previous();
}

function showBooks() {
    // remove any floating toggle when showing main books list
    removeFloatingToggle();

    navigationStack = [];
    currentView = showBooks;
    updateHeader("Boky Fivavahana");

    // clear scope search
    currentScopeBookId = null;
    const sectionContainer = document.getElementById("sectionSearchContainer");
    if (sectionContainer) sectionContainer.style.display = "none";

    const container = document.getElementById("content");
    container.innerHTML = "";

    books.forEach(book => {
        const div = document.createElement("div");
        div.className = "item";
        div.innerText = book.cat_name;
        div.onclick = () => {
            navigationStack.push(showBooks);
            numberedBooks.includes(book.cat_name) ? showPageSortedTitles(book.id) : showChapters(book.id);
        };
        container.appendChild(div);
    });
}

function showChapters(bookId) {
    const book = books.find(b => b.id == bookId);
    const showNumber = specialBooks.includes(book.cat_name);

    // reset to chapters view when entering a book
    currentBookViewMode = "chapters";
    currentView = () => showChapters(bookId);
    updateHeader(book.cat_name);

    // For Salamo and Litorjia Provinsialy jump directly to titles list (skip the single-chapter view)
    const oneChapterBook = ["Salamo", "Litorjia Provinsialy"]
    if (book && oneChapterBook.includes(book.cat_name)) {
        // find first chapter for this book and show its titles; keep back stack as-is
        const firstChapter = chapters.find(c => c.book_id == bookId);
        if (firstChapter) {
            showTitles(firstChapter.id, book.cat_name === "Salamo" ? true : false);
            return;
        }
    }

    // set section scope and show section search
    currentScopeBookId = bookId;
    const sectionContainer = document.getElementById("sectionSearchContainer");
    const sectionField = document.getElementById("sectionSearchField");
    if (sectionContainer) sectionContainer.style.display = "block";
    if (sectionField) sectionField.placeholder = `Hitady @${book.cat_name}...`;

    const container = document.getElementById("content");
    container.innerHTML = "";

    // remove any existing floating toggle button
    removeFloatingToggle();

    // add floating toggle button for special books
    if (showNumber) renderSpecialToggle(bookId);

    // Group chapters by name to merge same-named chapters (e.g. in Fihirana)
    const seen = new Set();
    const bookChapters = chapters.filter(c => c.book_id == bookId);

    bookChapters.forEach(ch => {
        if (seen.has(ch.chp_title)) return; // already rendered this group
        seen.add(ch.chp_title);

        // All chapters in this book with the same name
        const group = bookChapters.filter(c => c.chp_title === ch.chp_title);
        const groupIds = group.map(c => c.id);
        const groupTitles = groupIds.flatMap(cid => titles.filter(t => t.chapter_id == cid));

        const div = document.createElement("div");
        div.className = "item";
        div.innerText = ch.chp_title;
        div.onclick = () => {
            if (groupTitles.length === 1) {
                // Single title across all same-named chapters — skip list, go to content
                navigationStack.push(() => showChapters(bookId));
                showContent(groupTitles[0].id);
            } else if (group.length > 1) {
                // Multiple chapters share this name — show merged title list
                navigationStack.push(() => showChapters(bookId));
                showGroupedTitles(groupIds, ch.chp_title, showNumber);
            } else {
                // Normal single chapter
                navigationStack.push(() => showChapters(bookId));
                showTitles(ch.id, showNumber);
            }
        };
        container.appendChild(div);
    });
}

function showTitles(chapterId, showNumber = false) {
    // determine chapter and use its title for the header
    const chapter = chapters.find(c => c.id == chapterId);
    const headerTitle = chapter ? chapter.chp_title : "Titles";
    currentView = () => showTitles(chapterId, showNumber);
    updateHeader(headerTitle);

    // ensure section search is visible and scoped to chapter's book
    if (chapter) {
        currentScopeBookId = chapter.book_id;
        const sectionContainer = document.getElementById("sectionSearchContainer");
        const sectionField = document.getElementById("sectionSearchField");
        const book = books.find(b => b.id == chapter.book_id);
        if (sectionContainer) sectionContainer.style.display = "block";
        if (sectionField) sectionField.placeholder = `Hitady @${book ? book.cat_name : "ato"}...`;
    }

    const container = document.getElementById("content");
    container.innerHTML = "";

    titles
        .filter(t => t.chapter_id == chapterId)
        .forEach(t => {
            const div = document.createElement("div");
            div.className = "item";

            if (showNumber) {
                div.innerText = `${t.number} - ${t.text}`
            }
            else {
                div.innerText = t.text;
            }

            div.onclick = () => {
                navigationStack.push(() => showTitles(chapterId, showNumber));
                showContent(t.id);
            };

            container.appendChild(div);
        });

    const book = books.find(b => b.id == chapter.book_id);
    const isNumbered = book && numberedBooks.includes(book.cat_name);

    if (isNumbered) renderSpecialToggle(book.id);

}

function showGroupedTitles(chapterIds, groupName, showNumber = false) {
    currentView = () => showGroupedTitles(chapterIds, groupName, showNumber);
    updateHeader(groupName);

    // Section search — scope to the book of the first chapter
    const firstChapter = chapters.find(c => c.id == chapterIds[0]);
    if (firstChapter) {
        currentScopeBookId = firstChapter.book_id;
        const sectionContainer = document.getElementById("sectionSearchContainer");
        const sectionField = document.getElementById("sectionSearchField");
        const book = books.find(b => b.id == firstChapter.book_id);
        if (sectionContainer) sectionContainer.style.display = "block";
        if (sectionField) sectionField.placeholder = `Hitady @${book ? book.cat_name : "ato"}...`;
    }

    const container = document.getElementById("content");
    container.innerHTML = "";

    // Collect titles from all chapters in the group, in order
    const allTitles = chapterIds
        .flatMap(cid => titles.filter(t => t.chapter_id == cid))
        .sort((a, b) => (a.number || 0) - (b.number || 0))

    allTitles.forEach(t => {
        const div = document.createElement("div");
        div.className = "item";
        div.innerText = showNumber ? `${t.number} - ${t.text}` : t.text;
        div.onclick = () => {
            navigationStack.push(() => showGroupedTitles(chapterIds, groupName, showNumber));
            showContent(t.id);
        };
        container.appendChild(div);
    });

    // Show toggle button for numbered books
    const book = firstChapter ? books.find(b => b.id == firstChapter.book_id) : null;
    if (book && numberedBooks.includes(book.cat_name)) renderSpecialToggle(book.id);
}

function showPageSortedTitles(bookId) {
    const book = books.find(b => b.id == bookId);
    currentBookViewMode = "pages";
    currentView = () => showPageSortedTitles(bookId);
    updateHeader(book ? book.cat_name : "Page Order");

    // set section scope and show section search
    currentScopeBookId = bookId;
    const sectionContainer = document.getElementById("sectionSearchContainer");
    const sectionField = document.getElementById("sectionSearchField");
    if (sectionContainer) sectionContainer.style.display = "block";
    if (sectionField) sectionField.placeholder = `Hitady @${book ? book.cat_name : "this book"}...`;

    // get all titles for this book sorted by page number
    const allTitlesForBook = [];
    chapters
        .filter(c => c.book_id == bookId)
        .forEach(ch => {
            titles
                .filter(t => t.chapter_id == ch.id)
                .forEach(t => {
                    allTitlesForBook.push({
                        title: t,
                        chapter: ch,
                        pageNumber: t.number
                    });
                });
        });
    // sort by page number ascending
    allTitlesForBook.sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));

    const container = document.getElementById("content");
    container.innerHTML = "";

    renderSpecialToggle(bookId, "pages");

    // display all titles sorted by page number
    allTitlesForBook.forEach(item => {
        const div = document.createElement("div");
        div.className = "item";
        div.dataset.titleId = item.title.id;
        div.innerText = `${item.pageNumber} - ${item.title.text}`;
        div.onclick = () => {
            navigationStack.push(() => showPageSortedTitlesAndScroll(bookId, item.title.id));
            showContent(item.title.id);
        };
        container.appendChild(div);
    });
}

function showPageSortedTitlesAndScroll(bookId, titleId) {
    showPageSortedTitles(bookId);
    // After render, scroll the matching item into view
    requestAnimationFrame(() => {
        const el = document.querySelector(`.item[data-title-id="${titleId}"]`);
        if (el) el.scrollIntoView({ behavior: "instant", block: "center" });
    });
}

function showAbout() {
    currentView = showAbout;
    updateHeader("Mombamomba");
    if (navigationStack.length === 0) {
        navigationStack = [showBooks];
        updateBottomNav();
    }

    const navMenu = document.getElementById("navMenu");
    if (navMenu) navMenu.style.display = "none";

    if (navOutsideHandler) {
        document.removeEventListener("mousedown", navOutsideHandler);
        navOutsideHandler = null;
    }

    // hide section search and remove toggle button
    const sectionContainer = document.getElementById("sectionSearchContainer");
    if (sectionContainer) sectionContainer.style.display = "none";
    removeFloatingToggle();

    const container = document.getElementById("content");
    if (container) {
        container.innerHTML = `
        <h2>Boky Fivavahana Anglikana</h2>
        <p>Voninahitra ho an'Andriamanitra irery ihany.</p>
        <p>Raha misy olana na fanamarihana: <a href="mailto:tsiorymanana7@gmail.com">tsiorymanana7@gmail.com</a> / +261347048504</p>
        <p>Mampiasà finaritra.</p>
        <footer>Credits to <i>FEEM NTIC - Lead Code Group</i>.</footer>
        `;
    }
}

function showContent(titleId) {
    // ensure toggle is removed while reading content
    removeFloatingToggle();

    // set header to title (and page number for special books)
    const titleObj = titles.find(t => t.id == titleId);
    const chapterObj = chapters.find(c => c.id == (titleObj ? titleObj.chapter_id : null));
    const bookObj = chapterObj ? books.find(b => b.id == chapterObj.book_id) : null;
    let headerSubtitle = titleObj ? titleObj.text : "Content";
    let itemSubText = ""
    if (bookObj && specialBooks.includes(bookObj.cat_name)) {
        const itemContent = contents.find(c => c.id_title == titleId);
        itemSubText = itemContent.ct_subtext
        if (itemContent && titleObj.number) {
            headerSubtitle = `${titleObj.number} - ${titleObj.text}`;
        }

    }
    updateHeader(bookObj.cat_name, headerSubtitle);

    // hide section search while reading content
    const sectionContainer = document.getElementById("sectionSearchContainer");
    if (sectionContainer) sectionContainer.style.display = "none";

    const container = document.getElementById("content");
    // Find the first contents entry for this title and append any immediately following
    // entries that have the same id_title (concatenate contiguous parts)
    const startIndex = contents.findIndex(c => c.id_title == titleId);
    let combinedHtml = "";
    if (startIndex !== -1) {
        for (let i = startIndex; i < contents.length; i++) {
            const c = contents[i];
            if (c.id_title == titleId) {
                combinedHtml += (c.ct_lyrics || "");
            } else {
                break;
            }
        }
    }
    const item = { ct_lyrics: combinedHtml };

    // Track title index for prev/next buttons
    // Determine book
    const bookId = chapterObj.book_id;

    // Build full ordered list of titles for the entire book
    const bookTitles = [];
    chapters
        .filter(c => c.book_id == bookId)
        .forEach(ch => bookTitles.push(...titles.filter(t => t.chapter_id == ch.id)));
    bookTitles.sort((a, b) => (a.number || 0) - (b.number || 0));

    currentTitlesList = bookTitles;
    currentTitleIndex = currentTitlesList.findIndex(t => t.id == titleId);

    // Store original HTML for zoom scaling and render with current zoom
    currentContentHtml = itemSubText ? `<div id="subText">${itemSubText}</div><hr />` + item.ct_lyrics : item.ct_lyrics;
    renderContent(currentContentHtml);
    updateBottomNav();
}


function toggleMenu() {
    const menu = document.getElementById("navMenu");
    const menuBtn = document.getElementById("bnav-menu");
    if (!menu) return;
    const shown = menu.style.display !== "none";
    if (shown) {
        menu.style.display = "none";
        if (navOutsideHandler) {
            document.removeEventListener("mousedown", navOutsideHandler);
            navOutsideHandler = null;
        }
    } else {
        menu.style.display = "block";
        // attach outside click handler
        navOutsideHandler = function (e) {
            const target = e.target;
            if (!menu.contains(target) && target !== menuBtn && !menuBtn.contains(target)) {
                menu.style.display = "none";
                if (navOutsideHandler) {
                    document.removeEventListener("mousedown", navOutsideHandler);
                    navOutsideHandler = null;
                }
            }
        };
        document.addEventListener("mousedown", navOutsideHandler);
    }
}

function navigateToBook(bookName) {
    const navMenu = document.getElementById("navMenu");
    if (navMenu) navMenu.style.display = "none";
    if (navOutsideHandler) {
        document.removeEventListener("mousedown", navOutsideHandler);
        navOutsideHandler = null;
    }
    const g = document.getElementById("globalSearchField");
    const s = document.getElementById("sectionSearchField");
    if (g) g.value = "";
    if (s) s.value = "";
    searchResults = [];

    const book = books.find(b => b.cat_name === bookName);
    if (book) {
        navigationStack = [showBooks];
        showChapters(book.id);
    }
}

function zoomIn() {
    currentFontSize = Math.min(currentFontSize + 10, 150);
    applyFontSize();
    if (currentContentHtml) {
        renderContent(currentContentHtml);
    }
}

function zoomOut() {
    currentFontSize = Math.max(currentFontSize - 10, 80);
    applyFontSize();
    if (currentContentHtml) {
        renderContent(currentContentHtml);
    }
}

function applyFontSize() {
    const root = document.documentElement;
    root.style.fontSize = (16 * (currentFontSize / 100)) + "px";
    localStorage.setItem("fontSizePercentage", currentFontSize);
}

// Handle Android hardware back button
document.addEventListener("DOMContentLoaded", () => {

    loadFontSize();
    loadData();

    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        // Set Android navigation bar color to match bottom nav
        const NavigationBar = window.Capacitor.Plugins.NavigationBar;
        if (NavigationBar) {
            NavigationBar.setNavigationBarColor({ color: '#2e4175', darkButtons: false });
        }

        //Handle Back button
        const App = window.Capacitor.Plugins.App;
        const Toast = window.Capacitor.Plugins.Toast;
        let lastBackPress = 0;
        App.addListener("backButton", () => {
            if (navigationStack.length > 0) {
                goBack();
                return;
            }
            if (currentView && currentView !== showBooks) {
                goBack();
                return;
            }
            const now = Date.now();
            if (now - lastBackPress < 2000) {
                App.exitApp();
            } else {
                lastBackPress = now;
                Toast.show({
                    text: 'Tsindrio ihany raha hiala'
                });
            }
        });

    }
});