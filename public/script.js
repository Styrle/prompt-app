// script.js

let currentActiveSubject = null;
let currentQualification = null;

let questionIndexMap = {};
let conditionalLogicMap = {};
let visitedQuestions = [];

// Store user's final chosen prompt texts
let allOrPartText = "";
let partText = "";
let originalText = "";
let paperName = "";
let minutesPerMark = "";

// Store user’s final chosen Q3 prompt from prompt.json
let selectedQ3PromptText = "";
let selectedQ6PromptText = "";
let selectedQ7PromptText = "";
let selectedQ10PromptText = "";
let selectedQ11PromptText = "";

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
    selectedQ3PromptText     = "";
    selectedQ6PromptText     = "";
    selectedQ7PromptText     = "";
    selectedQ10PromptText    = "";
    selectedQ11PromptText    = "";
    writtenTestMarks         = "";
    userQuestionText         = "";
    userAnswerText           = "";
    allOrPartText            = "";
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
  console.log(`[goToQuestion] currentId=${currentId}, proposedNextId=${proposedNextId}, isBack=${isBack}`);
  console.log("[goToQuestion] conditionalLogicMap=", conditionalLogicMap);
  console.log("[goToQuestion] questionIndexMap=", questionIndexMap);

  const questionBlock = document.getElementById(currentId);
  if (!questionBlock) {
    console.warn(`[goToQuestion] No DOM block for currentId='${currentId}'`);
    return;
  }

  let nextId = proposedNextId;

  if (isBack) {
    if (visitedQuestions.length > 0) {
      nextId = visitedQuestions.pop();
      console.log(`[goToQuestion] BACK => popped from history => '${nextId}'`);
    }
  } else {
    visitedQuestions.push(currentId);
    console.log(`[goToQuestion] FORWARD => pushed '${currentId}' to visitedQuestions`);

    // 1) Determine which input was selected (if radio/checkbox or select)
    let selectedValue = null;
    const inputs = questionBlock.querySelectorAll("input[type=radio], input[type=checkbox], select");
    for (const input of inputs) {
      if ((input.type === "radio" || input.type === "checkbox") && input.checked) {
        selectedValue = input.value;
        break;
      }
      if (input.tagName.toLowerCase() === "select" && input.value) {
        selectedValue = input.value;
      }
    }
    console.log(`[goToQuestion] selectedValue='${selectedValue}' at question='${currentId}'`);

    if (
      selectedValue &&
      ["q3", "q6", "q7", "q10", "q11"].includes(currentId)
    ) {
      // Normalise the user’s choice
      const plainChoice = selectedValue
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/[()]/g, "")
        .trim();
    
      const promptsKey  = `${currentId}Prompts`;
      const promptsList = window[promptsKey];
    
      console.log(
        `[goToQuestion] ${currentId.toUpperCase()} plainChoice='${plainChoice}'`
      );
      console.log(`[goToQuestion] Available ${promptsKey}:`, promptsList);
    
      let matchedDescription = "";
    
      if (Array.isArray(promptsList) && promptsList.length) {
        // Find the first prompt whose answer matches the choice
        const found = promptsList.find(
          (p) =>
            p?.answer
              ?.toLowerCase()
              .replace(/[()]/g, "")
              .trim() === plainChoice
        );
    
        if (found) {
          console.log(
            `[goToQuestion] Found matching ${currentId} prompt:`,
            found.description
          );
          matchedDescription = found.description;
        } else {
          console.warn(
            `[goToQuestion] No match found for ${currentId} choice:`,
            plainChoice
          );
        }
      } else {
        console.error(
          `[goToQuestion] ${currentId.toUpperCase()} prompts data is not valid:`,
          promptsList
        );
      }
    
      /* Map the result to the correct “selected…” variable */
      switch (currentId) {
        case "q3":
          selectedQ3PromptText = matchedDescription;
          break;
        case "q6":
          selectedQ6PromptText = matchedDescription;
          break;
        case "q7":
          selectedQ7PromptText = matchedDescription;
          break;
        case "q10":
          selectedQ10PromptText = matchedDescription;
          break;
        case "q11":
          selectedQ11PromptText = matchedDescription;
          break;
      }
    }

    switch (currentId) {
      case "q4":
      case "q8":
          {
              const inputEl = questionBlock.querySelector("textarea, input[type=text]");
              writtenTestMarks = inputEl ? inputEl.value.trim() : "";
              console.log(`[goToQuestion] User typed marks (from ${currentId}) =>`, writtenTestMarks);
              break;
          }
      case "q29":
          {
              const inputEl = questionBlock.querySelector("textarea, input[type=text]");
              userQuestionText = inputEl ? inputEl.value.trim() : "";
              console.log("[goToQuestion] User typed a 'Question' =>", userQuestionText);
              break;
          }
      case "q30":
          {
              const inputEl = questionBlock.querySelector("textarea, input[type=text]");
              userAnswerText = inputEl ? inputEl.value.trim() : "";
              console.log("[goToQuestion] User typed an 'Answer' =>", userAnswerText);
              break;
          }
      case "q17":
          {
              if (selectedValue) {
                  allOrPartText = selectedValue;
                  console.log("[goToQuestion] User selected 'all or part' =>", allOrPartText);
              }
              break;
          }
      case "q18":
          {
              const inputEl = questionBlock.querySelector("textarea, input[type=text]");
              partText = inputEl ? inputEl.value.trim() : "";
              console.log("[goToQuestion] User typed 'part' =>", partText);
              break;
          }
      case "q37":
          {
              const inputEl = questionBlock.querySelector("textarea, input[type=text]");
              originalText = inputEl ? inputEl.value.trim() : "";
              console.log("[goToQuestion] User typed 'original text' =>", originalText);
              break;
          }
    }

    // 13) Evaluate conditional logic to find nextId
    const rules = conditionalLogicMap[currentId];
    console.log("[goToQuestion] Checking logicMap for currentId:", rules);
    if (rules && selectedValue) {
      const foundRule = rules.find(r => r.option === selectedValue);
      if (foundRule && foundRule.targetId) {
        console.log(`[goToQuestion] Overriding nextId => '${foundRule.targetId}' via logic`);
        nextId = foundRule.targetId;
      }
    }
  }

  // Hide current question
  questionBlock.style.display = "none";

  // Show next question
  const nextBlock = document.getElementById(nextId);
  if (!nextBlock) {
    console.warn(`[goToQuestion] nextBlock not found for '${nextId}'`);
    return;
  }
  nextBlock.style.display = "block";

  if (window.isAdmin) {
    /* decorate the question once */
    if (!nextBlock.hasAttribute("data-adminified")) {
  
      /* make title editable */
      const titleDiv = nextBlock.querySelector(".question-title");
      if (titleDiv) {
        titleDiv.contentEditable = "false";
        titleDiv.style.outline   = "1px dashed #005DE8";
      }
  
      /* map of option‑text → goToQuestion from the original JSON */
      const original   = window.questionsCache.find(q => q.id === nextId) || {};
      const logicByOpt = {};
      (original.conditionalLogic || []).forEach(r => {
        logicByOpt[(r.option || "").trim()] = r.goToQuestion || "";
      });
  
      /* every option row: make the label editable + mini “go to” box */
      nextBlock.querySelectorAll(".answer-box").forEach(box => {
        const span          = box.querySelector("span");
        span.contentEditable = "false";
        span.style.outline   = "1px dashed #005DE8";
  
        const input = document.createElement("input");
        input.type  = "text";
        input.className = "admin-logic-input";
        input.style.marginLeft = "auto";
        input.style.width = "120px";
        /* show it right away if we're already editing */
        input.style.display = window.editMode ? "" : "none";
        input.value  = logicByOpt[span.innerText.trim()] || "";
        box.style.display = "flex";
        box.appendChild(input);
      });
  
      /* -------- SAVE ---------- */
      const saveBtn = document.createElement("button");
      saveBtn.type        = "button";
      saveBtn.textContent = "Save";
      saveBtn.className   = "admin-save-btn subject-btn";
      saveBtn.style.marginTop = "10px";
      saveBtn.style.display   = "none";

      saveBtn.addEventListener("click", async () => {
        const updated = structuredClone(original);

        /* pull latest edits */
        if (titleDiv) updated.title = titleDiv.innerText.trim();
        const spans = nextBlock.querySelectorAll(".answer-box span");
        updated.options = Array.from(spans).map((s) => s.innerText.trim());

        updated.conditionalLogic = Array.from(
          nextBlock.querySelectorAll(".answer-box")
        )
          .map((box) => {
            const txt  = box.querySelector("span").innerText.trim();
            const dest = box.querySelector(".admin-logic-input").value.trim();
            return dest ? { option: txt, goToQuestion: dest } : null;
          })
          .filter(Boolean);

        /* ★ attach qualification & subject so the API updates
             the correct JSON file when this is NOT a base‑form Q */
        if (currentQualification && currentActiveSubject) {
          updated._meta = {
            qualification: currentQualification,
            subject: currentActiveSubject,
          };
        }

        /* PUT -> server */
        try {
          const resp = await fetch(`/api/questions/${nextId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated),
          });

          if (!resp.ok) {
            const msg = await resp.text();
            return alert("Save failed: " + msg);
          }

          alert("Saved!");

          /* keep local copies fresh */
          const idx = window.questionsCache.findIndex((q) => q.id === nextId);
          if (idx !== -1) window.questionsCache[idx] = updated;
          conditionalLogicMap[nextId] = updated.conditionalLogic.map((r) => ({
            option: escapeName(r.option),
            targetId: r.goToQuestion,
          }));
        } catch (err) {
          alert("Save failed: " + err.message);
        }
      });

      nextBlock.appendChild(saveBtn);
      nextBlock.setAttribute("data-adminified", "1");
    }
  
    /* toggle fields according to edit‑mode */
    const show = window.editMode;
    nextBlock.querySelectorAll("[contenteditable]").forEach(el => {
      el.setAttribute("contenteditable", show ? "true" : "false");
      el.style.pointerEvents = show ? "auto" : "none";
      el.style.background    = show ? "#fffbe6" : "transparent";
    });
    nextBlock.querySelectorAll(".admin-save-btn, .admin-logic-input")
      .forEach(el => el.style.display = show ? "" : "none");
  }

    // 14) If Q38 => fill final prompt
    function buildFinalPrompt() {
      // Decide which prompt to use in order of priority
      let finalPrompt = selectedQ3PromptText || 
                        selectedQ6PromptText || 
                        selectedQ7PromptText || 
                        selectedQ10PromptText || 
                        selectedQ11PromptText || 
                        "";

      // Define all simple placeholder replacements
      const replacements = [
          { regex: /<WTQ marks>/g, value: writtenTestMarks },
          { regex: /<marks>/g, value: writtenTestMarks },
          { regex: /<qualification>/g, value: currentQualification },
          { regex: /<topic>/g, value: currentActiveSubject },
          { regex: /<paper>/g, value: paperName },
          { regex: /<minutes per mark>/g, value: minutesPerMark },
          { regex: /<all or part>/g, value: allOrPartText },
          { regex: /<part>/g, value: partText },
          { regex: /<original text>/g, value: originalText },
          { regex: /<Question>/g, value: userQuestionText },
          { regex: /<Answer>/g, value: userAnswerText }
      ];

      // Process the replacements if a value exists
      replacements.forEach(rep => {
          if (rep.value) {
              finalPrompt = finalPrompt.replace(rep.regex, rep.value);
          }
      });

      // Handle special placeholders
      finalPrompt = finalPrompt.replace(/<British values>/g, "");
      finalPrompt = finalPrompt.replace(/<Functional skills>/g, "");
      if (finalPrompt.includes("<KSB")) {
          finalPrompt = finalPrompt.replace(/<KSB's>/g, "");
          finalPrompt = finalPrompt.replace(/<KSB>/g, "");
      }

      return finalPrompt;
  }

  if (nextId === "q38") {
      console.log("[goToQuestion] Reached Q38 => building final prompt");
      const finalTextarea = document.getElementById("final-prompt-textarea");
      if (finalTextarea) {
          const finalPrompt = buildFinalPrompt();
          console.log("[goToQuestion] Final prompt being inserted:", finalPrompt);
          finalTextarea.value = finalPrompt;
      }
  }

  buildFinalPrompt();

  console.log(`[goToQuestion] Now showing '${nextId}'`);
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
  window.isAdmin        = false;
  window.editMode       = false;
  window.adminEmail     = "";          
  window.questionsCache = [];
  window.showAllQuestions = false; // Added flag to track if all questions should be shown

  (async () => {
    /* auto‑detect – no prompt */
    try {
      const { isAdmin } = await (await fetch("/api/isAdmin")).json();
      window.isAdmin = !!isAdmin;

      if (window.isAdmin) {
        window.questionsCache = await (await fetch("/api/questions")).json();

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
        
        const toggleBtn = document.getElementById("admin-toggle-btn");
        toggleBtn.addEventListener("click", () => {
          window.editMode = !window.editMode;
          toggleBtn.textContent = "ADMIN MODE: " + (window.editMode ? "ON" : "OFF");
        
          /* show / hide admin widgets */
          document.querySelectorAll(".admin-save-btn, .admin-logic-input")
            .forEach(el => el.style.display = window.editMode ? "" : "none");
        
          /* enable / disable contentEditable fields */
          document.querySelectorAll("[data-adminified] [contenteditable]")
            .forEach(el => {
              el.setAttribute("contenteditable", window.editMode ? "true" : "false");
              el.style.pointerEvents = window.editMode ? "auto" : "none";
              el.style.background    = window.editMode ? "#fffbe6" : "transparent";
            });
        });
        
        // Add event listener for the Show All Questions button
        const showAllBtn = document.getElementById("show-all-questions-btn");
        showAllBtn.addEventListener("click", () => {
          window.showAllQuestions = !window.showAllQuestions;
          showAllBtn.textContent = "SHOW ALL: " + (window.showAllQuestions ? "ON" : "OFF");
          
          // Toggle visibility of all question blocks
          toggleAllQuestionsVisibility();
        });
      }
    } catch {/* treat as non‑admin */}
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