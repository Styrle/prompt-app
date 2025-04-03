// script.js

let currentActiveSubject = null;
let currentQualification = null;

// Define goToQuestion in the global scope to ensure it's always available
window.goToQuestion = function (currentIndex, nextIndex, totalQuestions) {
  console.log(`goToQuestion called: currentIndex=${currentIndex}, nextIndex=${nextIndex}, totalQuestions=${totalQuestions}`);
  
  // Validate parameters
  if (typeof currentIndex !== 'number' || typeof nextIndex !== 'number' || typeof totalQuestions !== 'number') {
    console.error(`Invalid parameter types: currentIndex=${typeof currentIndex}, nextIndex=${typeof nextIndex}, totalQuestions=${typeof totalQuestions}`);
    // Default values if parameters are invalid
    if (typeof totalQuestions !== 'number') {
      totalQuestions = document.querySelectorAll('.question-block').length;
      console.log(`Used DOM to determine totalQuestions: ${totalQuestions}`);
    }
  }
  
  // Hide all questions first
  console.log(`Hiding all ${totalQuestions} questions`);
  for (let i = 0; i < totalQuestions; i++) {
    const el = document.getElementById(`question-${i}`);
    if (el) {
      console.log(`Hiding question-${i}`);
      el.style.display = "none";
    } else {
      console.warn(`Element question-${i} not found in DOM`);
    }
  }
  
  // Show the target question
  const nextElId = `question-${nextIndex}`;
  console.log(`Attempting to show ${nextElId}`);
  const nextEl = document.getElementById(nextElId);
  
  if (nextEl) {
    console.log(`Found ${nextElId}, setting display to block`);
    nextEl.style.display = "block";
    
    // Smooth scroll to the next question
    try {
      console.log(`Scrolling to ${nextElId}`);
      nextEl.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    } catch (error) {
      console.error(`Error scrolling to element: ${error.message}`);
    }
  } else {
    console.error(`Element ${nextElId} not found in DOM`);
  }
};

// Initialize global variables if they don't exist
if (typeof window.conditionalLogicMap === 'undefined') {
  window.conditionalLogicMap = {};
  console.log("Initialized empty conditionalLogicMap");
}

if (typeof window.questionIndexMap === 'undefined') {
  window.questionIndexMap = {};
  console.log("Initialized empty questionIndexMap");
}

if (typeof window.totalQuestions === 'undefined') {
  window.totalQuestions = 0;
  console.log("Initialized totalQuestions to 0");
}

