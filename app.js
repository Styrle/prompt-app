const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFParser = require("pdf2json");

const app = express();
const PORT = 3000;

const qualificationMap = {};

app.use(express.static(path.join(__dirname, "public/assets")));

// 1) Load the PDF folder, parse filenames for 3rd/4th words
function loadPdfInfo() {
  const pdfDir = path.join(__dirname, "pdf");
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
loadPdfInfo();

// Serve static files (including style.css)
app.use(express.static(path.join(__dirname, "public")));

// Home page: let user pick qualification → subject
app.get("/", (req, res) => {
  const allQualifications = Object.keys(qualificationMap);

  let html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8"/>
    <title>Qualifications</title>
    <link rel="stylesheet" href="/style.css" />
    <script>
      const data = ${JSON.stringify(qualificationMap)};
      function showSubjects(qual) {
        document.getElementById("heading").textContent = "Choose your subject";
        const container = document.getElementById("subject-container");
        container.innerHTML = "";
        const subjectsMap = data[qual];
        for (let subject in subjectsMap) {
          const btn = document.createElement("button");
          btn.textContent = subject;
          btn.onclick = () => {
            window.location.href = "/editForm?qualification=" + qual + "&subject=" + subject;
          };
          container.appendChild(btn);
        }
      }
    </script>
  </head>
  <body>
    <h1 id="heading">Choose your qualification</h1>
    <div>
      ${allQualifications.map(q => {
        return `<button onclick="showSubjects('${q}')">${q}</button>`
      }).join(" ")}
    </div>
    <hr/>
    <div id="subject-container"></div>
  </body>
  </html>
  `;
  res.send(html);
});

function loadJsonInfo() {
  const jsonDir = path.join(__dirname, "public/assets/JSON");
  const allJsons = fs.readdirSync(jsonDir)
    .filter(f => f.toLowerCase().endsWith(".json") && f !== "form.json");
  
  // Clear existing entries rather than reassigning
  Object.keys(qualificationMap).forEach(key => delete qualificationMap[key]);

  allJsons.forEach(filename => {
    try {
      const jsonPath = path.join(jsonDir, filename);
      const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      
      // Extract qualification from formTitle
      const qualification = jsonData.formTitle;
      
      // Find the keys after "formTitle" and "description" that have an array value
      // These should be the paper names (like "BNTA" or "AUDT")
      const paperKeys = Object.keys(jsonData).filter(key => 
        key !== "formTitle" && 
        key !== "description" && 
        Array.isArray(jsonData[key])
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

// Replace the PDF loading with JSON loading in app initialization
loadJsonInfo();

// GET /editForm => load the form.json file and build HTML form
app.get("/editForm", (req, res) => {
  const { qualification, subject } = req.query;
  if (!qualification || !subject) {
    return res.status(400).send("Missing qualification or subject.");
  }

  try {
    // Load form.json as in the original code
    const jsonPath = path.join(__dirname, "./public/assets/JSON/form.json");
    const formData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

    // Build the HTML form from the JSON data
    const formHtml = buildForm(formData);

    // Create a mapping object for conditional logic
    const conditionalLogicMap = {};
    if (formData.questions) {
      formData.questions.forEach((question, idx) => {
        if (question.conditionalLogic && Array.isArray(question.conditionalLogic)) {
          const questionId = question.id || `question-${idx}`;
          conditionalLogicMap[questionId] = question.conditionalLogic.map(logic => {
            return {
              option: escapeName(logic.option),
              targetId: logic.goToQuestion
            };
          });
        }
      });
    }

    // Build a mapping of question IDs to indices
    const questionIndexMap = {};
    formData.questions.forEach((question, idx) => {
      if (question.id) {
        questionIndexMap[question.id] = idx;
      }
    });

    // Construct final page output
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

        <script>
          // Store the conditional logic rules
          const conditionalLogicMap = ${JSON.stringify(conditionalLogicMap)};
          
          // Map question IDs to their indices
          const questionIndexMap = ${JSON.stringify(questionIndexMap)};
          
          // Total questions for bounds checking
          const totalQuestions = ${formData.questions.length};
          
          /**
           * Handle conditional logic when an option is selected
           * questionId: the ID of the current question
           * selectedValue: the value of the selected option
           */
          function handleConditionalLogic(questionId, selectedValue) {
            // Check if this question has conditional logic
            if (conditionalLogicMap[questionId]) {
              // Look for a matching rule
              for (const rule of conditionalLogicMap[questionId]) {
                if (rule.option === selectedValue) {
                  // Found a matching rule, get the target question index
                  const targetIndex = questionIndexMap[rule.targetId];
                  
                  if (targetIndex !== undefined) {
                    // Find the current question's index
                    const currentIndex = questionId.startsWith('question-') 
                      ? parseInt(questionId.replace('question-', ''))
                      : questionIndexMap[questionId];
                      
                    // Navigate to the target question
                    goToQuestion(currentIndex, targetIndex, totalQuestions);
                    return; // Exit after applying the first matching rule
                  }
                }
              }
            }
          }
          
          /**
           * Hide the current question and show the new one.
           * currentIndex: index of the question we're leaving
           * nextIndex: index of the question we want to go to
           * totalQuestions: total number of questions
           */
          function goToQuestion(currentIndex, nextIndex, totalQuestions) {
            // Hide all questions first
            for (let i = 0; i < totalQuestions; i++) {
              document.getElementById("question-" + i).style.display = "none";
            }
            
            // Show the next question if valid index
            if (nextIndex >= 0 && nextIndex < totalQuestions) {
              document.getElementById("question-" + nextIndex).style.display = "block";
            }
          }
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

/**
 * Build the final form HTML from the lines of each page
 * pagesLines is array-of-pages, each item is array of lines (strings)
 */
function buildForm(formData) {
  let html = "";

  formData.questions.forEach((question, idx) => {
    const containerClass = question.type || "unknown_type";
    // Store the question ID for navigation or use index if no ID provided
    const questionId = question.id || `question-${idx}`;

    // Only show the first question by default; hide the rest
    const hiddenStyle = idx === 0 ? "" : 'style="display:none;"';

    // Each question has an ID so we can show/hide it
    html += `<div class="${containerClass}" id="question-${idx}" ${hiddenStyle}>`;

    // Question title
    html += `<label>${question.title}</label>`;

    // If there's extra 'info', display it
    if (question.info) {
      html += `<p>${question.info}</p>`;
    }

    // Track conditional logic for this question
    let hasConditionalLogic = question.conditionalLogic && Array.isArray(question.conditionalLogic);
    let conditionalLogicScript = "";

    // Handle different question types
    switch (question.type) {
      case "short_answer":
        html += `
          <input
            type="text"
            name="${escapeName(question.title)}"
            ${question.isRequired ? "required" : ""}
          />
        `;
        break;

      case "paragraph":
        html += `
          <textarea
            name="${escapeName(question.title)}"
            ${question.isRequired ? "required" : ""}
          ></textarea>
        `;
        break;

      case "checkbox":
        if (Array.isArray(question.options)) {
          question.options.forEach((option, optIndex) => {
            html += `
              <div>
                <label>
                  <input
                    type="radio"
                    name="${escapeName(question.title)}"
                    value="${escapeName(option)}"
                    ${hasConditionalLogic ? `onchange="handleConditionalLogic('${questionId}', '${escapeName(option)}')"` : ""}
                  />
                  ${option}
                </label>
              </div>
            `;
          });
        }
        break;

      case "multiple_choice":
        if (Array.isArray(question.options)) {
          question.options.forEach((option, optIndex) => {
            html += `
              <div>
                <label>
                  <input
                    type="checkbox"
                    name="${escapeName(question.title)}"
                    value="${escapeName(option)}"
                    ${hasConditionalLogic ? `onchange="handleConditionalLogic('${questionId}', '${escapeName(option)}')"` : ""}
                  />
                  ${option}
                </label>
              </div>
            `;
          });
        }
        break;

      case "dropdown":
        html += `
          <select
            name="${escapeName(question.title)}"
            ${question.isRequired ? "required" : ""}
            ${hasConditionalLogic ? `onchange="handleConditionalLogic('${questionId}', this.value)"` : ""}
          >
          <option value="">Please select...</option>
        `;
        if (Array.isArray(question.options)) {
          question.options.forEach(option => {
            html += `
              <option value="${escapeName(option)}">${option}</option>
            `;
          });
        }
        html += `</select>`;
        break;

      default:
        // Fallback for unknown question types
        html += `
          <input
            type="text"
            name="${escapeName(question.title)}"
            ${question.isRequired ? "required" : ""}
          />
        `;
        break;
    }

    // If not the first question, show a "Back" button
    if (idx > 0) {
      html += `
        <div>
          <button
            type="button"
            onclick="goToQuestion(${idx}, ${idx - 1}, ${formData.questions.length})"
          >
            Back
          </button>
        </div>
      `;
    }

    // If not the last question, show a "Next" button
    if (idx < formData.questions.length - 1) {
      html += `
        <div>
          <button
            type="button"
            onclick="goToQuestion(${idx}, ${idx + 1}, ${formData.questions.length})"
          >
            Next
          </button>
        </div>
      `;
    } else {
      // Last question gets a "Finish" button (submit)
      html += `
        <div>
          <button type="submit">Finish</button>
        </div>
      `;
    }

    html += `</div>\n`; // close question div
  });

  return html;
}


// Build a block of radio inputs
function buildRadio(line) {
  return `
    <div class="block">
      <label>${line}</label>
      <div>
        <label><input type="radio" name="${escapeName(line)}" /> Option A</label><br/>
        <label><input type="radio" name="${escapeName(line)}" /> Option B</label><br/>
        <label><input type="radio" name="${escapeName(line)}" /> Option C</label>
      </div>
    </div>
  `;
}

// Build a block of checkbox inputs
function buildCheckboxes(line) {
  return `
    <div class="block">
      <label>${line}</label>
      <div>
        <label><input type="checkbox" name="${escapeName(line)}" /> Option 1</label><br/>
        <label><input type="checkbox" name="${escapeName(line)}" /> Option 2</label><br/>
        <label><input type="checkbox" name="${escapeName(line)}" /> Option 3</label>
      </div>
    </div>
  `;
}

// Build a generic text field or textarea
function buildTextField(line) {
  return `
    <div class="block">
      <label>${line}</label><br/>
      <textarea name="${escapeName(line)}"></textarea>
    </div>
  `;
}

// Turn the line into a safe name attribute
function escapeName(str) {
  return str
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

app.listen(PORT, () => {
  console.log("Server listening on http://localhost:" + PORT);
});
