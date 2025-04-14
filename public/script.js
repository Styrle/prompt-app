// script.js

let currentActiveSubject = null;
let currentQualification = null;

let questionIndexMap = {};
let conditionalLogicMap = {};
let visitedQuestions = [];

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

  // 3) showFormSnippet => fetch the snippet & embed it
  function showFormSnippet(qualification, subject) {
    formContainer.innerHTML = "";
    
    // Clear any previous form data when loading a new form
    window.conditionalLogicMap = {};
    window.questionIndexMap = {};
    window.totalQuestions = 0;
  
    fetch(`/api/formSnippet?qualification=${encodeURIComponent(qualification)}&subject=${encodeURIComponent(subject)}`)
      .then(r => r.text())
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
  
            console.log("Updated logic from snippet:", { conditionalLogicMap, questionIndexMap, totalQuestions });
          } catch (err) {
            console.error("Failed to parse snippet data attributes:", err);
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
        formContainer.innerHTML = "<p>Oops, failed to load the form.</p>";
      });
  }
  
});