window.handleConditionalLogic = function (questionId, selectedValue) {
  console.log(`handleConditionalLogic called with questionId: ${questionId}, selectedValue: ${selectedValue}`);
  
  // Check if the conditional logic map exists
  if (!window.conditionalLogicMap || Object.keys(window.conditionalLogicMap).length === 0) {
    console.error("conditionalLogicMap is not defined in the window object or is empty");
    
    // Try to extract it from any script tags in the page
    const scripts = document.querySelectorAll('script');
    let extracted = false;
    
    scripts.forEach(script => {
      const content = script.textContent || '';
      if (content.includes('window.conditionalLogicMap =')) {
        try {
          eval(content);
          extracted = true;
          console.log("Extracted conditionalLogicMap from script tag:", window.conditionalLogicMap);
        } catch (e) {
          console.error("Failed to extract conditionalLogicMap:", e);
        }
      }
    });
    
    if (!extracted) {
      // Still not found, let's use the Next button as fallback
      if (questionId.startsWith('question-')) {
        const currentIndex = parseInt(questionId.replace('question-', ''));
        const nextIndex = currentIndex + 1;
        window.goToQuestion(currentIndex, nextIndex, 38); // Use 38 as default totalQuestions from error logs
        return;
      }
    }
  }
  
  console.log("Available conditional logic map:", window.conditionalLogicMap);
  
  // Get rules for this question
  const rules = window.conditionalLogicMap[questionId];
  if (!rules || rules.length === 0) {
    console.warn(`No conditional logic rules found for question ${questionId}`);
    
    // Try alternate IDs (this helps when there's a mismatch between server and client naming)
    if (questionId.startsWith('q') && !questionId.startsWith('question-')) {
      // Try with question-X format
      const altId = `question-${window.questionIndexMap && window.questionIndexMap[questionId] || 0}`;
      const altRules = window.conditionalLogicMap[altId];
      
      if (altRules && altRules.length > 0) {
        console.log(`Found rules using alternate ID ${altId}:`, altRules);
        return window.handleConditionalLogic(altId, selectedValue);
      }
    }
    
    // Fallback to basic navigation
    if (questionId.startsWith('question-')) {
      const currentIndex = parseInt(questionId.replace('question-', ''));
      const nextIndex = currentIndex + 1;
      console.log(`No rules found, using fallback navigation to next question (${nextIndex})`);
      window.goToQuestion(currentIndex, nextIndex, 38); // Use 38 as default from error logs
    }
    return;
  }
  
  console.log(`Rules for ${questionId}:`, rules);
  
  // Try to normalize the selected value for comparison
  const normalizedSelectedValue = selectedValue.toLowerCase().trim();
  
  // Check each rule for a match, with more flexible matching
  for (const rule of rules) {
    const ruleOption = rule.option;
    console.log(`Checking rule: option '${ruleOption}' against selected value '${normalizedSelectedValue}'`);
    
    // Try different ways of matching
    if (
      ruleOption === normalizedSelectedValue ||
      ruleOption === selectedValue ||
      escapeName(ruleOption) === normalizedSelectedValue ||
      escapeName(ruleOption) === selectedValue
    ) {
      console.log(`Match found! Target question ID: ${rule.targetId}`);
      
      // Verify the question index map exists
      if (!window.questionIndexMap || Object.keys(window.questionIndexMap).length === 0) {
        console.error("questionIndexMap is not defined or empty");
        return;
      }
      
      console.log("Available question index map:", window.questionIndexMap);
      
      // Get the index of the target question
      const targetIndex = window.questionIndexMap[rule.targetId];
      if (typeof targetIndex !== "undefined") {
        console.log(`Target index for ${rule.targetId} is ${targetIndex}`);
        
        // Find the current question index
        let currentIndex = 0;
        if (questionId.startsWith("question-")) {
          currentIndex = parseInt(questionId.replace("question-", ""));
          console.log(`Parsed currentIndex from ID: ${currentIndex}`);
        } else {
          currentIndex = window.questionIndexMap[questionId];
          console.log(`Retrieved currentIndex from map: ${currentIndex}`);
        }
        
        console.log(`Navigating from question ${currentIndex} to question ${targetIndex}`);
        
        // Determine totalQuestions
        const totalQuestions = window.totalQuestions || 
                              document.querySelectorAll('.question-block').length || 
                              Math.max(...Object.values(window.questionIndexMap).filter(v => typeof v === 'number')) + 1 || 
                              38; // Fallback from error logs
        
        // Call goToQuestion with the right parameters
        window.goToQuestion(currentIndex, targetIndex, totalQuestions);
        return;
      } else {
        console.error(`Target index for ${rule.targetId} is undefined`);
      }
    }
  }
  
  console.warn(`No matching rule found for value: ${selectedValue}`);
  
  // As a fallback, just go to the next sequential question
  if (questionId.startsWith('question-')) {
    const currentIndex = parseInt(questionId.replace('question-', ''));
    const nextIndex = currentIndex + 1;
    console.log(`No matching rule, using fallback navigation to next question (${nextIndex})`);
    window.goToQuestion(currentIndex, nextIndex, 38); // Use 38 as default from error logs
  }
};

// Helper function to escape names consistently
function escapeName(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

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
    
    // Clear any previous form data when loading a new form
    window.conditionalLogicMap = {};
    window.questionIndexMap = {};
    window.totalQuestions = 0;
  
    fetch(`/api/formSnippet?qualification=${encodeURIComponent(qualification)}&subject=${encodeURIComponent(subject)}`)
      .then(r => r.text())
      .then(snippetHtml => {
        formContainer.innerHTML = `
          <div class="centered-form-wrapper fade-in">
            ${snippetHtml}
          </div>
        `;
        
        // Important: Extract and execute any scripts in the response
        const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
        let match;
        while ((match = scriptRegex.exec(snippetHtml)) !== null) {
          try {
            // Create a new script element and execute it
            const script = document.createElement('script');
            script.textContent = match[1];
            document.head.appendChild(script);
            console.log("Executed embedded script from form snippet");
          } catch (err) {
            console.error("Error executing embedded script:", err);
          }
        }
        
        // Log the state of configuration after script execution
        console.log("Form configuration after script execution:");
        console.log("- conditionalLogicMap:", window.conditionalLogicMap);
        console.log("- questionIndexMap:", window.questionIndexMap);
        console.log("- totalQuestions:", window.totalQuestions);
        
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