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
    .filter(f => f.toLowerCase().endsWith(".json"));

  allJsons.forEach(filename => {
    try {
      const jsonPath = path.join(jsonDir, filename);
      const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

      // Use 'jsonData.title' for the qualification
      const qualification = jsonData.title;
      if (!qualification) return;

      // Ensure we have an object for this qualification
      if (!qualificationMap[qualification]) {
        qualificationMap[qualification] = {};
      }

      // Store the human-friendly title in __title
      qualificationMap[qualification].__title = jsonData.title;

      // In your example, the formsData object has keys (like "AA", "TC") that hold arrays
      if (jsonData.formsData && typeof jsonData.formsData === "object") {
        Object.keys(jsonData.formsData).forEach(subjectKey => {
          if (Array.isArray(jsonData.formsData[subjectKey])) {
            qualificationMap[qualification][subjectKey] = filename;
          }
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

/** 
 * GET /api/qualifications 
 * => Return array of { qualification, title } 
*/
app.get("/api/qualifications", (req, res) => {
  const allQualifications = Object.keys(qualificationMap).map(key => {
    return {
      qualification: key,
      title: qualificationMap[key].__title || key
    };
  });
  res.json(allQualifications);
});

/** GET /api/subjects => Return the subject list for a given qualification. 
    e.g. /api/subjects?qualification=ACA
*/
app.get("/api/subjects", (req, res) => {
  const { qualification } = req.query;
  if (!qualification) {
    return res.status(400).json({ error: "Missing 'qualification' query parameter." });
  }
  const subjectsMap = qualificationMap[qualification];
  if (!subjectsMap) {
    return res.json([]);
  }
  // Filter out the special "__title" property
  const subjectKeys = Object.keys(subjectsMap).filter(k => k !== "__title");
  res.json(subjectKeys);
});

/** 
 * GET /api/formSnippet => Return snippet for the form 
 * (for embedding on the same page rather than navigating away)
*/
app.get("/api/formSnippet", (req, res) => {
  const { qualification, subject } = req.query;
  console.log(`[formSnippet] Called with qualification='${qualification}', subject='${subject}'`);

  if (!qualification || !subject) {
    console.error(`[formSnippet] Missing qualification or subject!`);
    return res.status(400).send("Missing qualification or subject.");
  }

  try {
    // Load form.json (base questions)
    const jsonPath = path.join(__dirname, "./public/assets/JSON/form.json");
    console.log(`[formSnippet] Loading base form data from: ${jsonPath}`);
    const formData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    
    // Also load qualification-specific data if any
    if (qualification !== "default") {
      const qualJsonFile = qualificationMap[qualification] &&
        Object.values(qualificationMap[qualification]).find(filename => filename.endsWith(".json"));

      if (qualJsonFile) {
        const qualJsonPath = path.join(__dirname, "public/assets/JSON", qualJsonFile);
        const qualData = JSON.parse(fs.readFileSync(qualJsonPath, "utf8"));

        const subjectKey = Object.keys(qualData.formsData || {}).find(
          key => key === subject || key.toLowerCase() === subject.toLowerCase()
        );
        if (subjectKey && qualData.formsData[subjectKey]) {
          formData.questions = formData.questions.concat(qualData.formsData[subjectKey]);
        }
      }
    }

    // Load prompt.json so we can display it at Q38
    const promptPath = path.join(__dirname, "./public/assets/JSON/prompt.json");
const promptData = JSON.parse(fs.readFileSync(promptPath, "utf8"));

// We'll pass both the q3 and q6 arrays to the front end:
const q3Array = promptData.q3 || [];
const q6Array = promptData.q6 || [];

// Log the data we're using
console.log(`[formSnippet] Loaded ${q3Array.length} q3 prompts and ${q6Array.length} q6 prompts`);

// Make sure the JSON is properly escaped for HTML attributes
const q3Attr = JSON.stringify(q3Array).replace(/"/g, '&quot;');
const q6Attr = JSON.stringify(q6Array).replace(/"/g, '&quot;');

// We'll still build the basic form HTML, but no single finalPromptText is inserted yet.
const formHtml = buildForm(formData /* no second arg for finalPromptText now */);

// Build conditionalLogicMap
const conditionalLogicMap = {};
formData.questions.forEach((question, idx) => {
  if (question.conditionalLogic && Array.isArray(question.conditionalLogic)) {
    const questionId = question.id || `question-${idx}`;
    conditionalLogicMap[questionId] = question.conditionalLogic.map(logic => ({
      option: escapeName(logic.option),
      targetId: logic.goToQuestion
    }));
  }
});

// Build questionIndexMap
const questionIndexMap = {};
formData.questions.forEach((question, idx) => {
  if (question.id) {
    questionIndexMap[question.id] = idx;
  }
});

// Wrap snippet, embedding q3 and q6 arrays in data attributes
const snippet = `
<div class="styled-form-container"
     data-logicmap='${JSON.stringify(conditionalLogicMap)}'
     data-questionindexmap='${JSON.stringify(questionIndexMap)}'
     data-totalquestions='${formData.questions.length}'
     data-q3prompts="${q3Attr}"
     data-q6prompts="${q6Attr}">
  <h2>${qualification} ${subject}</h2>
  <form>
    ${formHtml}
  </form>
</div>
`;

res.send(snippet);

  } catch (err) {
    console.error(`[formSnippet] Failed to load form snippet:`, err);
    res.status(500).send("Failed to load form snippet: " + err);
  }
});

/* 
 * Old route /editForm => returns a full page with the entire form 
 * (unchanged below)
*/
app.get("/editForm", (req, res) => {
  const { qualification, subject } = req.query;
  if (!qualification || !subject) {
    return res.status(400).send("Missing qualification or subject.");
  }

  try {
    const jsonPath = path.join(__dirname, "./public/assets/JSON/form.json");
    const formData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

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

    const pageHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>Editing: ${qualification} - ${subject}</title>
        <link rel="stylesheet" href="/public/style.css" />
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

        <script src="/public/script.js"></script>
        <script>
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
      const containerId = question.id || `question-${idx}`;
      const hiddenStyle = (idx === 0) ? "" : 'style="display:none;"';
  
      html += `<div class="question-block" id="${containerId}" ${hiddenStyle}>`;
      html += `<div class="question-title">${question.title}</div>`;
  
      if (question.info) {
        html += `<p class="question-info">${question.info}</p>`;
      }
  
      // Render inputs
      if (Array.isArray(question.options)) {
        if (question.type === "dropdown") {
          html += `<select class="answer-select" name="${escapeName(question.title)}"
                       ${question.isRequired ? "required" : ""}>
                     <option value="">Please select...</option>`;
          question.options.forEach(optionText => {
            html += `<option value="${escapeName(optionText)}">${optionText}</option>`;
          });
          html += `</select>`;
        } else {
          let inputType = (question.type === "checkbox") ? "checkbox" : "radio";
          question.options.forEach((optionText, optIndex) => {
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
                  />
                  <span>${optionText}</span>
                </label>
              </div>`;
          });
        }
      } else {
        if (question.type === "short_answer") {
          html += `<input class="answer-text" type="text" name="${escapeName(question.title)}"
            ${question.isRequired ? "required" : ""} />`;
        } else if (question.type === "paragraph") {
          html += `<textarea class="answer-textarea" name="${escapeName(question.title)}"
            ${question.isRequired ? "required" : ""}></textarea>`;
        } else {
          // fallback
          html += `<input class="answer-text" type="text" name="${escapeName(question.title)}"
            ${question.isRequired ? "required" : ""} />`;
        }
      }
  
      // If this is Q38, we’ll let the frontend decide how to fill the textarea 
      // based on the user’s earlier choices. So just add an empty <textarea> for now:
      if (question.id === "q38") {
        html += `
          <div style="margin-top: 20px;">
            <label style="font-weight: bold; display: block; margin-bottom: 5px;">
              Final Prompt
            </label>
            <textarea id="final-prompt-textarea" rows="10" cols="80" style="width: 100%;"></textarea>
          </div>
        `;
      }
  
      // Nav arrows
      html += `<div class="nav-arrows">`;
      if (idx > 0) {
        const prevId = formData.questions[idx - 1].id || `question-${idx - 1}`;
        html += `
          <button type="button" class="nav-btn subject-btn"
                  onclick="goToQuestionAsync('${containerId}', '${prevId}', true)">
            ← Back
          </button>`;
      }
      if (idx < formData.questions.length - 1) {
        const nextId = formData.questions[idx + 1].id || `question-${idx + 1}`;
        html += `
          <button type="button" class="nav-btn subject-btn"
                  onclick="goToQuestionAsync('${containerId}', '${nextId}', false)">
            Next →
          </button>`;
      } else {
        html += `
          <button type="submit" class="nav-btn subject-btn">
            Finish
          </button>`;
      }
      html += `</div></div>\n`;
    });
  
    return html;
  }
  
  function escapeName(str) {
    return str
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
  }