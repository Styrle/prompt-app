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
    const jsonPath = path.join(__dirname, "./public/assets/JSON/form.json");
    console.log(`[formSnippet] Loading form data from: ${jsonPath}`);
    const formData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

    // Log how many questions we have
    console.log(`[formSnippet] formData has ${formData.questions.length} questions.`);

    const formHtml = buildForm(formData);

    // Build conditionalLogicMap
    const conditionalLogicMap = {};

    formData.questions.forEach((question, idx) => {
      // For debugging: print each question ID and whether conditionalLogic is present
      console.log(`[formSnippet] Question #${idx} => id='${question.id}' has conditionalLogic=`, question.conditionalLogic);

      if (question.conditionalLogic && Array.isArray(question.conditionalLogic)) {
        const questionId = question.id || `question-${idx}`;
        console.log(`[formSnippet] Building logicMap entry for '${questionId}'...`);

        conditionalLogicMap[questionId] = question.conditionalLogic.map(logic => {
          const escapedOpt = escapeName(logic.option);
          console.log(`  Option='${logic.option}' => escaped='${escapedOpt}', goTo='${logic.goToQuestion}'`);
          return {
            option: escapedOpt,
            targetId: logic.goToQuestion
          };
        });
      }
    });

    // Build questionIndexMap
    const questionIndexMap = {};

    formData.questions.forEach((question, idx) => {
      if (question.id) {
        questionIndexMap[question.id] = idx;
      }
    });

    // Wrap snippet
    const snippet = `
    <div class="styled-form-container"
         data-logicmap='${JSON.stringify(conditionalLogicMap)}'
         data-questionindexmap='${JSON.stringify(questionIndexMap)}'
         data-totalquestions='${formData.questions.length}'>
      <h2>${qualification} ${subject}</h2>
      <form>
        ${formHtml}
      </form>
    </div>
  `;

    console.log(`[formSnippet] Finished building snippet. conditionalLogicMap=`, conditionalLogicMap);
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
  
    // Create an array of question IDs (just in case we want it)
    const questionIds = formData.questions.map(q => q.id);
    console.log(`[buildForm] Generating HTML. Found questionIds=`, questionIds);
  
    formData.questions.forEach((question, idx) => {
      const containerId = question.id;
      const hiddenStyle = (idx === 0) ? "" : 'style="display:none;"';
  
      console.log(`[buildForm] Creating DOM block for id='${containerId}'`);
  
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
          let inputType;
          if (question.type === "checkbox") {
            inputType = "checkbox";
          } else {
            // for "multiple_choice" or anything else, default to radio
            inputType = "radio";
          }
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
          html += `<input class="answer-text" type="text" name="${escapeName(question.title)}"
            ${question.isRequired ? "required" : ""} />`;
        }
      }
  
      // Nav arrows
      html += `<div class="nav-arrows">`;
      if (idx > 0) {
        const prevId = formData.questions[idx - 1].id;
        // Pass true as the third argument for the Back button
        html += `
          <button type="button" class="nav-btn subject-btn"
                  onclick="goToQuestionAsync('${containerId}', '${prevId}', true)">
            ← Back
          </button>`;
      }
      if (idx < formData.questions.length - 1) {
        const nextId = formData.questions[idx + 1].id;
        // Pass false as the third argument for the Next button
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
