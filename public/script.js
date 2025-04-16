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
          
          // Load q3 prompts
          const q3Attr = containerDiv.getAttribute("data-q3prompts");
          if (q3Attr) {
            try {
              // First try direct JSON parsing
              window.q3Prompts = JSON.parse(q3Attr);
            } catch (e) {
              // If that fails, try decoding HTML entities first
              try {
                const decoded = q3Attr.replace(/&quot;/g, '"');
                window.q3Prompts = JSON.parse(decoded);
              } catch (e2) {
                console.error("[showFormSnippet] Failed to parse q3Prompts even after decoding:", e2);
                window.q3Prompts = [];
              }
            }
          } else {
            window.q3Prompts = [];
          }
          console.log("[showFormSnippet] q3Prompts =", window.q3Prompts);
          
          // Load q6 prompts - same robust approach
          const q6Attr = containerDiv.getAttribute("data-q6prompts");
          if (q6Attr) {
            try {
              // First try direct JSON parsing
              window.q6Prompts = JSON.parse(q6Attr);
            } catch (e) {
              // If that fails, try decoding HTML entities first
              try {
                const decoded = q6Attr.replace(/&quot;/g, '"');
                window.q6Prompts = JSON.parse(decoded);
              } catch (e2) {
                console.error("[showFormSnippet] Failed to parse q6Prompts even after decoding:", e2);
                // IMPORTANT: For debugging, add a fallback with the expected structure
                window.q6Prompts = [
                  {
                    answer: "Produce generic video script",
                    description: "Example the 'original text' below: <part> Please also identify the appropriate on-screen narrative to support the script. Your script must have the following characteristics: *Be engaging *Be targeted at a learner studying <qualification> <paper> *Be professional in tone *Be in 'British English'..."
                  },
                  // Add other options as needed
                ];
              }
            }
          } else {
            window.q6Prompts = [];
          }
          console.log("[showFormSnippet] q6Prompts =", window.q6Prompts);
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

    // 2) If user just answered Q3 => pick the matching prompt text
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
    
    // 3) If user just answered Q6 => pick the matching prompt text - EXACT SAME PATTERN
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

    // 4) If user just answered Q4 or Q8 => store the marks
    if (currentId === "q4" || currentId === "q8") {
      const inputEl = questionBlock.querySelector("textarea, input[type=text]");
      writtenTestMarks = inputEl ? inputEl.value.trim() : "";
      console.log(`[goToQuestion] User typed marks (from ${currentId}) =>`, writtenTestMarks);
    }

    // 5) If user just answered Q29 => store the "Question" text
    if (currentId === "q29") {
      const inputEl = questionBlock.querySelector("textarea, input[type=text]");
      userQuestionText = inputEl ? inputEl.value.trim() : "";
      console.log("[goToQuestion] User typed a 'Question' =>", userQuestionText);
    }

    // 6) If user just answered Q30 => store the "Answer" text
    if (currentId === "q30") {
      const inputEl = questionBlock.querySelector("textarea, input[type=text]");
      userAnswerText = inputEl ? inputEl.value.trim() : "";
      console.log("[goToQuestion] User typed an 'Answer' =>", userAnswerText);
    }
    
    // 7) If user just answered Q17 => store "all or part"
    if (currentId === "q17" && selectedValue) {
      allOrPartText = selectedValue;
      console.log("[goToQuestion] User selected 'all or part' =>", allOrPartText);
    }
    
    // 8) If user just answered Q18 => store "part" text
    if (currentId === "q18") {
      const inputEl = questionBlock.querySelector("textarea, input[type=text]");
      partText = inputEl ? inputEl.value.trim() : "";
      console.log("[goToQuestion] User typed 'part' =>", partText);
    }
    
    // 9) If user just answered Q37 => store "original text"
    if (currentId === "q37") {
      const inputEl = questionBlock.querySelector("textarea, input[type=text]");
      originalText = inputEl ? inputEl.value.trim() : "";
      console.log("[goToQuestion] User typed 'original text' =>", originalText);
    }

    // 10) Evaluate conditional logic to find nextId
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

  // 11) If Q38 => fill final prompt
  if (nextId === "q38") {
    console.log("[goToQuestion] Reached Q38 => building final prompt");
    const finalTextarea = document.getElementById("final-prompt-textarea");
    if (finalTextarea) {
      // Decide which prompt to use - either q3 or q6 based on what was selected
      let finalPrompt = "";
      if (selectedQ3PromptText) {
        finalPrompt = selectedQ3PromptText;
      } else if (selectedQ6PromptText) {
        finalPrompt = selectedQ6PromptText;
      }

      // Insert the # of marks if q4 or q8 was answered
      if (writtenTestMarks) {
        finalPrompt = finalPrompt.replace(/<WTQ marks>/g, writtenTestMarks);
        finalPrompt = finalPrompt.replace(/<marks>/g, writtenTestMarks);
      }

      // Replace <qualification> and <topic> if desired
      if (currentQualification) {
        finalPrompt = finalPrompt.replace(/<qualification>/g, currentQualification);
      }
      if (currentActiveSubject) {
        finalPrompt = finalPrompt.replace(/<topic>/g, currentActiveSubject);
      }
      
      // Replace <paper> placeholder if we have that info
      if (paperName) {
        finalPrompt = finalPrompt.replace(/<paper>/g, paperName);
      }
      
      // Replace <minutes per mark> placeholder if we have that info
      if (minutesPerMark) {
        finalPrompt = finalPrompt.replace(/<minutes per mark>/g, minutesPerMark);
      }
      
      // Replace <all or part> if we have that info
      if (allOrPartText) {
        finalPrompt = finalPrompt.replace(/<all or part>/g, allOrPartText);
      }
      
      // Replace <part> if we have that info
      if (partText) {
        finalPrompt = finalPrompt.replace(/<part>/g, partText);
      }
      
      // Replace <original text> if we have that info
      if (originalText) {
        finalPrompt = finalPrompt.replace(/<original text>/g, originalText);
      }

      // Replace <Question> and <Answer> from q29 & q30
      if (userQuestionText) {
        finalPrompt = finalPrompt.replace(/<Question>/g, userQuestionText);
      }
      if (userAnswerText) {
        finalPrompt = finalPrompt.replace(/<Answer>/g, userAnswerText);
      }

      console.log("[goToQuestion] Final prompt being inserted:", finalPrompt);
      finalTextarea.value = finalPrompt;
    }
  }

  console.log(`[goToQuestion] Now showing '${nextId}'`);
}

