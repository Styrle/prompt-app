const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFParser = require("pdf2json");

const app = express();
const PORT = 3000;

// Our global qualification → subject map
const qualificationMap = {};

/* ------------------------
   1) LOADING PDFs (optional)
   ------------------------ */
function loadPdfInfo() {
  const pdfDir = path.join(__dirname, "pdf");
  if (!fs.existsSync(pdfDir)) return;
  const allPdfs = fs.readdirSync(pdfDir).filter(f => f.toLowerCase().endsWith(".pdf"));
  allPdfs.forEach(filename => {
    const base = filename.replace(/\.pdf$/i, "");
    const parts = base.split(" ");
    if (parts.length >= 4) {
      const qualification = parts[2];
      const subject = parts[3];
      if (!qualificationMap[qualification]) {
        qualificationMap[qualification] = {};
      }
      qualificationMap[qualification][subject] = filename;
    }
  });
}

/* ------------------------
   2) LOADING JSON Data
   ------------------------ */
function loadJsonInfo() {
  const jsonDir = path.join(__dirname, "public/assets/JSON");
  if (!fs.existsSync(jsonDir)) return;

  // Clear existing entries rather than reassigning
  Object.keys(qualificationMap).forEach(key => delete qualificationMap[key]);

  const allJsons = fs.readdirSync(jsonDir)
    .filter(f => f.toLowerCase().endsWith(".json") && f !== "form.json");

  allJsons.forEach(filename => {
    try {
      const jsonPath = path.join(jsonDir, filename);
      const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

      // Use formTitle as the qualification
      const qualification = jsonData.formTitle;
      if (!qualification) return;

      // Find keys that are array-based (besides formTitle, description)
      const paperKeys = Object.keys(jsonData).filter(
        key => key !== "formTitle" && key !== "description" && Array.isArray(jsonData[key])
      );
      if (paperKeys.length > 0) {
        paperKeys.forEach(paper => {
          if (!qualificationMap[qualification]) {
            qualificationMap[qualification] = {};
          }
          qualificationMap[qualification][paper] = filename;
        });
      }
    } catch (err) {
      console.error(`Error parsing ${filename}:`, err);
    }
  });
}

// Initialize data
loadPdfInfo();
loadJsonInfo();

/* ------------------------
   3) EXPRESS SETUP
   ------------------------ */
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "public/assets")));

/* ------------------------
   4) HOME PAGE
   ------------------------ */
