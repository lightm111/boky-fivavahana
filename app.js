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
let currentChapterId = null; // Track current chapter for prev/next navigation
let currentTitleIndex = -1; // Track current title index for prev/next navigation
let currentTitlesList = []; // Store current list of titles for prev/next navigation

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

    createFloatingBackButton();
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
    container.innerHTML = `
    <div class="item" style="cursor: default;">
      ${scaledHtml}
    </div>
  `;
}

function createFloatingBackButton() {
    // Create floating back button if not already present
    if (!document.querySelector(".floating-back-btn")) {
        const backBtn = document.createElement("button");
        backBtn.className = "floating-back-btn";
        backBtn.innerText = "←";
        backBtn.onclick = goBack;
        document.body.appendChild(backBtn);
    }
}

function updateFloatingBackButton() {
    const backBtn = document.querySelector(".floating-back-btn");
    if (backBtn) {
        if (navigationStack.length > 0) {
            backBtn.classList.add("show");
        } else {
            backBtn.classList.remove("show");
        }
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
    }
}

function toggleGlobalSearch() {
    const container = document.getElementById("globalSearchContainer");
    const searchBtn = document.getElementById("searchBtn");
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
            if (!container.contains(target) && target !== searchBtn) {
                container.style.display = "none";
                if (globalSearchOutsideHandler) {
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
        const specialBooks = ["Fihirana", "Salamo", "H.A.A"];
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
                navigationStack.push(() => showTitles(result.chapterId));
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

function updateHeader(title) {
    document.getElementById("headerTitle").innerText = title;
    updateFloatingBackButton();
    // Show the menu and search button except on the content view
    const showSearch = title !== "Content";
    const searchBtn = document.getElementById("searchBtn");
    const menuBtn = document.getElementById("menuBtn");
    if (searchBtn) searchBtn.style.display = showSearch ? "inline-block" : "none";
}

function goBack() {
    console.log(navigationStack);
    currentContentHtml = null;
    const previous = navigationStack.pop();
    const g = document.getElementById("globalSearchField");
    const s = document.getElementById("sectionSearchField");
    if (g) g.value = "";
    if (s) s.value = "";
    const sectionContainer = document.getElementById("sectionSearchContainer");
    if (sectionContainer) sectionContainer.style.display = "none";
    searchResults = [];
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
            showChapters(book.id);
        };
        container.appendChild(div);
    });
}

