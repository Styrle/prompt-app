// script.js
let currentActiveSubject = null;
let currentQualification = null;

let questionIndexMap   = {};
let conditionalLogicMap = {};
let visitedQuestions   = [];

// Store user's final chosen prompt texts
let allOrPartText     = "";
let performanceLevel  = "";
let partText          = "";
let originalText      = "";
let paperName         = "";
let minutesPerMark    = "";

// NEW — taxonomy helpers
let taxonomySelections = [];   // e.g. ["VAT level 1", "Stocks & shares level 2"]
let inputTopicText     = "";   // fallback from q16

// Store user’s final chosen Q-prompt from prompt.json
let selectedQ2PromptText  = "";
let selectedQ3PromptText  = "";
let selectedQ6PromptText  = "";
let selectedQ7PromptText  = "";
let selectedQ10PromptText = "";
let selectedQ11PromptText = "";

/* ─────  Marks-per-minute lookup  ───── */
const minsPerMarkMatrix = [
  { Qualification: "AAT", Paper: "AMAC", MinsPerMark: 1.8 },
  { Qualification: "AAT", Paper: "AUDT", MinsPerMark: 1.5 },
  { Qualification: "AAT", Paper: "BENV", MinsPerMark: 1.2 },
  { Qualification: "AAT", Paper: "BNTA", MinsPerMark: 1.5 },
  { Qualification: "AAT", Paper: "BUAW", MinsPerMark: 1.5 },
  { Qualification: "AAT", Paper: "CRDM", MinsPerMark: 1.2 },
  { Qualification: "AAT", Paper: "CSFT", MinsPerMark: 1.2 },
  { Qualification: "AAT", Paper: "DAIF", MinsPerMark: 1.25 },
  { Qualification: "AAT", Paper: "FAPS", MinsPerMark: 1.25 },
  { Qualification: "AAT", Paper: "INAC", MinsPerMark: 1.5 },
  { Qualification: "AAT", Paper: "ITBK", MinsPerMark: 0.9 },
  { Qualification: "AAT", Paper: "MATS", MinsPerMark: 1.25 },
  { Qualification: "AAT", Paper: "PCTN", MinsPerMark: 0.9 },
  { Qualification: "AAT", Paper: "PNTA", MinsPerMark: 1.2 },
  { Qualification: "AAT", Paper: "POBC", MinsPerMark: 0.9 },
  { Qualification: "AAT", Paper: "TPFB", MinsPerMark: 1.125 },
  { Qualification: "ACA", Paper: "AA",   MinsPerMark: 1.5 },
  { Qualification: "ACA", Paper: "AC",   MinsPerMark: 2.25 },
  { Qualification: "ACA", Paper: "ASS",  MinsPerMark: 0.9 },
  { Qualification: "ACA", Paper: "BFT",  MinsPerMark: 0.9 },
  { Qualification: "ACA", Paper: "BPB",  MinsPerMark: 1.5 },
  { Qualification: "ACA", Paper: "BPI",  MinsPerMark: 1.5 },
  { Qualification: "ACA", Paper: "BST",  MinsPerMark: 1.5 },
  { Qualification: "ACA", Paper: "CR",   MinsPerMark: 2.1 },
  { Qualification: "ACA", Paper: "FAR",  MinsPerMark: 1.8 },
  { Qualification: "ACA", Paper: "FM",   MinsPerMark: 1.5 },
  { Qualification: "ACA", Paper: "LAW",  MinsPerMark: 0.9 },
  { Qualification: "ACA", Paper: "MI",   MinsPerMark: 0.9 },
  { Qualification: "ACA", Paper: "SBM",  MinsPerMark: 2.1 },
  { Qualification: "ACCA", Paper: "AA",          MinsPerMark: 1.8 },
  { Qualification: "ACCA", Paper: "AAA INTL",    MinsPerMark: 1.95 },
  { Qualification: "ACCA", Paper: "AAA UK",      MinsPerMark: 1.95 },
  { Qualification: "ACCA", Paper: "AFM",         MinsPerMark: 1.95 },
  { Qualification: "ACCA", Paper: "APM",         MinsPerMark: 1.95 },
  { Qualification: "ACCA", Paper: "BT",          MinsPerMark: 1.2 },
  { Qualification: "ACCA", Paper: "FA",          MinsPerMark: 1.2 },
  { Qualification: "ACCA", Paper: "FA1",         MinsPerMark: 1.2 },
  { Qualification: "ACCA", Paper: "FA2",         MinsPerMark: 1.2 },
  { Qualification: "ACCA", Paper: "FAU",         MinsPerMark: 1.2 },
  { Qualification: "ACCA", Paper: "FFM",         MinsPerMark: 1.2 },
  { Qualification: "ACCA", Paper: "FM",          MinsPerMark: 1.8 },
  { Qualification: "ACCA", Paper: "FR",          MinsPerMark: 1.8 },
  { Qualification: "ACCA", Paper: "LAW ENG",     MinsPerMark: 1.2 },
  { Qualification: "ACCA", Paper: "LAW GLO",     MinsPerMark: 1.2 },
  { Qualification: "ACCA", Paper: "MA",          MinsPerMark: 1.2 },
  { Qualification: "ACCA", Paper: "MA1",         MinsPerMark: 1.2 },
  { Qualification: "ACCA", Paper: "MA2",         MinsPerMark: 1.2 },
  { Qualification: "ACCA", Paper: "PM",          MinsPerMark: 1.8 },
  { Qualification: "ACCA", Paper: "SBL",         MinsPerMark: 2.4 },
  { Qualification: "ACCA", Paper: "SBR INTL",    MinsPerMark: 1.95 },
  { Qualification: "ACCA", Paper: "SBR UK",      MinsPerMark: 1.95 },
  { Qualification: "ATT",  Paper: "Business Compliance",                 MinsPerMark: 2.1 },
  { Qualification: "ATT",  Paper: "Business Taxation",                   MinsPerMark: 2.1 },
  { Qualification: "ATT",  Paper: "Corporate Taxation",                  MinsPerMark: 2.1 },
  { Qualification: "ATT",  Paper: "IHT Trusts & Estates",                MinsPerMark: 2.1 },
  { Qualification: "ATT",  Paper: "Law CBE",                             MinsPerMark: 1.5 },
  { Qualification: "ATT",  Paper: "Personal Taxation",                   MinsPerMark: 2.1 },
  { Qualification: "ATT",  Paper: "Principles of Accounting",            MinsPerMark: 1.5 },
  { Qualification: "ATT",  Paper: "Professional Responsibilities & Ethics", MinsPerMark: 1.5 },
  { Qualification: "ATT",  Paper: "VAT",                                 MinsPerMark: 2.1 },
  { Qualification: "CIMA", Paper: "BA1", MinsPerMark: 1.2 },
  { Qualification: "CIMA", Paper: "BA2", MinsPerMark: 1.2 },
  { Qualification: "CIMA", Paper: "BA3", MinsPerMark: 1.2 },
  { Qualification: "CIMA", Paper: "BA4", MinsPerMark: 1.2 },
  { Qualification: "CIMA", Paper: "E1",  MinsPerMark: 1.5 },
  { Qualification: "CIMA", Paper: "E2",  MinsPerMark: 1.5 },
  { Qualification: "CIMA", Paper: "E3",  MinsPerMark: 1.5 },
  { Qualification: "CIMA", Paper: "F1",  MinsPerMark: 1.5 },
  { Qualification: "CIMA", Paper: "F2",  MinsPerMark: 1.5 },
  { Qualification: "CIMA", Paper: "F3",  MinsPerMark: 1.5 },
  { Qualification: "CIMA", Paper: "P1",  MinsPerMark: 1.5 },
  { Qualification: "CIMA", Paper: "P2",  MinsPerMark: 1.5 },
  { Qualification: "CIMA", Paper: "P3",  MinsPerMark: 1.5 },
  { Qualification: "ACA",  Paper: "PoT", MinsPerMark: 0.9 },
  { Qualification: "ACA",  Paper: "TC",  MinsPerMark: 1.5 },
  { Qualification: "ACCA", Paper: "ATX", MinsPerMark: 1.95 },
  { Qualification: "ACCA", Paper: "TX",  MinsPerMark: 1.95 },
  { Qualification: "ACCA", Paper: "FTX", MinsPerMark: 1.2 },
  { Qualification: "CTA",  Paper: "Corporation tax (Awareness)",                                         MinsPerMark: 1.083333333 },
  { Qualification: "CTA",  Paper: "IHT Trusts and Estates (Advanced technical)",                         MinsPerMark: 2.1 },
  { Qualification: "CTA",  Paper: "IHT Trusts and Estates (Application and professional skills)",        MinsPerMark: 26.25 },
  { Qualification: "CTA",  Paper: "Inheritance tax Trusts and Estates (Awareness)",                     MinsPerMark: 1.083333333 },
  { Qualification: "CTA",  Paper: "Taxation of Individuals (Advanced technical)",                       MinsPerMark: 2.1 },
  { Qualification: "CTA",  Paper: "Taxation of individuals (Application and professional skills)",      MinsPerMark: 26.25 },
  { Qualification: "CTA",  Paper: "Taxation of Individuals (Awareness)",                                MinsPerMark: 1.083333333 },
  { Qualification: "CTA",  Paper: "Taxation of Larger Companies & Groups (Advanced technical)",         MinsPerMark: 2.1 },
  { Qualification: "CTA",  Paper: "Taxation of Larger Companies and Groups (Application and professional skills)", MinsPerMark: 26.25 },
  { Qualification: "CTA",  Paper: "Taxation of Owner Managed Businesses (Advanced technical)",          MinsPerMark: 2.1 },
  { Qualification: "CTA",  Paper: "Taxation of Owner Managed Businesses (Application and professional skills)",    MinsPerMark: 26.25 },
  { Qualification: "CTA",  Paper: "Taxation of Unincorporated Businesses (Awareness)",                  MinsPerMark: 1.083333333 },
  { Qualification: "CTA",  Paper: "VAT and Stamp Taxes (Awareness)",                                    MinsPerMark: 1.083333333 }
];


