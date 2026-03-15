document.addEventListener("DOMContentLoaded", () => {
  // ==================== BRAIN AI RESEARCH ASSISTANT ====================
  // DOM-oriented JavaScript Architecture

  // ==================== GLOBAL STATE ====================
  class AppState {
    constructor() {
      this.isThinking = false;
      this.binders = [];
      this.currentOpenBinderId = null;
      this.currentResearchBinder = null;
      this.isResearchView = false;
      this.nextCursor = null;
      this.totalCount = 0;
      this.isLoadingMore = false;
      this.lastLLMCall = 0; // Rate limiting for OpenRouter
      this.searchParams = {
        query: "",
        mode: "best_match",
        minYear: "2015",
        maxYear: "2026",
        perPage: 5,
      };
    }
  }

  // ==================== DOM MANAGER ====================
  class DOMManager {
    constructor() {
      this.elements = this.cacheElements();
      this.setupEventListeners();
    }

    cacheElements() {
      return {
        // Search elements
        queryInput: document.getElementById("queryInput"),
        searchButton: document.querySelector(".search-button"),

        // Filter elements
        minYear: document.getElementById("minYear"),
        maxYear: document.getElementById("maxYear"),
        minYearDisplay: document.getElementById("minYearDisplay"),
        maxYearDisplay: document.getElementById("maxYearDisplay"),
        searchBy: document.getElementById("searchBy"),
        quota: document.getElementById("quota"),

        // Binder elements
        bindersContainer: document.getElementById("bindersContainer"),
        binderCount: document.getElementById("binderCount"),

        // Research view elements
        researchView: document.getElementById("researchView"),
        researchQuery: document.getElementById("researchQuery"),
        researchChatContainer: document.getElementById("researchChatContainer"),
        researchInput: document.getElementById("research-input"),
        researchSendBtn: document.getElementById("research-send-btn"),
        researchBackBtn: document.getElementById("researchBackBtn"),
        saveToBinderBtn: document.getElementById("saveToBinderBtn"),

        // Load more elements
        loadMoreContainer: document.getElementById("loadMoreContainer"),
        loadMoreBtn: document.getElementById("loadMoreBtn"),
        loadMoreStatus: document.getElementById("loadMoreStatus"),

        // Modal elements (backwards compatibility)
        modalOverlay: document.getElementById("modalOverlay"),
        modalChatContainer: document.getElementById("modalChatContainer"),
        modalInput: document.getElementById("modal-input"),
        modalSendBtn: document.getElementById("modal-send-btn"),

        // Profile elements
        profileDropdown: document.getElementById("profileDropdown"),

        // Section elements
        heroSection: document.querySelector(".hero-section"),
        bindersSection: document.querySelector(".binders-section"),
      };
    }

    setupEventListeners() {
      const { elements } = this;

      // Search functionality
      if (elements.searchButton) {
        elements.searchButton.addEventListener("click", () =>
          this.handleSearch(),
        );
      }

      if (elements.queryInput) {
        elements.queryInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            this.handleSearch();
          }
        });
      }

      // Filter listeners
      if (elements.minYear)
        elements.minYear.addEventListener("input", () =>
          this.updateYearLabels(),
        );
      if (elements.maxYear)
        elements.maxYear.addEventListener("input", () =>
          this.updateYearLabels(),
        );

      // Research view listeners
      if (elements.researchSendBtn) {
        elements.researchSendBtn.addEventListener("click", () =>
          this.handleResearchMessage(),
        );
      }

      if (elements.researchInput) {
        elements.researchInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            this.handleResearchMessage();
          }
        });
      }

      if (elements.researchBackBtn) {
        elements.researchBackBtn.addEventListener("click", () =>
          this.hideResearchView(),
        );
      }

      if (elements.saveToBinderBtn) {
        elements.saveToBinderBtn.addEventListener("click", () =>
          this.saveToBinder(),
        );
      }

      // Load more button listener
      if (elements.loadMoreBtn) {
        elements.loadMoreBtn.addEventListener("click", () =>
          this.loadMorePapers(),
        );
      }

      // Modal listeners (backwards compatibility)
      if (elements.modalSendBtn) {
        elements.modalSendBtn.addEventListener("click", () =>
          this.handleModalMessage(),
        );
      }

      if (elements.modalInput) {
        elements.modalInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            this.handleModalMessage();
          }
        });
      }

      // Global keyboard shortcuts
      document.addEventListener("keydown", (e) => {
        if (e.metaKey && e.key === "k") {
          e.preventDefault();
          if (!appState.isResearchView && elements.queryInput) {
            elements.queryInput.focus();
          } else if (appState.isResearchView && elements.researchInput) {
            elements.researchInput.focus();
          }
        }
      });

      // Outside click for dropdown
      document.addEventListener("click", (e) => {
        if (
          elements.profileDropdown &&
          !e.target.closest("#profileDropdown") &&
          !e.target.closest('button[onclick="toggleProfileDropdown()"]')
        ) {
          elements.profileDropdown.classList.add("hidden");
        }
      });
    }

    // ==================== EVENT HANDLERS ====================
    handleSearch() {
      const query = this.elements.queryInput?.value.trim();
      if (!query) {
        alert("Type a research question!");
        return;
      }

      this.showResearchView(query);
      this.elements.queryInput.value = "";
    }

    handleResearchMessage() {
      const input = this.elements.researchInput;
      const text = input?.value.trim();
      if (!text || appState.isThinking || !appState.currentResearchBinder)
        return;

      appState.currentResearchBinder.messages.push({
        role: "user",
        content: text,
      });
      this.addMessage(text, true, this.elements.researchChatContainer);
      input.value = "";
      this.generateResearchResponse();
    }

    handleModalMessage() {
      const input = this.elements.modalInput;
      const text = input?.value.trim();
      if (!text || appState.isThinking || !appState.currentOpenBinderId) return;

      const binder = appState.binders.find(
        (b) => b.id === appState.currentOpenBinderId,
      );
      if (!binder) return;

      binder.messages.push({ role: "user", content: text });
      this.addMessage(text, true, this.elements.modalChatContainer);
      input.value = "";
      this.generateAssistantResponse(binder, this.elements.modalChatContainer);
    }

    // ==================== DOM MANIPULATION ====================
    showResearchView(query) {
      // Hide hero and binders
      if (this.elements.heroSection)
        this.elements.heroSection.style.display = "none";
      if (this.elements.bindersSection)
        this.elements.bindersSection.style.display = "none";

      // Show research view
      if (this.elements.researchView) {
        this.elements.researchView.classList.add("show");
      }

      // Set query
      if (this.elements.researchQuery) {
        this.elements.researchQuery.textContent = query;
      }

      // Hide save button
      if (this.elements.saveToBinderBtn) {
        this.elements.saveToBinderBtn.style.display = "none";
      }

      // Clear chat
      if (this.elements.researchChatContainer) {
        this.elements.researchChatContainer.innerHTML = "";
      }

      // Add user message
      this.addMessage(query, true, this.elements.researchChatContainer);

      appState.isResearchView = true;

      // Create temporary binder
      appState.currentResearchBinder = {
        id: "temp-" + Date.now(),
        name: query.length > 35 ? query.substring(0, 32) + "..." : query,
        color: "#" + Math.floor(Math.random() * 16777215).toString(16),
        messages: [{ role: "user", content: query }],
        papers: [],
      };

      this.generateResearchResponse();
    }

    hideResearchView() {
      if (this.elements.researchView) {
        this.elements.researchView.classList.remove("show");
      }

      if (this.elements.heroSection) {
        this.elements.heroSection.style.display = "flex";
      }

      if (this.elements.bindersSection) {
        this.elements.bindersSection.style.display = "block";
      }

      appState.isResearchView = false;
      appState.currentResearchBinder = null;

      if (this.elements.researchInput) {
        this.elements.researchInput.value = "";
      }
    }

    addMessage(content, isUser = false, container) {
      if (!container) return null;

      const div = document.createElement("div");
      div.className = `message ${isUser ? "user" : "assistant"}`;

      if (isUser) {
        div.textContent = content;
      } else {
        div.innerHTML = `
                <div class="thinking-indicator">
                    <i class="fa-solid fa-brain thinking-icon"></i>
                    <span>Generating response...</span>
                </div>
            `;
      }

      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
      return div;
    }

    renderBinders() {
      if (!this.elements.bindersContainer) return;

      this.elements.bindersContainer.innerHTML = "";

      if (this.elements.binderCount) {
        this.elements.binderCount.textContent = `${appState.binders.length} active`;
      }

      appState.binders.forEach((binder) => {
        const binderElement = this.createBinderElement(binder);
        this.elements.bindersContainer.appendChild(binderElement);
      });
    }

    createBinderElement(binder) {
      const lastMessage =
        binder.messages?.length > 0
          ? binder.messages[binder.messages.length - 1].content
          : "No messages yet";
      const paperCount = binder.papers?.length || 0;
      const messageCount = binder.messages?.length || 0;
      const firstPaper =
        binder.papers?.length > 0 ? binder.papers[0].title : null;

      const card = document.createElement("div");
      card.className = "binder-card";
      card.onclick = () => this.openBinder(binder.id);

      card.innerHTML = `
            <div style="background: ${binder.color}" class="binder-color-bar"></div>
            <div class="binder-content">
                <div class="binder-header">
                    <div onclick="event.stopImmediatePropagation(); domManager.editBinderColor(${binder.id});" 
                         style="background: ${binder.color}" class="binder-color-dot"></div>
                    <div contenteditable="true" spellcheck="false"
                         onblur="domManager.saveBinderName(${binder.id}, this.innerText)"
                         class="binder-title">${binder.name}</div>
                </div>
                
                ${
                  firstPaper
                    ? `
                <div class="binder-paper-preview">
                    <div class="binder-paper-label">Latest Paper</div>
                    <div class="binder-paper-title">
                        ${firstPaper.substring(0, 80)}${firstPaper.length > 80 ? "..." : ""}
                    </div>
                </div>
                `
                    : ""
                }
                
                <div class="binder-stats">
                    <div class="binder-stats-left">
                        <div class="binder-stat">
                            <i class="fa-solid fa-comment-dots"></i>
                            <span>${messageCount} messages</span>
                        </div>
                        ${
                          paperCount > 0
                            ? `
                        <div class="binder-stat">
                            <i class="fa-solid fa-file-alt"></i>
                            <span>${paperCount} papers</span>
                        </div>
                        `
                            : ""
                        }
                    </div>
                    <div class="binder-status">Live</div>
                </div>
                
                ${
                  lastMessage && lastMessage !== "No messages yet"
                    ? `
                <div class="binder-last-message">
                    <div class="binder-last-message-text">
                        "${lastMessage.substring(0, 60)}${lastMessage.length > 60 ? "..." : ""}"
                    </div>
                </div>
                `
                    : ""
                }
            </div>
        `;

      return card;
    }

    openBinder(id) {
      const binder = appState.binders.find((b) => b.id === id);
      if (!binder) return;

      // Hide hero and binders
      if (this.elements.heroSection)
        this.elements.heroSection.style.display = "none";
      if (this.elements.bindersSection)
        this.elements.bindersSection.style.display = "none";

      // Show research view
      if (this.elements.researchView) {
        this.elements.researchView.classList.add("show");
      }

      // Set query
      const firstUserMessage = binder.messages.find((m) => m.role === "user");
      if (this.elements.researchQuery) {
        this.elements.researchQuery.textContent = firstUserMessage
          ? firstUserMessage.content
          : binder.name;
      }

      // Hide save button for existing binders
      if (this.elements.saveToBinderBtn) {
        this.elements.saveToBinderBtn.style.display = "none";
      }

      // Clear and populate chat
      if (this.elements.researchChatContainer) {
        this.elements.researchChatContainer.innerHTML = "";

        binder.messages.forEach((msg) => {
          const div = this.addMessage(
            msg.content,
            msg.role === "user",
            this.elements.researchChatContainer,
          );
          if (msg.role === "assistant") {
            div.innerHTML = this.markdownToHtml(msg.content);
            div.style.opacity = "1";
          }
        });

        if (binder.papers?.length > 0) {
          this.renderPaperCards(
            binder.papers,
            this.elements.researchChatContainer,
          );
        }
      }

      appState.isResearchView = true;
      appState.currentResearchBinder = binder;

      if (this.elements.researchInput) {
        this.elements.researchInput.focus();
      }
    }

    updateYearLabels() {
      if (!this.elements.minYear || !this.elements.maxYear) return;

      const minVal = parseInt(this.elements.minYear.value);
      const maxVal = parseInt(this.elements.maxYear.value);

      if (minVal > maxVal) {
        this.elements.minYear.value = maxVal;
      }

      if (this.elements.minYearDisplay) {
        this.elements.minYearDisplay.textContent = this.elements.minYear.value;
      }

      if (this.elements.maxYearDisplay) {
        this.elements.maxYearDisplay.textContent = this.elements.maxYear.value;
      }
    }

    async retrieveFromBackend(
      query,
      minYear,
      maxYear,
      sortPref,
      maxPapers,
      cursor = null,
    ) {
      // Use cursor pagination if provided, otherwise start from beginning
      const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
      const url = `/api/search/?q=${encodeURIComponent(query)}&mode=${sortPref}&per_page=${Math.min(maxPapers, 50)}${cursorParam}`;

      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Backend search error ${response.status}`);

      const data = await response.json();
      return data; // Return full data object including pagination info
    }

    // ==================== API CALLS ====================
    async generateResearchResponse() {
      if (!appState.currentResearchBinder || appState.isThinking) return;

      const container = this.elements.researchChatContainer;
      const sendBtn = this.elements.researchSendBtn;

      appState.isThinking = true;
      if (sendBtn) sendBtn.disabled = true;

      const assistantDiv = this.addMessage("", false, container);

      // Show loading
      assistantDiv.innerHTML = `
            <div class="research-loading">
                <i class="fa-solid fa-brain"></i>
                <span>Generating response...</span>
            </div>
        `;

      try {
        const minYear = this.elements.minYear?.value || "2015";
        const maxYear = this.elements.maxYear?.value || "2026";
        const sortPref = this.elements.searchBy?.value || "most-cited";
        const maxPapers = parseInt(this.elements.quota?.value || "5");

        const lastUserQuery =
          appState.currentResearchBinder.messages[
            appState.currentResearchBinder.messages.length - 1
          ].content;

        // Store search parameters for load more functionality
        appState.searchParams = {
          query: lastUserQuery,
          mode: sortPref,
          minYear: minYear,
          maxYear: maxYear,
          perPage: maxPapers,
        };

        const searchData = await this.retrieveFromBackend(
          lastUserQuery,
          minYear,
          maxYear,
          sortPref,
          maxPapers,
        );

        // Store pagination info
        appState.nextCursor = searchData.next_cursor;
        appState.totalCount = searchData.total_count;

        // Update UI with pagination info
        this.updatePaginationInfo();

        appState.currentResearchBinder.papers = searchData.papers;

        if (searchData.papers.length > 0) {
          this.renderPaperCards(searchData.papers, container);
        }

        // Apply rate limiting before LLM call
        await this.waitForRateLimit();

        const response = await fetch("/api/summarise/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken,
          },
          body: JSON.stringify({
            query: lastUserQuery,
            papers: searchData.papers,
          }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || `Summarise error ${response.status}`);
        }

        const data = await response.json();
        const summary = data.summary || "No summary returned.";

        assistantDiv.innerHTML = this.markdownToHtml(summary);
        appState.currentResearchBinder.messages.push({
          role: "assistant",
          content: summary,
        });

        // Show save button for temporary binders
        if (appState.currentResearchBinder.id.startsWith("temp-")) {
          if (this.elements.saveToBinderBtn) {
            this.elements.saveToBinderBtn.style.display = "block";
          }
        }
      } catch (err) {
        assistantDiv.innerHTML = `Error: ${err.message}`;
      } finally {
        appState.isThinking = false;
        if (sendBtn) sendBtn.disabled = false;
        if (this.elements.researchInput) {
          this.elements.researchInput.focus();
        }
      }
    }

    async loadMorePapers() {
      if (!appState.nextCursor || appState.isLoadingMore) return;

      appState.isLoadingMore = true;
      const btn = this.elements.loadMoreBtn;
      const status = this.elements.loadMoreStatus;

      if (btn) btn.disabled = true;
      if (status) status.textContent = "Loading more papers...";

      try {
        const response = await fetch(
          `/api/search/?q=${encodeURIComponent(appState.searchParams.query)}&mode=${appState.searchParams.mode}&cursor=${encodeURIComponent(appState.nextCursor)}&per_page=25`,
        );

        if (!response.ok) {
          throw new Error(`Load more error ${response.status}`);
        }

        const data = await response.json();

        // Append new papers
        appState.currentResearchBinder.papers.push(...data.papers);
        appState.nextCursor = data.next_cursor;

        // Render additional papers
        this.renderAdditionalPapers(data.papers);

        // Update pagination info
        this.updatePaginationInfo();

        // Hide button if no more results
        if (!data.next_cursor) {
          if (this.elements.loadMoreContainer) {
            this.elements.loadMoreContainer.style.display = "none";
          }
        }
      } catch (err) {
        if (status) status.textContent = `Error: ${err.message}`;
      } finally {
        appState.isLoadingMore = false;
        if (btn) btn.disabled = false;
        if (status) status.textContent = "";
      }
    }

    async waitForRateLimit() {
      const MIN_INTERVAL = 3000; // 3 seconds between LLM calls
      const now = Date.now();
      const timeSinceLastCall = now - appState.lastLLMCall;

      if (timeSinceLastCall < MIN_INTERVAL) {
        const waitTime = MIN_INTERVAL - timeSinceLastCall;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }

      appState.lastLLMCall = Date.now();
    }

    updatePaginationInfo() {
      const currentCount = appState.currentResearchBinder.papers?.length || 0;
      const totalCount = appState.totalCount;

      // Find or create pagination info element
      let infoElement = document.querySelector(".pagination-info");
      if (!infoElement) {
        infoElement = document.createElement("div");
        infoElement.className = "pagination-info";
        this.elements.researchChatContainer.appendChild(infoElement);
      }

      infoElement.innerHTML = `
        <div class="pagination-text">
          Showing ${currentCount} of ${totalCount.toLocaleString()} papers
          ${appState.nextCursor ? `(more available)` : "(all loaded)"}
        </div>
      `;

      // Show or hide load more button based on nextCursor
      if (this.elements.loadMoreContainer) {
        if (appState.nextCursor && !appState.isLoadingMore) {
          this.elements.loadMoreContainer.style.display = "flex";
        } else {
          this.elements.loadMoreContainer.style.display = "none";
        }
      }
    }

    renderAdditionalPapers(papers) {
      if (!papers?.length) return;

      // Find existing papers grid or create new one
      let papersContainer =
        this.elements.researchChatContainer.querySelector(".papers-grid");
      if (!papersContainer) {
        papersContainer = document.createElement("div");
        papersContainer.className = "papers-grid mt-4 mb-4";
        papersContainer.innerHTML =
          '<div class="papers-grid-title mb-3">RELEVANT PAPERS</div>';
        this.elements.researchChatContainer.appendChild(papersContainer);
      }

      papers.forEach((paper, i) => {
        const existingCount =
          papersContainer.querySelectorAll(".paper-card").length;
        const paperCard = this.createPaperCard(paper, existingCount + i);
        papersContainer.appendChild(paperCard);
      });
    }

    // ==================== UTILITY METHODS ====================
    markdownToHtml(text) {
      if (!text) return "";

      return text
        .replace(/```(?:\s*\w+)?\s*\n([\s\S]*?)\n```/g, (match, p1) => {
          const code = this.escapeHtml(p1.trim());
          return `<pre class="code-block"><code>${code}</code></pre>`;
        })
        .replace(/\*\*([^\r\n*]+?)\*\*/g, "<strong>$1</strong>")
        .replace(/__([^\r\n_]+?)__/g, "<strong>$1</strong>")
        .replace(/\*([^\r\n*]+?)\*/g, "<em>$1</em>")
        .replace(/_([^\r\n_]+?)_/g, "<em>$1</em>")
        .replace(/`([^`\r\n]+)`/g, "<code>$1</code>")
        .replace(/^\s*[-*+]\s+/gm, "• ")
        .replace(/\n/g, "<br>");
    }

    escapeHtml(unsafe) {
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    renderPaperCards(papers, container) {
      if (!papers?.length || !container) return;

      const papersContainer = document.createElement("div");
      papersContainer.className = "papers-grid mt-4 mb-4";
      papersContainer.innerHTML =
        '<div class="papers-grid-title mb-3">RELEVANT PAPERS</div>';

      papers.forEach((paper, i) => {
        const paperCard = this.createPaperCard(paper, i);
        papersContainer.appendChild(paperCard);
      });

      container.appendChild(papersContainer);
    }

    createPaperCard(paper, index) {
      const authors = paper.authors
        ? paper.authors
            .slice(0, 2)
            .map((a) => a.name)
            .join(", ")
        : "Unknown authors";
      const abstract = paper.abstract
        ? paper.abstract.substring(0, 150) +
          (paper.abstract.length > 150 ? "..." : "")
        : "No abstract available";

      const card = document.createElement("div");
      card.className =
        "paper-card hover:bg-zinc-800/70 transition-colors cursor-pointer";
      card.innerHTML = `
            <div class="paper-card-content">
                <div class="paper-number">${index + 1}.</div>
                <div class="paper-details">
                    <div class="paper-title">
                        ${paper.doi ? `<a href="https://doi.org/${paper.doi}" target="_blank" class="paper-link">${paper.title}</a>` : paper.title}
                    </div>
                    <div class="paper-meta">${authors} • ${paper.publication_year || "N/A"}</div>
                    <div class="paper-abstract">${abstract}</div>
                </div>
            </div>
        `;

      card.onclick = (e) => {
        if (!e.target.closest("a") && paper.doi) {
          window.open(`https://doi.org/${paper.doi}`, "_blank");
        }
      };

      return card;
    }

    // ==================== BINDER MANAGEMENT ====================
    saveToBinder() {
      if (!appState.currentResearchBinder) return;

      appState.binders.push({ ...appState.currentResearchBinder });
      this.renderBinders();
      this.generateTitle(appState.currentResearchBinder);
      this.hideResearchView();
    }

    async generateTitle(binder) {
      if (!binder) return;

      try {
        const response = await fetch("/api/generate_title/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken,
          },
          body: JSON.stringify({
            messages: binder.messages,
          }),
        });

        if (!response.ok) {
          throw new Error(`Title API error: ${response.status}`);
        }

        const data = await response.json();
        const suggestedTitle = data.title || "Research Conversation";

        if (suggestedTitle.length > 5 && suggestedTitle.length < 60) {
          binder.name = suggestedTitle;
          this.renderBinders();
          console.log(`✅ Auto-titled: ${suggestedTitle}`);
        }
      } catch (err) {
        console.warn("Auto-title failed:", err);
        if (binder.messages[0] && binder.messages[0].role === "user") {
          let fallback = binder.messages[0].content.substring(0, 38);
          if (binder.messages[0].content.length > 38) fallback += "...";
          binder.name = fallback;
          this.renderBinders();
        }
      }
    }

    // ==================== BINDER MANAGEMENT ====================
    saveBinderName(binderId, newName) {
      const binder = appState.binders.find((b) => b.id === binderId);
      if (binder && newName.trim() !== "") {
        binder.name = newName.trim();
        this.renderBinders();
      }
    }

    editBinderColor(binderId) {
      event.stopImmediatePropagation();
      const binder = appState.binders.find((b) => b.id === binderId);
      if (!binder) return;

      const colorPicker = document.createElement("input");
      colorPicker.type = "color";
      colorPicker.value = binder.color;
      colorPicker.style.position = "absolute";
      colorPicker.style.opacity = "0";
      document.body.appendChild(colorPicker);

      colorPicker.onchange = function () {
        binder.color = this.value;
        domManager.renderBinders();
        document.body.removeChild(colorPicker);
      };

      colorPicker.click();
    }

    addNewBinder() {
      const newBinder = {
        id: Date.now(),
        name: "New Research Binder",
        color: "#" + Math.floor(Math.random() * 16777215).toString(16),
        messages: [],
      };
      appState.binders.push(newBinder);
      this.renderBinders();
      setTimeout(() => this.openBinder(newBinder.id), 80);
    }

    // ==================== BACKWARDS COMPATIBILITY ====================
    generateAssistantResponse(binder, container) {
      // This method is kept for backwards compatibility with modal system
      if (appState.isThinking || !binder) return;

      const sendBtn = this.elements.modalSendBtn;
      appState.isThinking = true;
      if (sendBtn) sendBtn.disabled = true;

      const assistantDiv = this.addMessage("", false, container);

      // Similar implementation to generateResearchResponse but for modal
      async function generateResponse() {
        try {
          const minYear = domManager.elements.minYear?.value || "2015";
          const maxYear = domManager.elements.maxYear?.value || "2026";
          const sortPref = domManager.elements.searchBy?.value || "most-cited";
          const maxPapers = parseInt(domManager.elements.quota?.value || "5");

          const lastUserQuery =
            binder.messages[binder.messages.length - 1].content;
          const papers = await domManager.retrieveFromBackend(
            lastUserQuery,
            minYear,
            maxYear,
            sortPref,
            maxPapers,
          );

          binder.papers = papers;

          if (papers.length > 0) {
            domManager.renderPaperCards(papers, container);
          }

          const response = await fetch("/api/summarise/", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRFToken": csrfToken,
            },
            body: JSON.stringify({
              query: lastUserQuery,
              papers: papers,
            }),
          });

          if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || `Summarise error ${response.status}`);
          }

          const data = await response.json();
          const summary = data.summary || "No summary returned.";

          assistantDiv.innerHTML = domManager.markdownToHtml(summary);
          binder.messages.push({ role: "assistant", content: summary });

          if (binder.messages.length === 2) {
            domManager.generateTitle(binder);
          }
        } catch (err) {
          assistantDiv.innerHTML = `Error: ${err.message}`;
        } finally {
          appState.isThinking = false;
          if (sendBtn) sendBtn.disabled = false;
          if (domManager.elements.modalInput) {
            domManager.modalInput.focus();
          }
        }
      }

      generateResponse();
    }
  }

  // ==================== GLOBAL STATE ====================
  let appState;
  let domManager;

  // ==================== GLOBAL FUNCTIONS (for backwards compatibility) ====================
  // Global functions that can be called from HTML onclick attributes
  function toggleProfileDropdown() {
    const dropdown = document.getElementById("profileDropdown");
    if (dropdown) {
      dropdown.classList.toggle("hidden");
    }
  }

  function logout() {
    if (confirm("Log out of BRAIN?")) {
      alert("👋 Logged out (demo)");
    }
  }

  function resetFilters() {
    if (domManager) {
      if (domManager.elements.minYear)
        domManager.elements.minYear.value = "2015";
      if (domManager.elements.maxYear)
        domManager.elements.maxYear.value = "2026";
      if (domManager.elements.searchBy)
        domManager.elements.searchBy.value = "best_match";
      if (domManager.elements.quota) domManager.elements.quota.value = "5";
      domManager.updateYearLabels();
    }
  }

  function performSearch() {
    if (domManager) domManager.handleSearch();
  }

  function openBinder(id) {
    if (domManager) domManager.openBinder(id);
  }

  function closeModal() {
    if (domManager && domManager.elements.modalOverlay) {
      domManager.elements.modalOverlay.classList.add("hidden");
      domManager.elements.modalOverlay.classList.remove("flex");
      appState.currentOpenBinderId = null;
    }
  }

  function addNewBinder() {
    if (domManager) domManager.addNewBinder();
  }

  function saveBinderName(binderId, newName) {
    if (domManager) domManager.saveBinderName(binderId, newName);
  }

  function editBinderColor(binderId) {
    if (domManager) domManager.editBinderColor(binderId);
  }

  // ==================== INITIALIZATION ====================
  function init() {
    appState = new AppState();
    domManager = new DOMManager();

    // Initial render
    domManager.renderBinders();
    domManager.updateYearLabels();

    console.log("🧠 BRAIN AI Research Assistant initialized");
  }

  // Initialize the application
  init();
}); // End of DOMContentLoaded