function showChapters(bookId) {
    const book = books.find(b => b.id == bookId);
    const specialBooks = ["Fihirana", "Salamo", "H.A.A"];
    const showNumber = specialBooks.includes(book.cat_name);

    // reset to chapters view when entering a book
    currentBookViewMode = "chapters";
    currentView = () => showChapters(bookId);
    updateHeader(book.cat_name);

    // For Salamo jump directly to titles list (skip the single-chapter view)
    if (book && book.cat_name === "Salamo") {
        // find first chapter for this book and show its titles; keep back stack as-is
        const firstChapter = chapters.find(c => c.book_id == bookId);
        if (firstChapter) {
            showTitles(firstChapter.id, true);
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

    chapters
        .filter(c => c.book_id == bookId)
        .forEach(ch => {
            const div = document.createElement("div");
            div.className = "item";
            div.innerText = ch.chp_title;
            div.onclick = () => {
                navigationStack.push(() => showChapters(bookId));
                showTitles(ch.id, showNumber);
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
    const specialBooks = ["Fihirana", "H.A.A"];
    const isSpecial = book && specialBooks.includes(book.cat_name);

    if (isSpecial) renderSpecialToggle(book.id);

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
    if (sectionField) sectionField.placeholder = `Search in ${book ? book.cat_name : "this book"}...`;

    // get all titles for this book sorted by page number
    const allTitlesForBook = [];
    chapters
        .filter(c => c.book_id == bookId)
        .forEach(ch => {
            titles
                .filter(t => t.chapter_id == ch.id)
                .forEach(t => {
                    const content = contents.find(c => c.id_title == t.id);
                    allTitlesForBook.push({
                        title: t,
                        chapter: ch,
                        pageNumber: content ? content.ct_page_number : 0
                    });
                });
        });
    // sort by page number ascending
    allTitlesForBook.sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));

    // If this is Salamo, ignore stored page numbers and assign sequential numbers starting at 1
    if (book && book.cat_name === "Salamo") {
        allTitlesForBook.forEach((it, idx) => {
            it.pageNumber = idx + 1;
        });
    }

    const container = document.getElementById("content");
    container.innerHTML = "";

    // remove any existing floating toggle button and add new one
    const existingToggle = document.querySelector(".floating-toggle-btn");
    if (existingToggle) existingToggle.remove();

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "floating-toggle-btn";
    toggleBtn.innerText = "Ch";
    toggleBtn.onclick = () => showChapters(bookId);
    document.body.appendChild(toggleBtn);

    // display all titles sorted by page number
    allTitlesForBook.forEach(item => {
        const div = document.createElement("div");
        div.className = "item";
        div.innerText = `${item.pageNumber} - ${item.title.text}`;
        div.onclick = () => {
            navigationStack.push(() => showPageSortedTitles(bookId));
            showContent(item.title.id);
        };
        container.appendChild(div);
    });
}

function showAbout() {
    currentView = showAbout;
    updateHeader("About");

    // hide section search and remove toggle button
    const sectionContainer = document.getElementById("sectionSearchContainer");
    if (sectionContainer) sectionContainer.style.display = "none";
    const existingToggle = document.querySelector(".floating-toggle-btn");
    if (existingToggle) existingToggle.remove();

    const container = document.getElementById("content");
    if (container) {
        container.innerHTML = `
        <h1>Boky Fivavahana Anglikana</h1>
        <p>Voninahitra ho an'Andriamanitra irery ihany.</p>
        <p>Raha misy olana na fanamarihana: <a href="mailto:tsiorymanana7@gmail.com">tsiorymanana7@gmail.com</a> / +261347048504</p>
        <p>Mampiasà finaritra.</p>
        <footer>Credits to <i>Lead Code Group</i>.</footer>
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
    const specialBooks = ["Fihirana", "Salamo", "H.A.A"];
    let headerText = titleObj ? titleObj.text : "Content";
    if (bookObj && specialBooks.includes(bookObj.cat_name)) {
        const itemContent = contents.find(c => c.id_title == titleId);

        if (itemContent && titleObj.number) {
            headerText = `${titleObj.number} - ${titleObj.text}`;
        }

    }
    updateHeader(headerText);

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

    // Track current chapter and title index for prev/next buttons
    currentChapterId = titleObj.chapter_id;
    currentTitlesList = titles.filter(t => t.chapter_id == titleObj.chapter_id);
    currentTitleIndex = currentTitlesList.findIndex(t => t.id == titleId);

    // Store original HTML for zoom scaling and render with current zoom
    currentContentHtml = item.ct_lyrics;
    renderContent(currentContentHtml);
    renderPrevNextButtons();
}

function renderPrevNextButtons() {
    // Remove existing nav buttons if any
    const existingNav = document.querySelector(".content-nav-buttons");
    if (existingNav) existingNav.remove();

    // Create nav buttons container
    const navContainer = document.createElement("div");
    navContainer.className = "content-nav-buttons";
    navContainer.style.display = "flex";
    navContainer.style.gap = "10px";
    navContainer.style.justifyContent = "space-between";
    navContainer.style.marginTop = "20px";
    navContainer.style.paddingTop = "20px";
    navContainer.style.borderTop = "1px solid #ddd";

    // Previous button
    const prevBtn = document.createElement("button");
    prevBtn.innerText = "← Previous";
    prevBtn.style.flex = "2";
    prevBtn.style.padding = "12px 16px";
    prevBtn.style.background = currentTitleIndex > 0 ? "#2c3e50" : "#ccc";
    prevBtn.style.color = "white";
    prevBtn.style.border = "none";
    prevBtn.style.borderRadius = "6px";
    prevBtn.style.cursor = currentTitleIndex > 0 ? "pointer" : "not-allowed";
    prevBtn.style.fontSize = "14px";
    prevBtn.disabled = currentTitleIndex <= 0;
    prevBtn.onclick = () => {
        if (currentTitleIndex > 0) {
            showContent(currentTitlesList[currentTitleIndex - 1].id);
        }
    };
    navContainer.appendChild(prevBtn);

    // Next button
    const nextBtn = document.createElement("button");
    nextBtn.innerText = "Next →";
    nextBtn.style.flex = "8";
    nextBtn.style.padding = "12px 16px";
    nextBtn.style.background = currentTitleIndex < currentTitlesList.length - 1 ? "#2c3e50" : "#ccc";
    nextBtn.style.color = "white";
    nextBtn.style.border = "none";
    nextBtn.style.borderRadius = "6px";
    nextBtn.style.cursor = currentTitleIndex < currentTitlesList.length - 1 ? "pointer" : "not-allowed";
    nextBtn.style.fontSize = "14px";
    nextBtn.disabled = currentTitleIndex >= currentTitlesList.length - 1;
    nextBtn.onclick = () => {
        if (currentTitleIndex < currentTitlesList.length - 1) {
            showContent(currentTitlesList[currentTitleIndex + 1].id);
        }
    };
    navContainer.appendChild(nextBtn);

    // Append to content container
    const container = document.getElementById("content");
    if (container) {
        const itemDiv = container.querySelector(".item");
        if (itemDiv) {
            itemDiv.appendChild(navContainer);
        }
    }
}

function toggleMenu() {
    const menu = document.getElementById("navMenu");
    const menuBtn = document.getElementById("menuBtn");
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
            if (!menu.contains(target) && target !== menuBtn) {
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
    // Re-render content if currently viewing HTML content with inline styles
    if (currentContentHtml) {
        renderContent(currentContentHtml);
        // Ensure prev/next buttons are preserved after re-render
        renderPrevNextButtons();
    }
}

function zoomOut() {
    currentFontSize = Math.max(currentFontSize - 10, 80);
    applyFontSize();
    // Re-render content if currently viewing HTML content with inline styles
    if (currentContentHtml) {
        renderContent(currentContentHtml);
        // Ensure prev/next buttons are preserved after re-render
        renderPrevNextButtons();
    }
}

function applyFontSize() {
    const root = document.documentElement;
    root.style.fontSize = (16 * (currentFontSize / 100)) + "px";
    localStorage.setItem("fontSizePercentage", currentFontSize);
}

loadFontSize();
loadData();

// Handle Android hardware back button
document.addEventListener("DOMContentLoaded", () => {

    if (window.Capacitor && window.Capacitor.isNativePlatform()) {

        const App = window.Capacitor.Plugins.App;
        const Toast = window.Capacitor.Plugins.Toast;

        let lastBackPress = 0;

        App.addListener("backButton", () => {

            console.log("Back pressed");

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
                    text: 'Press back again to exit'
                });
            }
        });

    }
});
