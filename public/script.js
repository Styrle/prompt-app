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
  
  // Reset visited questions when starting a new form with a new subject
  const isNewSubjectSelection = currentActiveSubject !== subject;
  if (isNewSubjectSelection) {
    visitedQuestions = [];
    // Reset stored values for a new selection
    selectedQ3PromptText = "";
    selectedQ6PromptText = "";
    selectedQ7PromptText = "";
    selectedQ10PromptText = "";
    selectedQ11PromptText = "";
    writtenTestMarks = "";
    userQuestionText = "";
    userAnswerText = "";
    allOrPartText = "";
    partText = "";
    originalText = "";
  }
  
  // Show loading indicator
  formContainer.innerHTML = `
    <div class="centered-form-wrapper fade-in">
      <div class="styled-form-container">
        <h2>Loading ${qualification} ${subject}...</h2>
      </div>
    </div>
  `;

  // Build the URL with qualification and subject parameters
  let url = `/api/formSnippet?qualification=${encodeURIComponent(qualification)}&subject=${encodeURIComponent(subject)}`;

  return fetch(url)
    .then(r => {
      if (!r.ok) {
        return r.text().then(errorText => {
          throw new Error(`Failed to load form: ${errorText}`);
        });
      }
      return r.text();
    })
    .then(snippetHtml => {
      // Insert the snippet into the DOM
      formContainer.innerHTML = `
        <div class="centered-form-wrapper fade-in">
          ${snippetHtml}
        </div>
      `;

      // 1) Grab the .styled-form-container you just inserted
      const containerDiv = formContainer.querySelector(".styled-form-container");
      if (containerDiv) {
        try {
          conditionalLogicMap = JSON.parse(containerDiv.getAttribute("data-logicmap") || "{}");
          questionIndexMap = JSON.parse(containerDiv.getAttribute("data-questionindexmap") || "{}");
          window.totalQuestions = parseInt(containerDiv.getAttribute("data-totalquestions") || "0", 10);
          
          // Parse all prompt arrays with the same robust approach
          const parsePromptArray = (attrName) => {
            const attr = containerDiv.getAttribute(attrName);
            if (!attr) return [];
            
            try {
              return JSON.parse(attr);
            } catch (e) {
              try {
                const decoded = attr.replace(/&quot;/g, '"');
                return JSON.parse(decoded);
              } catch (e2) {
                console.error(`[showFormSnippet] Failed to parse ${attrName} even after decoding:`, e2);
                return [];
              }
            }
          };
          
          // Load all prompt arrays
          window.q3Prompts = parsePromptArray("data-q3prompts");
          window.q6Prompts = parsePromptArray("data-q6prompts");
          window.q7Prompts = parsePromptArray("data-q7prompts");
          window.q10Prompts = parsePromptArray("data-q10prompts");
          window.q11Prompts = parsePromptArray("data-q11prompts");
          
          console.log("[showFormSnippet] Loaded prompt data:", {
            q3: window.q3Prompts.length,
            q6: window.q6Prompts.length,
            q7: window.q7Prompts?.length || 0,
            q10: window.q10Prompts?.length || 0,
            q11: window.q11Prompts?.length || 0
          });
        } catch (err) {
          console.error("[showFormSnippet] Failed to parse snippet data attributes:", err);
        }
      }

      // Smooth-scroll the form into view
      formContainer.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    })
    .catch(err => {
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
        updated.options = Array.from(spans).map(s => s.innerText.trim());
      
        updated.conditionalLogic = Array.from(nextBlock.querySelectorAll(".answer-box"))
          .map(box => {
            const txt  = box.querySelector("span").innerText.trim();
            const dest = box.querySelector(".admin-logic-input").value.trim();
            return dest ? { option: txt, goToQuestion: dest } : null;
          })
          .filter(Boolean);
      
        /* PUT -> server */
        try {
          const resp = await fetch(`/api/questions/${nextId}`, {
            method : "PUT",
            headers: { "Content-Type":"application/json" },
            body   : JSON.stringify(updated)
          });
      
          if (!resp.ok) {
            const msg = await resp.text();
            return alert("Save failed: " + msg);
          }
      
          alert("Saved!");
      
          /* keep local copies fresh */
          const idx = window.questionsCache.findIndex(q => q.id === nextId);
          if (idx !== -1) window.questionsCache[idx] = updated;
          conditionalLogicMap[nextId] = updated.conditionalLogic
            .map(r => ({ option: escapeName(r.option), targetId: r.goToQuestion }));
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

  (async () => {
    /* auto‑detect – no prompt */
    try {
      const { isAdmin } = await (await fetch("/api/isAdmin")).json();
      window.isAdmin = !!isAdmin;

      if (window.isAdmin) {
        window.questionsCache = await (await fetch("/api/questions")).json();

        document.body.insertAdjacentHTML("beforeend", `
          <button id="admin-toggle-btn"
                  style="position:fixed;top:8px;right:12px;background:#005DE8;color:#fff;
                         padding:6px 14px;border:none;border-radius:6px;z-index:9999;
                         font-size:12px;cursor:pointer">
            ADMIN&nbsp;MODE:&nbsp;OFF
          </button>`);
        
        const toggleBtn = document.getElementById("admin-toggle-btn");
        toggleBtn.addEventListener("click", () => {
          window.editMode = !window.editMode;
          toggleBtn.textContent = "ADMIN MODE: " + (window.editMode ? "ON" : "OFF");
        
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
      }
    } catch {/* treat as non‑admin */}
  })();

  /* ---------- qualification list (unchanged) -------------------- */
  fetch("/api/qualifications")
    .then(res => res.json())
    .then(arr => {
      arr.forEach(q => {
        const o = document.createElement("option");
        o.value = q.qualification;
        o.textContent = q.title;
        qualSelect.appendChild(o);
      });
    });

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