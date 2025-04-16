// script.js

let currentActiveSubject = null;
let currentQualification = null;

let questionIndexMap = {};
let conditionalLogicMap = {};
let visitedQuestions = [];

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
        // 2) Read the logic data from its data-* attributes
        try {
          conditionalLogicMap = JSON.parse(containerDiv.getAttribute("data-logicmap") || "{}");
          questionIndexMap = JSON.parse(containerDiv.getAttribute("data-questionindexmap") || "{}");
          window.totalQuestions = parseInt(containerDiv.getAttribute("data-totalquestions") || "0", 10);

          console.log("[showFormSnippet] Updated logic from snippet:", 
            { 
              mapSize: Object.keys(conditionalLogicMap).length,
              questionCount: window.totalQuestions
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

async function goToQuestionAsync(currentId, proposedNextId, isBack) {
  console.log(`[goToQuestion] currentId=${currentId}, proposedNextId=${proposedNextId}, isBack=${isBack}`);
  console.log(`[goToQuestion] conditionalLogicMap=`, conditionalLogicMap);
  console.log(`[goToQuestion] questionIndexMap=`, questionIndexMap);

  // 1) Get the DOM for the current question
  const questionBlock = document.getElementById(currentId);
  if (!questionBlock) {
    console.warn(`[goToQuestion] No DOM block for currentId='${currentId}'`);
    return;
  }

  // We'll figure out the actual nextId below
  let nextId = proposedNextId;

  // 2) If user clicked Back, pop from visitedQuestions
  if (isBack) {
    if (visitedQuestions.length > 0) {
      nextId = visitedQuestions.pop();
      console.log(`[goToQuestion] Going BACK => popped from history => ${nextId}`);
    } else {
      console.log(`[goToQuestion] BACK => no history, defaulting to '${proposedNextId}'`);
    }
  } else {
    // 3) If user clicked Next:
    // Push the current question so we know how to get back here
    visitedQuestions.push(currentId);
    console.log(`[goToQuestion] NEXT => pushed '${currentId}' to visitedQuestions`);

    // 3a) Evaluate conditional logic (only when going forward)
    let selectedValue = null;
    const inputs = questionBlock.querySelectorAll("input[type=radio], input[type=checkbox], select");
    console.log(`[goToQuestion] Found ${inputs.length} input(s) in #${currentId}`);

    for (const input of inputs) {
      // For radio/checkbox
      if ((input.type === "radio" || input.type === "checkbox") && input.checked) {
        selectedValue = input.value;
        console.log(`[goToQuestion] Found checked input value='${selectedValue}'`);
        break;
      }
      // For <select>
      if (input.tagName.toLowerCase() === "select" && input.value) {
        selectedValue = input.value;
        console.log(`[goToQuestion] Found <select> value='${selectedValue}'`);
        // break if you only need the first <select>
      }
    }

    // 3b) If there's a matching logic rule, override nextId
    const rules = conditionalLogicMap[currentId];
    console.log(`[goToQuestion] Checking logicMap for '${currentId}':`, rules);
    if (rules && selectedValue) {
      const foundRule = rules.find(r => r.option === selectedValue);
      if (foundRule && foundRule.targetId) {
        console.log(`[goToQuestion] Overriding nextId => '${foundRule.targetId}' via logic`);
        nextId = foundRule.targetId;
      }
    }
  }

  // 4) Hide current question
  questionBlock.style.display = "none";

  // 5) Show the newly determined next question
  const nextBlock = document.getElementById(nextId);
  if (!nextBlock) {
    console.warn(`[goToQuestion] nextBlock not found for '${nextId}'`);
    return;
  }
  nextBlock.style.display = "block";

  console.log(`[goToQuestion] End -> now showing '${nextId}'`);
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