app.get("/", (req, res) => {
  // Serve the main index.html
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ------------------------
   5) API ENDPOINTS
   ------------------------ */

/** GET /api/qualifications => Return array of top-level qualifications. */
app.get("/api/qualifications", (req, res) => {
  const allQualifications = Object.keys(qualificationMap);
  res.json(allQualifications);
});

/** GET /api/subjects => Return the subject list for a given qualification. 
    e.g. /api/subjects?qualification=ACCA
*/
app.get("/api/subjects", (req, res) => {
  const { qualification } = req.query;
  if (!qualification) {
    return res.status(400).json({ error: "Missing 'qualification' query parameter." });
  }
  const subjectsMap = qualificationMap[qualification];
  if (!subjectsMap) {
    return res.json([]); // Or return a 404 error if you prefer
  }
  // Return an array of subject keys
  const subjectKeys = Object.keys(subjectsMap);
  res.json(subjectKeys);
});

/** GET /api/formSnippet => Return snippet for the form 
    (for embedding on the same page rather than navigating away)
*/
app.get("/api/formSnippet", (req, res) => {
  const { qualification, subject } = req.query;
  if (!qualification || !subject) {
    return res.status(400).send("Missing qualification or subject.");
  }

  try {
    // Load form.json (or whichever data source) for the form
    const jsonPath = path.join(__dirname, "./public/assets/JSON/form.json");
    const formData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

    // Build a mapping for conditional logic
    const conditionalLogicMap = {};
    if (formData.questions) {
      formData.questions.forEach((question, idx) => {
        if (question.conditionalLogic && Array.isArray(question.conditionalLogic)) {
          // Use the question.id if available, otherwise use the index-based ID
          const questionId = question.id || `question-${idx}`;
          conditionalLogicMap[questionId] = question.conditionalLogic.map(logic => ({
            option: escapeName(logic.option),
            targetId: logic.goToQuestion
          }));
        }
      });
    }

    // Map question IDs to array indices
    const questionIndexMap = {};
    formData.questions.forEach((question, idx) => {
      if (question.id) {
        questionIndexMap[question.id] = idx;
      }
      // Always add the index-based mapping as well
      questionIndexMap[`question-${idx}`] = idx;
    });
    
    console.log("Generated conditionalLogicMap:", JSON.stringify(conditionalLogicMap, null, 2));
    console.log("Generated questionIndexMap:", JSON.stringify(questionIndexMap, null, 2));

    // Build the form HTML
    const formHtml = buildForm(formData);

    // Create a separate script tag with the configuration data
    // This will be extracted and executed by the client
    const configScript = `
      <script>
        // Direct assignment to window objects
        window.conditionalLogicMap = ${JSON.stringify(conditionalLogicMap)};
        window.questionIndexMap = ${JSON.stringify(questionIndexMap)};
        window.totalQuestions = ${formData.questions.length};
        
        console.log("Form configuration loaded via script tag:");
        console.log("- conditionalLogicMap:", window.conditionalLogicMap);
        console.log("- questionIndexMap:", window.questionIndexMap);
        console.log("- totalQuestions:", window.totalQuestions);
      </script>
    `;

    // Wrap the snippet in a container with minimal styling
    // Place the script tag BEFORE the form
    const snippet = `
      ${configScript}
      <div class="styled-form-container">
        <h2>${qualification} ${subject}</h2>
        <form>
          ${formHtml}
        </form>
      </div>
    `;
    
    res.send(snippet);

  } catch (err) {
    console.error("Error generating form snippet:", err);
    res.status(500).send("Failed to load form snippet: " + err);
  }
});

/* ------------------------
   6) /editForm => Old route that returns a full page
   ------------------------ */
app.get("/editForm", (req, res) => {
  const { qualification, subject } = req.query;
  if (!qualification || !subject) {
    return res.status(400).send("Missing qualification or subject.");
  }

  try {
    const jsonPath = path.join(__dirname, "./public/assets/JSON/form.json");
    const formData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

    // Build up the HTML form
    const formHtml = buildForm(formData);

    // Build a mapping for conditional logic
    const conditionalLogicMap = {};
    if (formData.questions) {
      formData.questions.forEach((question, idx) => {
        if (question.conditionalLogic && Array.isArray(question.conditionalLogic)) {
          const questionId = question.id || `question-${idx}`;
          conditionalLogicMap[questionId] = question.conditionalLogic.map(logic => ({
            option: escapeName(logic.option),
            targetId: logic.goToQuestion
          }));
        }
      });
    }

    // Map question IDs to array indices
    const questionIndexMap = {};
    formData.questions.forEach((question, idx) => {
      if (question.id) {
        questionIndexMap[question.id] = idx;
      }
    });

    // Return a full HTML page
    const pageHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>Editing: ${qualification} - ${subject}</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <div class="container">
          <h1>${formData.formTitle}</h1>
          <p>${formData.description}</p>
          <form>
            ${formHtml}
          </form>
          <p><a href="/">Return Home</a></p>
        </div>

        <script src="/script.js"></script>
        <script>
          // Provide conditional-logic data to the client
          window.conditionalLogicMap = ${JSON.stringify(conditionalLogicMap)};
          window.questionIndexMap = ${JSON.stringify(questionIndexMap)};
          window.totalQuestions = ${formData.questions.length};
        </script>
      </body>
      </html>
    `;
    res.send(pageHtml);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to load JSON file: " + err);
  }
});

/* ------------------------
   7) SERVER START
   ------------------------ */
app.listen(PORT, () => {
  console.log("Server listening on http://localhost:" + PORT);
});

/* ------------------------
   HELPER FUNCTIONS
   ------------------------ */
   function buildForm(formData) {
    if (!formData.questions) return "";
  
    let html = "";
  
    formData.questions.forEach((question, idx) => {
      // Force a consistent container ID: "question-0", "question-1", etc.
      const containerId = `question-${idx}`;
      // Only show the first question; hide the others
      const hiddenStyle = idx === 0 ? "" : 'style="display:none;"';
  
      html += `<div class="question-block" id="${containerId}" ${hiddenStyle}>`;
  
      // Question title with minimal margin (use .question-title in CSS)
      html += `<div class="question-title">${question.title}</div>`;
  
      // Optional question info (with .question-info to control spacing)
      if (question.info) {
        html += `<p class="question-info">${question.info}</p>`;
      }
  
      const hasConditionalLogic = Array.isArray(question.conditionalLogic);
      const questionId = question.id || containerId;
  
      // If the question has options...
      if (Array.isArray(question.options)) {
        if (question.type === "dropdown") {
          // Build a <select> element for dropdown type questions
          html += `<select class="answer-select" name="${escapeName(question.title)}" ${question.isRequired ? "required" : ""} ${hasConditionalLogic ? `onchange="handleConditionalLogic('${questionId}', this.value)"` : ""}>`;
          html += `<option value="">Please select...</option>`;
          question.options.forEach(optionText => {
            html += `<option value="${escapeName(optionText)}">${optionText}</option>`;
          });
          html += `</select>`;
        } else {
          // For "checkbox" type (rendered as radios) and "multiple_choice" (rendered as checkboxes)
          let inputType = "radio"; // default for "checkbox" type
          if (question.type === "multiple_choice") {
            inputType = "checkbox";
          }
  
          question.options.forEach((optionText, optIndex) => {
            // Create a unique ID for the input
            const uniqueId = `${containerId}-opt${optIndex}`;
            html += `
              <div class="answer-option">
                <label class="answer-box" for="${uniqueId}">
                  <input
                    type="${inputType}"
                    id="${uniqueId}"
                    name="${escapeName(question.title)}"
                    value="${escapeName(optionText)}"
                    ${question.isRequired ? "required" : ""}
                    ${hasConditionalLogic ? `onchange="handleConditionalLogic('${questionId}', '${escapeName(optionText)}')"` : ""}
                  />
                  <span>${optionText}</span>
                </label>
              </div>
            `;
          });
        }
      } else {
        // If there are no options, handle short answer or paragraph type
        if (question.type === "short_answer") {
          html += `<input class="answer-text" type="text" name="${escapeName(question.title)}" ${question.isRequired ? "required" : ""} />`;
        } else if (question.type === "paragraph") {
          html += `<textarea class="answer-textarea" name="${escapeName(question.title)}" ${question.isRequired ? "required" : ""}></textarea>`;
        } else {
          // Fallback text input
          html += `<input class="answer-text" type="text" name="${escapeName(question.title)}" ${question.isRequired ? "required" : ""} />`;
        }
      }
  
      // Navigation Buttons
      html += `<div class="nav-arrows">`;
      if (idx > 0) {
        html += `
            <button type="button" class="nav-btn subject-btn" onclick="goToQuestion(${idx}, ${idx - 1}, ${formData.questions.length})">
              ← Back
            </button>
          `;
      }
  
      if (idx < formData.questions.length - 1) {
        html += `
            <button type="button" class="nav-btn subject-btn" onclick="goToQuestion(${idx}, ${idx + 1}, ${formData.questions.length})">
              Next →
            </button>
          `;
      } else {
        html += `
            <button type="submit" class="nav-btn subject-btn">
              Finish
            </button>
          `;
      }
      html += `</div>`; // Close nav-arrows
  
      html += `</div>\n`; // Close question-block
    });
  
    return html;
  }
  
  function escapeName(str) {
    return str
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
  }

