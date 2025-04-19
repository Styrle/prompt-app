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

    // 2) Process prompt selection for q3
    if (currentId === "q3" && selectedValue) {
      let plainChoice = selectedValue.replace(/_/g, " ").toLowerCase();
      plainChoice = plainChoice.replace(/[()]/g, "").trim();
      console.log(`[goToQuestion] Q3 plainChoice='${plainChoice}'. Checking in window.q3Prompts:`, window.q3Prompts);

      const foundObj = (window.q3Prompts || []).find(obj => {
        let normalized = obj.answer.toLowerCase().replace(/[()]/g, "").trim();
        console.log("Comparing => user:", plainChoice, "<==> prompt.json:", normalized);
        return normalized === plainChoice;
      });

      if (foundObj) {
        console.log("[goToQuestion] Found matching q3 prompt:", foundObj.description);
        selectedQ3PromptText = foundObj.description;
      } else {
        console.warn("[goToQuestion] No match found for q3 => final prompt will be blank!");
        selectedQ3PromptText = "";
      }
    }
    
    // 3) Process prompt selection for q6
    if (currentId === "q6" && selectedValue) {
      let plainChoice = selectedValue.replace(/_/g, " ").toLowerCase();
      plainChoice = plainChoice.replace(/[()]/g, "").trim();
      
      console.log(`[goToQuestion] Q6 plainChoice='${plainChoice}'`);
      console.log("[goToQuestion] Available q6Prompts:", window.q6Prompts);
      
      if (!window.q6Prompts || !Array.isArray(window.q6Prompts) || window.q6Prompts.length === 0) {
        console.error("[goToQuestion] Q6 prompts data is not valid:", window.q6Prompts);
        selectedQ6PromptText = "";
      } else {
        // Log each available prompt answer for comparison
        console.log("[goToQuestion] Q6 available options:");
        window.q6Prompts.forEach((p, idx) => {
          if (p && p.answer) {
            let normalized = p.answer.toLowerCase().replace(/[()]/g, "").trim();
            console.log(`  [${idx}] Original: "${p.answer}" → Normalized: "${normalized}"`);
          } else {
            console.log(`  [${idx}] Invalid prompt:`, p);
          }
        });
        
        // Try to find a match with more detailed logging
        let found = false;
        for (let i = 0; i < window.q6Prompts.length; i++) {
          const obj = window.q6Prompts[i];
          if (!obj || !obj.answer) continue;
          
          let normalized = obj.answer.toLowerCase().replace(/[()]/g, "").trim();
          console.log(`[goToQuestion] Comparing Q6: "${plainChoice}" with "${normalized}" → ${plainChoice === normalized ? 'MATCH' : 'NO MATCH'}`);
          
          if (plainChoice === normalized) {
            console.log("[goToQuestion] Found matching q6 prompt at index", i, ":", obj.description.substring(0, 50) + "...");
            selectedQ6PromptText = obj.description;
            found = true;
            break;
          }
        }
        
        if (!found) {
          console.warn("[goToQuestion] No match found for q6 choice:", plainChoice);
          selectedQ6PromptText = "";
        }
      }
    }
    
    // 4) Process prompt selection for q7
    if (currentId === "q7" && selectedValue) {
      let plainChoice = selectedValue.replace(/_/g, " ").toLowerCase();
      plainChoice = plainChoice.replace(/[()]/g, "").trim();
      
      console.log(`[goToQuestion] Q7 plainChoice='${plainChoice}'`);
      console.log("[goToQuestion] Available q7Prompts:", window.q7Prompts);
      
      if (!window.q7Prompts || !Array.isArray(window.q7Prompts) || window.q7Prompts.length === 0) {
        console.error("[goToQuestion] Q7 prompts data is not valid:", window.q7Prompts);
        selectedQ7PromptText = "";
      } else {
        // Try to find a match
        let found = false;
        for (let i = 0; i < window.q7Prompts.length; i++) {
          const obj = window.q7Prompts[i];
          if (!obj || !obj.answer) continue;
          
          let normalized = obj.answer.toLowerCase().replace(/[()]/g, "").trim();
          console.log(`[goToQuestion] Comparing Q7: "${plainChoice}" with "${normalized}" → ${plainChoice === normalized ? 'MATCH' : 'NO MATCH'}`);
          
          if (plainChoice === normalized) {
            console.log("[goToQuestion] Found matching q7 prompt at index", i, ":", obj.description.substring(0, 50) + "...");
            selectedQ7PromptText = obj.description;
            found = true;
            break;
          }
        }
        
        if (!found) {
          console.warn("[goToQuestion] No match found for q7 choice:", plainChoice);
          selectedQ7PromptText = "";
        }
      }
    }
    
    // 5) Process prompt selection for q10
    if (currentId === "q10" && selectedValue) {
      let plainChoice = selectedValue.replace(/_/g, " ").toLowerCase();
      plainChoice = plainChoice.replace(/[()]/g, "").trim();
      
      console.log(`[goToQuestion] Q10 plainChoice='${plainChoice}'`);
      console.log("[goToQuestion] Available q10Prompts:", window.q10Prompts);
      
      if (!window.q10Prompts || !Array.isArray(window.q10Prompts) || window.q10Prompts.length === 0) {
        console.error("[goToQuestion] Q10 prompts data is not valid:", window.q10Prompts);
        selectedQ10PromptText = "";
      } else {
        // Try to find a match
        let found = false;
        for (let i = 0; i < window.q10Prompts.length; i++) {
          const obj = window.q10Prompts[i];
          if (!obj || !obj.answer) continue;
          
          let normalized = obj.answer.toLowerCase().replace(/[()]/g, "").trim();
          console.log(`[goToQuestion] Comparing Q10: "${plainChoice}" with "${normalized}" → ${plainChoice === normalized ? 'MATCH' : 'NO MATCH'}`);
          
          if (plainChoice === normalized) {
            console.log("[goToQuestion] Found matching q10 prompt at index", i, ":", obj.description.substring(0, 50) + "...");
            selectedQ10PromptText = obj.description;
            found = true;
            break;
          }
        }
        
        if (!found) {
          console.warn("[goToQuestion] No match found for q10 choice:", plainChoice);
          selectedQ10PromptText = "";
        }
      }
    }
    
    // 6) Process prompt selection for q11
    if (currentId === "q11" && selectedValue) {
      let plainChoice = selectedValue.replace(/_/g, " ").toLowerCase();
      plainChoice = plainChoice.replace(/[()]/g, "").trim();
      
      console.log(`[goToQuestion] Q11 plainChoice='${plainChoice}'`);
      console.log("[goToQuestion] Available q11Prompts:", window.q11Prompts);
      
      if (!window.q11Prompts || !Array.isArray(window.q11Prompts) || window.q11Prompts.length === 0) {
        console.error("[goToQuestion] Q11 prompts data is not valid:", window.q11Prompts);
        selectedQ11PromptText = "";
      } else {
        // Try to find a match
        let found = false;
        for (let i = 0; i < window.q11Prompts.length; i++) {
          const obj = window.q11Prompts[i];
          if (!obj || !obj.answer) continue;
          
          let normalized = obj.answer.toLowerCase().replace(/[()]/g, "").trim();
          console.log(`[goToQuestion] Comparing Q11: "${plainChoice}" with "${normalized}" → ${plainChoice === normalized ? 'MATCH' : 'NO MATCH'}`);
          
          if (plainChoice === normalized) {
            console.log("[goToQuestion] Found matching q11 prompt at index", i, ":", obj.description.substring(0, 50) + "...");
            selectedQ11PromptText = obj.description;
            found = true;
            break;
          }
        }
        
        if (!found) {
          console.warn("[goToQuestion] No match found for q11 choice:", plainChoice);
          selectedQ11PromptText = "";
        }
      }
    }

    // 7) If user just answered Q4 or Q8 => store the marks
    if (currentId === "q4" || currentId === "q8") {
      const inputEl = questionBlock.querySelector("textarea, input[type=text]");
      writtenTestMarks = inputEl ? inputEl.value.trim() : "";
      console.log(`[goToQuestion] User typed marks (from ${currentId}) =>`, writtenTestMarks);
    }

    // 8) If user just answered Q29 => store the "Question" text
    if (currentId === "q29") {
      const inputEl = questionBlock.querySelector("textarea, input[type=text]");
      userQuestionText = inputEl ? inputEl.value.trim() : "";
      console.log("[goToQuestion] User typed a 'Question' =>", userQuestionText);
    }

    // 9) If user just answered Q30 => store the "Answer" text
    if (currentId === "q30") {
      const inputEl = questionBlock.querySelector("textarea, input[type=text]");
      userAnswerText = inputEl ? inputEl.value.trim() : "";
      console.log("[goToQuestion] User typed an 'Answer' =>", userAnswerText);
    }
    
    // 10) If user just answered Q17 => store "all or part"
    if (currentId === "q17" && selectedValue) {
      allOrPartText = selectedValue;
      console.log("[goToQuestion] User selected 'all or part' =>", allOrPartText);
    }
    
    // 11) If user just answered Q18 => store "part" text
    if (currentId === "q18") {
      const inputEl = questionBlock.querySelector("textarea, input[type=text]");
      partText = inputEl ? inputEl.value.trim() : "";
      console.log("[goToQuestion] User typed 'part' =>", partText);
    }
    
    // 12) If user just answered Q37 => store "original text"
    if (currentId === "q37") {
      const inputEl = questionBlock.querySelector("textarea, input[type=text]");
      originalText = inputEl ? inputEl.value.trim() : "";
      console.log("[goToQuestion] User typed 'original text' =>", originalText);
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
  if (nextId === "q38") {
    console.log("[goToQuestion] Reached Q38 => building final prompt");
    const finalTextarea = document.getElementById("final-prompt-textarea");
    if (finalTextarea) {
      // Decide which prompt to use in order of priority
      let finalPrompt = selectedQ3PromptText || 
                        selectedQ6PromptText || 
                        selectedQ7PromptText || 
                        selectedQ10PromptText || 
                        selectedQ11PromptText || 
                        "";

      // Replace all placeholders
      if (writtenTestMarks) {
        finalPrompt = finalPrompt.replace(/<WTQ marks>/g, writtenTestMarks);
        finalPrompt = finalPrompt.replace(/<marks>/g, writtenTestMarks);
      }

      if (currentQualification) {
        finalPrompt = finalPrompt.replace(/<qualification>/g, currentQualification);
      }
      
      if (currentActiveSubject) {
        finalPrompt = finalPrompt.replace(/<topic>/g, currentActiveSubject);
      }
      
      if (paperName) {
        finalPrompt = finalPrompt.replace(/<paper>/g, paperName);
      }
      
      if (minutesPerMark) {
        finalPrompt = finalPrompt.replace(/<minutes per mark>/g, minutesPerMark);
      }
      
      if (allOrPartText) {
        finalPrompt = finalPrompt.replace(/<all or part>/g, allOrPartText);
      }
      
      if (partText) {
        finalPrompt = finalPrompt.replace(/<part>/g, partText);
      }
      
      if (originalText) {
        finalPrompt = finalPrompt.replace(/<original text>/g, originalText);
      }

      if (userQuestionText) {
        finalPrompt = finalPrompt.replace(/<Question>/g, userQuestionText);
      }
      
      if (userAnswerText) {
        finalPrompt = finalPrompt.replace(/<Answer>/g, userAnswerText);
      }

      // Handle special placeholders in templates
      if (finalPrompt.includes("<British values>")) {
        finalPrompt = finalPrompt.replace(/<British values>/g, "");
      }
      
      if (finalPrompt.includes("<Functional skills>")) {
        finalPrompt = finalPrompt.replace(/<Functional skills>/g, "");
      }
      
      if (finalPrompt.includes("<KSB")) {
        finalPrompt = finalPrompt.replace(/<KSB's>/g, "");
        finalPrompt = finalPrompt.replace(/<KSB>/g, "");
      }

      console.log("[goToQuestion] Final prompt being inserted:", finalPrompt);
      finalTextarea.value = finalPrompt;
    }
  }

  console.log(`[goToQuestion] Now showing '${nextId}'`);
}

document.addEventListener("DOMContentLoaded", () => {
  const qualSelect       = document.getElementById("qualificationSelect");
  const subjectContainer = document.getElementById("subject-container");
  const formContainer    = document.getElementById("form-container");

  if (typeof window.questionIndexMap    !== "undefined") questionIndexMap    = window.questionIndexMap;
  if (typeof window.conditionalLogicMap !== "undefined") conditionalLogicMap = window.conditionalLogicMap;

  /* ---------- ADMIN BOOTSTRAP ----------------------------------- */
  window.isAdmin        = false;
  window.editMode       = false;
  window.adminEmail     = "";          // no longer needed client‑side
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
  /* -------------------------------------------------------------- */

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