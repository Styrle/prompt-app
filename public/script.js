// script.js

let currentActiveSubject = null;
let currentQualification = null;

let questionIndexMap = {};
let conditionalLogicMap = {};
let visitedQuestions = [];

// Store user’s final chosen Q3 prompt from prompt.json
let selectedQ3PromptText = "";  

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
          
          // This is where we store the possible q3 prompts from prompt.json
          window.q3Prompts = JSON.parse(containerDiv.getAttribute("data-q3prompts") || "[]");
          console.log("[showFormSnippet] q3Prompts =", window.q3Prompts);
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

    // 3) If user just answered Q4 => store the marks
    if (currentId === "q4") {
      const inputEl = questionBlock.querySelector("textarea, input[type=text]");
      writtenTestMarks = inputEl ? inputEl.value.trim() : "";
      console.log("[goToQuestion] User typed marks =>", writtenTestMarks);
    }

    // 4) If user just answered Q29 => store the "Question" text
    if (currentId === "q29") {
      const inputEl = questionBlock.querySelector("textarea, input[type=text]");
      userQuestionText = inputEl ? inputEl.value.trim() : "";
      console.log("[goToQuestion] User typed a 'Question' =>", userQuestionText);
    }

    // 5) If user just answered Q30 => store the "Answer" text
    if (currentId === "q30") {
      const inputEl = questionBlock.querySelector("textarea, input[type=text]");
      userAnswerText = inputEl ? inputEl.value.trim() : "";
      console.log("[goToQuestion] User typed an 'Answer' =>", userAnswerText);
    }

    // 6) Evaluate conditional logic to find nextId
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

  // 7) If Q38 => fill final prompt
  if (nextId === "q38") {
    console.log("[goToQuestion] Reached Q38 => building final prompt");
    const finalTextarea = document.getElementById("final-prompt-textarea");
    if (finalTextarea) {
      let finalPrompt = selectedQ3PromptText;

      // Insert the # of marks if q4 was answered
      if (writtenTestMarks) {
        finalPrompt = finalPrompt.replace(/<WTQ marks>/g, writtenTestMarks);
      }

      // Replace <qualification> and <topic> if desired
      if (currentQualification) {
        finalPrompt = finalPrompt.replace(/<qualification>/g, currentQualification);
      }
      if (currentActiveSubject) {
        finalPrompt = finalPrompt.replace(/<topic>/g, currentActiveSubject);
      }

      // 8) Now replace <Question> and <Answer> from q29 & q30
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