document.addEventListener("DOMContentLoaded", () => {
  const qualSelect = document.getElementById("qualificationSelect");
  const subjectContainer = document.getElementById("subject-container");
  const formContainer = document.getElementById("form-container");

  if (typeof window.questionIndexMap !== "undefined") {
    questionIndexMap = window.questionIndexMap;
  }
  if (typeof window.conditionalLogicMap !== "undefined") {
    conditionalLogicMap = window.conditionalLogicMap;
  }

  // 1) Fetch qualifications (now returning array of { qualification, title } objects)
  fetch("/api/qualifications")
    .then(res => res.json())
    .then(qualifications => {
      qualifications.forEach(q => {
        const opt = document.createElement("option");
        opt.value = q.qualification;  // internal key
        opt.textContent = q.title;    // friendly title from the JSON
        qualSelect.appendChild(opt);
      });
    })
    .catch(console.error);

  // 2) On change, fetch subjects for that qualification
  qualSelect.addEventListener("change", () => {
    currentQualification = qualSelect.value;
    formContainer.innerHTML = "";
    currentActiveSubject = null; // reset active subject

    if (!currentQualification) return;

    fetch(`/api/subjects?qualification=${encodeURIComponent(currentQualification)}`)
      .then(r => r.json())
      .then(subjects => {
        renderSubjectButtons(subjects);
      })
      .catch(console.error);
  });

  function renderSubjectButtons(subjects) {
    subjectContainer.innerHTML = "";

    subjects.forEach(sub => {
      const btn = document.createElement("button");
      btn.classList.add("subject-btn");
      btn.textContent = sub;

      if (sub === currentActiveSubject) {
        btn.classList.add("active");
      }

      btn.style.opacity = 0;
      setTimeout(() => {
        btn.style.opacity = 1;
      }, 10);

      btn.onclick = () => {
        currentActiveSubject = sub;
        showFormSnippet(currentQualification, sub);
        renderSubjectButtons(subjects); // re-render with updated active state
      };

      subjectContainer.appendChild(btn);
    });
  }
});