function escapeName(str) {
  return str
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

// Possibly store the # of marks from q4 if relevant
let writtenTestMarks = "";

function showFormSnippet(qualification, subject) {
  const formContainer = document.getElementById("form-container");
  if (!formContainer) {
    console.error("[showFormSnippet] Cannot find form-container element!");
    return Promise.reject(new Error("Form container not found"));
  }

  formContainer.innerHTML = "";

  /* reset state when the subject actually changes */
  const isNewSubjectSelection = currentActiveSubject !== subject;
  if (isNewSubjectSelection) {
    visitedQuestions         = [];
    selectedQ2PromptText     = "";
    selectedQ3PromptText     = "";
    selectedQ6PromptText     = "";
    selectedQ7PromptText     = "";
    selectedQ10PromptText    = "";
    selectedQ11PromptText    = "";
    writtenTestMarks         = "";
    userQuestionText         = "";
    userAnswerText           = "";
    allOrPartText            = "";
    performanceLevel         = "";
    partText                 = "";
    originalText             = "";
  }

  /* loading splash */
  formContainer.innerHTML = `
    <div class="centered-form-wrapper fade-in">
      <div class="styled-form-container">
        <h2>Loading ${qualification} ${subject}...</h2>
      </div>
    </div>
  `;

  const url = `/api/formSnippet?qualification=${encodeURIComponent(
    qualification
  )}&subject=${encodeURIComponent(subject)}`;

  return fetch(url)
    .then((r) => {
      if (!r.ok) {
        return r.text().then((t) => {
          throw new Error(`Failed to load form: ${t}`);
        });
      }
      return r.text();
    })
    .then((snippetHtml) => {
      /* inject HTML -------------------------------------------------- */
      formContainer.innerHTML = `
        <div class="centered-form-wrapper fade-in">
          ${snippetHtml}
        </div>
      `;

      /* grab the wrapper we just inserted --------------------------- */
      const containerDiv = formContainer.querySelector(
        ".styled-form-container"
      );
      if (containerDiv) {
        /* pull JSON blobs that were embedded as data‑attributes */
        const parse = (attr) => {
          const raw = containerDiv.getAttribute(attr);
          if (!raw) return {};
          try {
            return JSON.parse(raw);
          } catch (e) {
            /* handle the &quot;‑escaped variant */
            return JSON.parse(raw.replace(/&quot;/g, '"'));
          }
        };

        conditionalLogicMap = parse("data-logicmap");
        questionIndexMap    = parse("data-questionindexmap");
        window.totalQuestions = parseInt(
          containerDiv.getAttribute("data-totalquestions") || "0",
          10
        );

        /* prompt‑arrays */
        window.q2Prompts  = parse("data-q2prompts");
        window.q3Prompts  = parse("data-q3prompts");
        window.q6Prompts  = parse("data-q6prompts");
        window.q7Prompts  = parse("data-q7prompts");
        window.q10Prompts = parse("data-q10prompts");
        window.q11Prompts = parse("data-q11prompts");
      }

      /* ------------ ★ NEW PART ★ – merge questions into cache ------ */
      if (window.isAdmin && window.questionsCache) {
        formContainer
          .querySelectorAll(".question-block")
          .forEach((blk) => {
            const id = blk.id;
            /* skip if this question is already known */
            if (window.questionsCache.some((q) => q.id === id)) return;

            /* harvest title & options from DOM */
            const title = blk.querySelector(".question-title")?.innerText.trim() || "";
            const opts  = Array.from(
              blk.querySelectorAll(".answer-box span")
            ).map((s) => s.innerText.trim());

            /* rebuild its conditionalLogic from the logic‑map */
            const logic = (conditionalLogicMap[id] || []).map((r) => ({
              option: opts.find((o) => escapeName(o) === r.option) || r.option,
              goToQuestion: r.targetId,
            }));

            window.questionsCache.push({ id, title, options: opts, conditionalLogic: logic });
          });
      }
      /* ------------------------------------------------------------- */

      /* gently scroll the form into view */
      formContainer.scrollIntoView({ behavior: "smooth", block: "center" });
    })
    .catch((err) => {
      console.error("Error loading form snippet:", err);
      formContainer.innerHTML = `
        <div class="centered-form-wrapper fade-in">
          <div class="styled-form-container">
            <h2>Error</h2>
            <p>Oops, failed to load the form: ${err.message}</p>
            <button class="nav-btn subject-btn" onclick="history.back()">Go Back</button>
          </div>
        </div>
      `;
    });
}

let userQuestionText = "";
let userAnswerText = "";

async function goToQuestionAsync(currentId, proposedNextId, isBack) {
  console.log(
    `[goToQuestion] currentId=${currentId}, proposedNextId=${proposedNextId}, isBack=${isBack}`
  );

  const questionBlock = document.getElementById(currentId);
  if (!questionBlock) {
    console.warn(`[goToQuestion] No DOM block for '${currentId}'`);
    return;
  }

  let nextId = proposedNextId;

  /* ──────────────── HISTORY NAVIGATION ──────────────── */
  if (isBack) {
    if (visitedQuestions.length) nextId = visitedQuestions.pop();
  } else {
    visitedQuestions.push(currentId);

    /* ---------- what did the user pick / type? ---------- */
    let selectedValue = null;
    const inputs = questionBlock.querySelectorAll(
      "input[type=radio], input[type=checkbox], select"
    );
    for (const input of inputs) {
      if (
        (input.type === "radio" || input.type === "checkbox") &&
        input.checked
      ) {
        selectedValue = input.value;
        break;
      }
      if (input.tagName.toLowerCase() === "select" && input.value) {
        selectedValue = input.value;
      }
    }

    /* ────────────── PROMPT-ARRAY CAPTURE (unchanged) ───────────── */
    if (
      selectedValue &&
      ["q2", "q3", "q6", "q7", "q10", "q11"].includes(currentId)
    ) {
      const plain = selectedValue
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/[()]/g, "")
        .trim();

      const pList = window[`${currentId}Prompts`] || [];
      const found = pList.find(
        (p) => p?.answer?.toLowerCase().replace(/[()]/g, "").trim() === plain
      );
      const desc = found ? found.description : "";

      switch (currentId) {
        case "q2":
          selectedQ2PromptText = desc;
          break;
        case "q3":
          selectedQ3PromptText = desc;
          break;
        case "q6":
          selectedQ6PromptText = desc;
          break;
        case "q7":
          selectedQ7PromptText = desc;
          break;
        case "q10":
          selectedQ10PromptText = desc;
          break;
        case "q11":
          selectedQ11PromptText = desc;
          break;
      }
    }

    /* ────────────── QUESTION-SPECIFIC CAPTURE ───────────── */
    const titleText =
      questionBlock.querySelector(".question-title")?.innerText || "";

    /* 1️⃣  TAXONOMY OPTIONS (multi-select, multi-level) */
    if (selectedValue) {
      const svLower = selectedValue.replace(/_/g, " ").toLowerCase();
      if (!svLower.includes("skip to end")) {
        /* detect “level N” or “L N” in the title */
        const match = titleText.match(/(?:level\s*|l)(\d+)/i);
        if (match) {
          const lvl = parseInt(match[1], 10) || 1;
          const clean = selectedValue.replace(/_/g, " ").trim();

          if (!taxonomySelections[lvl]) taxonomySelections[lvl] = new Set();
          taxonomySelections[lvl].add(clean); // allow many per level
        }
      }
    }

    /* 2️⃣  FREE-TEXT TOPIC (q16) */
    if (currentId === "q16") {
      const el = questionBlock.querySelector("textarea, input[type=text]");
      inputTopicText = el ? el.value.trim() : "";
    }

    /* 3️⃣  OTHER EXISTING CAPTURES */
    switch (currentId) {
      case "q4":
      case "q8": {
        const el = questionBlock.querySelector("textarea, input[type=text]");
        writtenTestMarks = el ? el.value.trim() : "";
        break;
      }
      case "q29": {
        const el = questionBlock.querySelector("textarea, input[type=text]");
        userQuestionText = el ? el.value.trim() : "";
        break;
      }
      case "q30": {
        const el = questionBlock.querySelector("textarea, input[type=text]");
        userAnswerText = el ? el.value.trim() : "";
        break;
      }
      case "q17":
        if (selectedValue) allOrPartText = selectedValue;
        break;
      case "q18": {
        const el = questionBlock.querySelector("textarea, input[type=text]");
        partText = el ? el.value.trim() : "";
        break;
      }
      case "q34":
        if (selectedValue) performanceLevel = selectedValue;
        break;
      case "q37": {
        const el = questionBlock.querySelector("textarea, input[type=text]");
        originalText = el ? el.value.trim() : "";
        break;
      }
    }

    /* 4️⃣  CONDITIONAL-LOGIC JUMP */
    const rule = (conditionalLogicMap[currentId] || []).find(
      (r) => r.option === selectedValue
    );
    if (rule?.targetId) nextId = rule.targetId;
  }

  /* ────────────── NAVIGATE UI ───────────── */
  questionBlock.style.display = "none";
  const nextBlock = document.getElementById(nextId);
  if (!nextBlock) return;
  nextBlock.style.display = "block";

  /* ────────────── (ADMIN decoration unchanged) ───────────── */

  /* ────────────── PROMPT BUILDER ───────────── */
  function buildFinalPrompt() {
    /* minutes-per-mark (unchanged) */
    minutesPerMark = "";
    const n = parseFloat(writtenTestMarks);
    if (
      !isNaN(n) &&
      currentQualification &&
      currentActiveSubject
    ) {
      const row = minsPerMarkMatrix.find(
        (r) =>
          r.Qualification === currentQualification &&
          r.Paper === currentActiveSubject
      );
      if (row) {
        const f = parseFloat(row.MinsPerMark);
        if (!isNaN(f)) minutesPerMark = (n * f).toFixed(2).toString();
      }
    }

    /* pick base prompt */
    let finalPrompt =
      selectedQ2PromptText ||
      selectedQ3PromptText ||
      selectedQ6PromptText ||
      selectedQ7PromptText ||
      selectedQ10PromptText ||
      selectedQ11PromptText ||
      "";

    /* build topic list */
    let topicReplacement = "";
    const levels = Object.keys(taxonomySelections)
      .map((k) => parseInt(k, 10))
      .sort((a, b) => a - b);

    if (levels.length) {
      const parts = [];
      levels.forEach((lvl) => {
        taxonomySelections[lvl].forEach((txt) =>
          parts.push(`${txt} level ${lvl}`)
        );
      });
      topicReplacement = parts.join(", ");
    } else {
      topicReplacement = inputTopicText || currentActiveSubject;
    }

    /* replacements */
    [
      [/<WTQ marks>/g, writtenTestMarks],
      [/<marks>/g, writtenTestMarks],
      [/<qualification>/g, currentQualification],
      [/<topic>/g, topicReplacement],
      [/<paper>/g, currentActiveSubject],
      [/<minutes per mark>/g, minutesPerMark],
      [/<all or part>/g, allOrPartText],
      [/<part>/g, partText],
      [/<Performance level>/g, performanceLevel],
      [/<original text - content>/g, originalText],
      [/<original text>/g, originalText],
      [/<Question>/g, userQuestionText],
      [/<Answer>/g, userAnswerText],
    ].forEach(([re, val]) => {
      if (val) finalPrompt = finalPrompt.replace(re, val);
    });

    return finalPrompt
      .replace(/<British values>/g, "")
      .replace(/<Functional skills>/g, "")
      .replace(/<KSB'?s?>/gi, "");
  }

  /* insert / refresh prompt */
  if (nextId === "q38") {
    const ta = document.getElementById("final-prompt-textarea");
    if (ta) ta.value = buildFinalPrompt();
  }
  buildFinalPrompt();
}

function toggleAllQuestionsVisibility() {
  // Get all question blocks
  const questionBlocks = document.querySelectorAll('.question-block');
  
  // If no questions found, exit
  if (!questionBlocks.length) return;
  
  if (window.showAllQuestions) {
    // Show all questions
    questionBlocks.forEach(block => {
      block.style.display = 'block';
      
      // Modify the navigation buttons to not hide current question when in show-all mode
      const navButtons = block.querySelectorAll('.nav-btn');
      navButtons.forEach(btn => {
        const originalOnclick = btn.getAttribute('onclick');
        if (originalOnclick) {
          btn.setAttribute('data-original-onclick', originalOnclick);
          btn.removeAttribute('onclick');
          btn.addEventListener('click', (e) => {
            const params = originalOnclick.match(/goToQuestionAsync\('([^']+)', '([^']+)', ([^)]+)\)/);
            if (params && params.length >= 4) {
              const [_, currentId, targetId, isBack] = params;
              // Don't hide current question, just show target
              const targetBlock = document.getElementById(targetId);
              if (targetBlock) {
                targetBlock.style.display = 'block';
                // Scroll to the target question
                targetBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }
          });
        }
      });
      
      // If admin mode is on, make all questions editable
      if (window.isAdmin) {
        decorateQuestionForAdmin(block);
      }
    });
    
    // Add a "Back to Top" button
    if (!document.getElementById('back-to-top-btn')) {
      const backToTopBtn = document.createElement('button');
      backToTopBtn.id = 'back-to-top-btn';
      backToTopBtn.innerHTML = '↑ Back to Top';
      backToTopBtn.style.position = 'fixed';
      backToTopBtn.style.bottom = '20px';
      backToTopBtn.style.right = '20px';
      backToTopBtn.style.zIndex = '1000';
      backToTopBtn.style.background = '#005DE8';
      backToTopBtn.style.color = '#fff';
      backToTopBtn.style.padding = '10px 15px';
      backToTopBtn.style.border = 'none';
      backToTopBtn.style.borderRadius = '5px';
      backToTopBtn.style.cursor = 'pointer';
      
      backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      
      document.body.appendChild(backToTopBtn);
    }
    
    // Add question numbers and anchors for easier navigation
    questionBlocks.forEach((block, index) => {
      const questionId = block.id;
      
      // Add question number if not already present
      if (!block.querySelector('.question-number')) {
        const titleDiv = block.querySelector('.question-title');
        if (titleDiv) {
          const questionNumber = document.createElement('div');
          questionNumber.className = 'question-number';
          questionNumber.textContent = `Question ${index + 1} (ID: ${questionId})`;
          questionNumber.style.fontWeight = 'bold';
          questionNumber.style.color = '#005DE8';
          questionNumber.style.marginBottom = '5px';
          block.insertBefore(questionNumber, titleDiv);
        }
      }
      
      // Add separator between questions for better readability
      block.style.borderBottom = '2px solid #ddd';
      block.style.paddingBottom = '20px';
      block.style.marginBottom = '20px';
    });
  } else {
    // Hide all questions except the first one
    questionBlocks.forEach((block, index) => {
      block.style.display = index === 0 ? 'block' : 'none';
      
      // Restore original onclick handlers
      const navButtons = block.querySelectorAll('.nav-btn');
      navButtons.forEach(btn => {
        const originalOnclick = btn.getAttribute('data-original-onclick');
        if (originalOnclick) {
          btn.setAttribute('onclick', originalOnclick);
          btn.removeAttribute('data-original-onclick');
          
          // Remove event listeners
          const newBtn = btn.cloneNode(true);
          btn.parentNode.replaceChild(newBtn, btn);
        }
      });
      
      // Remove question numbers
      const questionNumber = block.querySelector('.question-number');
      if (questionNumber) {
        questionNumber.remove();
      }
      
      // Remove separators
      block.style.borderBottom = '';
      block.style.paddingBottom = '';
      block.style.marginBottom = '';
    });
    
    // Remove Back to Top button
    const backToTopBtn = document.getElementById('back-to-top-btn');
    if (backToTopBtn) {
      backToTopBtn.remove();
    }
  }
  
  // Apply admin edit mode to all visible questions if admin mode is on
  if (window.isAdmin && window.editMode) {
    applyAdminEditMode();
  }
}

function decorateQuestionForAdmin(block) {
  // Skip if already decorated
  if (block.hasAttribute("data-adminified")) return;
  
  // Make title editable
  const titleDiv = block.querySelector(".question-title");
  if (titleDiv) {
    titleDiv.contentEditable = "false";
    titleDiv.style.outline = "1px dashed #005DE8";
  }
  
  // Get the question ID
  const questionId = block.id;
  
  // Find the question from cache
  const original = window.questionsCache.find(q => q.id === questionId) || {};
  const logicByOpt = {};
  (original.conditionalLogic || []).forEach(r => {
    logicByOpt[(r.option || "").trim()] = r.goToQuestion || "";
  });
  
  // Make options editable and add logic inputs
  block.querySelectorAll(".answer-box").forEach(box => {
    const span = box.querySelector("span");
    if (span) {
      span.contentEditable = "false";
      span.style.outline = "1px dashed #005DE8";
      
      // Add input for conditional logic if not already present
      if (!box.querySelector(".admin-logic-input")) {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "admin-logic-input";
        input.style.marginLeft = "auto";
        input.style.width = "120px";
        input.style.display = window.editMode ? "" : "none";
        input.value = logicByOpt[span.innerText.trim()] || "";
        box.style.display = "flex";
        box.appendChild(input);
      }
    }
  });
  
  // Add save button if not already present
  if (!block.querySelector(".admin-save-btn")) {
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "Save";
    saveBtn.className = "admin-save-btn subject-btn";
    saveBtn.style.marginTop = "10px";
    saveBtn.style.display = window.editMode ? "" : "none";

    saveBtn.addEventListener("click", async () => {
      const updated = structuredClone(original);

      /* pull latest edits */
      if (titleDiv) updated.title = titleDiv.innerText.trim();
      const spans = block.querySelectorAll(".answer-box span");
      updated.options = Array.from(spans).map((s) => s.innerText.trim());

      updated.conditionalLogic = Array.from(
        block.querySelectorAll(".answer-box")
      )
        .map((box) => {
          const txt  = box.querySelector("span").innerText.trim();
          const dest = box.querySelector(".admin-logic-input").value.trim();
          return dest ? { option: txt, goToQuestion: dest } : null;
        })
        .filter(Boolean);

      /* ★ again, include qualification/subject */
      if (currentQualification && currentActiveSubject) {
        updated._meta = {
          qualification: currentQualification,
          subject: currentActiveSubject,
        };
      }

      /* PUT -> server */
      try {
        const resp = await fetch(`/api/questions/${questionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });

        if (!resp.ok) {
          const msg = await resp.text();
          return alert(`Save failed for question ${questionId}: ${msg}`);
        }

        alert(`Question ${questionId} saved!`);

        /* refresh local cache */
        const idx = window.questionsCache.findIndex((q) => q.id === questionId);
        if (idx !== -1) window.questionsCache[idx] = updated;
        conditionalLogicMap[questionId] = updated.conditionalLogic.map((r) => ({
          option: escapeName(r.option),
          targetId: r.goToQuestion,
        }));
      } catch (err) {
        alert(`Save failed for question ${questionId}: ${err.message}`);
      }
    });

    block.appendChild(saveBtn);
  }

  block.setAttribute("data-adminified", "1");
}

document.addEventListener("DOMContentLoaded", () => {
  const qualSelect       = document.getElementById("qualificationSelect");
  const subjectContainer = document.getElementById("subject-container");
  const formContainer    = document.getElementById("form-container");

  if (typeof window.questionIndexMap    !== "undefined") questionIndexMap    = window.questionIndexMap;
  if (typeof window.conditionalLogicMap !== "undefined") conditionalLogicMap = window.conditionalLogicMap;

  /* ---------- ADMIN BOOTSTRAP ------------- */
  window.isAdmin          = false;
window.editMode         = false;
window.adminEmail       = "";
window.questionsCache   = [];
window.showAllQuestions = false;

(async () => {
  /* 1️⃣  discover the signed-in email from Azure Static Web Apps (.auth/me) */
  let userEmail = "";
  try {
    const meResp = await fetch("/.auth/me", { credentials: "include" });
    if (meResp.ok) {
      const meJson = await meResp.json();
      if (Array.isArray(meJson) && meJson.length && meJson[0].userDetails) {
        userEmail = meJson[0].userDetails.toLowerCase();
      }
    }
  } catch {/* no auth provider or not signed in */}

  window.adminEmail = userEmail;

  /* 2️⃣  ask the server if this user is an admin */
  try {
    const isAdminResp = await fetch("/api/isAdmin", {
      headers: userEmail ? { "X-User-Email": userEmail } : {}
    });
    const { isAdmin } = await isAdminResp.json();
    window.isAdmin = !!isAdmin;

    /* 3️⃣  if admin, load questions & render the toggle buttons (unchanged) */
    if (window.isAdmin) {
      window.questionsCache = await (await fetch("/api/questions", {
        headers: userEmail ? { "X-User-Email": userEmail } : {}
      })).json();

      document.body.insertAdjacentHTML("beforeend", `
        <div style="position:fixed;top:8px;right:12px;display:flex;gap:8px;z-index:9999;">
          <button id="admin-toggle-btn"
                  style="background:#005DE8;color:#fff;
                         padding:6px 14px;border:none;border-radius:6px;
                         font-size:12px;cursor:pointer">
            ADMIN&nbsp;MODE:&nbsp;OFF
          </button>
          <button id="show-all-questions-btn"
                  style="background:#005DE8;color:#fff;
                         padding:6px 14px;border:none;border-radius:6px;
                         font-size:12px;cursor:pointer">
            SHOW&nbsp;ALL:&nbsp;OFF
          </button>
        </div>`);

      /* …the remainder of the original bootstrap code stays exactly as it was … */
      const toggleBtn  = document.getElementById("admin-toggle-btn");
      const showAllBtn = document.getElementById("show-all-questions-btn");

      toggleBtn.addEventListener("click", () => {
        window.editMode = !window.editMode;
        toggleBtn.textContent = "ADMIN MODE: " + (window.editMode ? "ON" : "OFF");
        document.querySelectorAll(".admin-save-btn, .admin-logic-input")
          .forEach(el => el.style.display = window.editMode ? "" : "none");
        document.querySelectorAll("[data-adminified] [contenteditable]")
          .forEach(el => {
            el.setAttribute("contenteditable", window.editMode ? "true" : "false");
            el.style.pointerEvents = window.editMode ? "auto" : "none";
            el.style.background    = window.editMode ? "#fffbe6" : "transparent";
          });
      });

      showAllBtn.addEventListener("click", () => {
        window.showAllQuestions = !window.showAllQuestions;
        showAllBtn.textContent = "SHOW ALL: " + (window.showAllQuestions ? "ON" : "OFF");
        toggleAllQuestionsVisibility();
      });
    }
  } catch (err) {
    console.error("[admin bootstrap] failed:", err);
  }
})();

  /* ---------- qualification list (unchanged) -------------------- */
  fetch("/api/qualifications")
  .then(res => res.json())
  .then(arr => {
    console.log("[script.js] qualifications received from server:", arr);
    arr.forEach(q => {
      const o = document.createElement("option");
      o.value = q.qualification;
      o.textContent = q.title;
      qualSelect.appendChild(o);
    });
  })
  .catch(err => console.error("Failed to load qualifications:", err));

  qualSelect.addEventListener("change", () => {
    currentQualification = qualSelect.value;
    formContainer.innerHTML = "";
    currentActiveSubject = null;
    if (!currentQualification) return;

    fetch(`/api/subjects?qualification=${encodeURIComponent(currentQualification)}`)
      .then(r => r.json())
      .then(renderSubjectButtons);
  });

  function renderSubjectButtons(subjects) {
    subjectContainer.innerHTML = "";
    subjects.forEach(sub => {
      const b = document.createElement("button");
      b.className = "subject-btn";
      b.textContent = sub;
      if (sub === currentActiveSubject) b.classList.add("active");
      b.onclick = () => {
        currentActiveSubject = sub;
        showFormSnippet(currentQualification, sub);
        renderSubjectButtons(subjects);
      };
      subjectContainer.appendChild(b);
    });
  }
});