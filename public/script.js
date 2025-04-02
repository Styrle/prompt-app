// script.js

let currentActiveSubject = null;
let currentQualification = null;



document.addEventListener("DOMContentLoaded", () => {
  const qualSelect = document.getElementById("qualificationSelect");
  const subjectContainer = document.getElementById("subject-container");
  const formContainer = document.getElementById("form-container");

  // 1) fetch qualifications
  fetch("/api/qualifications")
    .then(res => res.json())
    .then(qualifications => {
      qualifications.forEach(q => {
        const opt = document.createElement("option");
        opt.value = q;
        opt.textContent = q;
        qualSelect.appendChild(opt);
      });
    })
    .catch(console.error);

  // 2) on change, fetch subjects for that qualification
  qualSelect.addEventListener("change", () => {
    currentQualification = qualSelect.value;
    const selectedQual = currentQualification;
    formContainer.innerHTML = "";
    currentActiveSubject = null; // reset active subject
  
    if (!selectedQual) return;
  
    fetch(`/api/subjects?qualification=${encodeURIComponent(selectedQual)}`)
      .then(r => r.json())
      .then(subjects => {
        renderSubjectButtons(subjects); // ✅ call reusable renderer
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
        renderSubjectButtons(subjects); // 🌀 re-render with updated active state
      };
  
      subjectContainer.appendChild(btn);
    });
  }
  

  // 3) showFormSnippet => fetch the snippet & embed it
  function showFormSnippet(qualification, subject) {
    formContainer.innerHTML = "";
  
    fetch(`/api/formSnippet?qualification=${encodeURIComponent(qualification)}&subject=${encodeURIComponent(subject)}`)
      .then(r => r.text())
      .then(snippetHtml => {
        formContainer.innerHTML = `
          <div class="centered-form-wrapper fade-in">
            ${snippetHtml}
          </div>
        `;
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


  window.handleConditionalLogic = function (questionId, selectedValue) {
    // We rely on the global data that was injected server-side:
    if (!window.conditionalLogicMap) return;
    const rules = window.conditionalLogicMap[questionId];
    if (!rules) return;
  
    for (const rule of rules) {
      if (rule.option === selectedValue) {
        const targetIndex = window.questionIndexMap[rule.targetId];
        if (typeof targetIndex !== "undefined") {
          // Find the current question index
          let currentIndex = 0;
          if (questionId.startsWith("question-")) {
            currentIndex = parseInt(questionId.replace("question-", ""));
          } else {
            currentIndex = window.questionIndexMap[questionId];
          }
          window.goToQuestion(currentIndex, targetIndex, window.totalQuestions);
          return;
        }
      }
    }
  };
  
  /** Hide current question, show next. */
  window.goToQuestion = function (currentIndex, nextIndex, totalQuestions) {
    for (let i = 0; i < totalQuestions; i++) {
      const el = document.getElementById(`question-${i}`);
      if (el) {
        el.style.display = "none";
      }
    }
    const nextEl = document.getElementById(`question-${nextIndex}`);
    if (nextEl) {
      nextEl.style.display = "block";
    }
  };
  