const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFParser = require("pdf2json");
const dotenv = require('dotenv')
const { CosmosClient } = require("@azure/cosmos");

require('dotenv').config()  

const cosmosClient = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY
});

const cosmosDb = cosmosClient.database(process.env.COSMOS_DATABASE);
const formsContainer = cosmosDb.container(process.env.COSMOS_FORMS_CONTAINER);
const baseFormDocId = process.env.COSMOS_BASE_FORM_ID;

const app = express();
const PORT = 8080;

// Our global qualification → subject map
const qualificationMap = {};

   
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);                     // ← ignore accidental blanks

/* -------------- isAdmin (updated) -------------- */
function isAdmin(req) {
  /* 1️⃣  email from query-string or custom header */
  let email =
    (req.query.email ||
     req.headers["x-user-email"] ||
     "").toLowerCase();

  /* 2️⃣  Azure App Service / Static Web Apps headers */
  if (!email && req.headers["x-ms-client-principal-name"]) {
    email = req.headers["x-ms-client-principal-name"].toLowerCase();
  }

  /* 3️⃣  Azure EasyAuth – decode base64 JSON blob */
  if (!email && req.headers["x-ms-client-principal"]) {
    try {
      const buf   = Buffer.from(req.headers["x-ms-client-principal"], "base64");
      const princ = JSON.parse(buf.toString("utf8"));
      if (princ && princ.userDetails) {
        email = princ.userDetails.toLowerCase();
      }
    } catch {/* ignore malformed header */}
  }

  /* 4️⃣  final decision */
  if (email) return ADMIN_EMAILS.includes(email);

  /* Safety-net: only auto-admin when *exactly* one address configured */
  return ADMIN_EMAILS.length === 1;
}

    console.log("Using container:", process.env.COSMOS_FORMS_CONTAINER);
    
    const baseFormPk = process.env.COSMOS_BASE_FORM_PK || baseFormDocId;

    async function loadBaseForm() {
      try {
        const { resource } = await formsContainer
          .item(baseFormDocId, baseFormPk)   // id + correct PK
          .read();

        if (!resource) throw new Error(`Doc '${baseFormDocId}' not found`);
        return resource;
      } catch (err) {
        console.error("Cosmos loadBaseForm failed:", err);
        return { questions: [] };
      }
    }

    async function saveBaseForm(data) {
      data.id = baseFormDocId;
      // make sure the PK attribute is set too
      if (!process.env.COSMOS_BASE_FORM_PK) data.id = baseFormDocId;
      else data[process.env.COSMOS_BASE_FORM_PK_PATH || "id"] = baseFormPk;

      await formsContainer.items.upsert(data);
    }

    console.log("Reading base form: id =", baseFormDocId, "pk =", baseFormPk);
        
    /* ---------- 2) ROLE END‑POINTS ---------- */
    
    // simple “am I admin?” ping
    app.get("/api/isAdmin", (req, res) => {
      res.json({ isAdmin: isAdmin(req) });
    });
    
    // list every question (so the editor can draw a table)
    app.get("/api/questions", async (req, res) => {
      if (!isAdmin(req)) return res.status(403).send("Forbidden");
    
      const baseForm = await loadBaseForm();         // ← from Cosmos
      res.json(baseForm.questions || []);
    });
    
    app.put("/api/questions/:id", async (req, res) => {
      if (!isAdmin(req)) return res.status(403).send("Forbidden");
    
      /* helper meta from the editor so we can locate the right doc */
      const { qualification, subject } = req.body._meta || {};
      delete req.body._meta;
    
      const questionId = req.params.id;
      let   updated    = false;                  // did we touch anything?
    
      try {
        /* ───────────────────────────── 1) BASE FORM ───────────────────────────── */
        const baseForm = await loadBaseForm();
        const baseIdx  = baseForm.questions.findIndex(q => q.id === questionId);
    
        if (baseIdx !== -1) {
          const existing = baseForm.questions[baseIdx];
          const merged   = { ...existing, ...req.body };
    
          /* merge conditionalLogic – KEEP blanks */
          const map = {};
          (existing.conditionalLogic || []).forEach(r => {
            map[r.option] = r.goToQuestion ?? "";
          });
          (req.body.conditionalLogic || []).forEach(r => {
            if (r?.option) map[r.option] = r.goToQuestion ?? "";
          });
          merged.conditionalLogic = Object.entries(map)
            .map(([option, goToQuestion]) => ({ option, goToQuestion }));
    
          baseForm.questions[baseIdx] = merged;
          await saveBaseForm(baseForm);
          updated = true;
        }
    
        /* ──────────────────── 2) QUALIFICATION-SPECIFIC ADD-ON ────────────────── */
        if (qualification && subject) {
          /* which container holds this qualification? */
          const qContainerId =
            (qualificationMap[qualification] &&
             qualificationMap[qualification].__container) || qualification;
    
          const qContainer = cosmosDb.container(qContainerId);
    
          /* fetch all docs in that container that have formsData */
          const { resources } = await qContainer.items
            .query("SELECT * FROM c WHERE IS_DEFINED(c.formsData)")
            .fetchAll();
    
          if (resources.length) {
            const doc = resources[0];                          // first one is ours
            const subjKey = Object.keys(doc.formsData || {})
              .find(k => k.toLowerCase() === subject.toLowerCase());
            const subjectArr = subjKey ? doc.formsData[subjKey] : null;
    
            if (Array.isArray(subjectArr)) {
              const idx = subjectArr.findIndex(q => q.id === questionId);
              if (idx !== -1) {
                const existingQ = subjectArr[idx];
                const mergedQ   = { ...existingQ, ...req.body };
    
                /* merge conditionalLogic – KEEP blanks */
                const cmap = {};
                (existingQ.conditionalLogic || []).forEach(r => {
                  cmap[r.option] = r.goToQuestion ?? "";
                });
                (req.body.conditionalLogic || []).forEach(r => {
                  if (r?.option) cmap[r.option] = r.goToQuestion ?? "";
                });
                mergedQ.conditionalLogic = Object.entries(cmap)
                  .map(([option, goToQuestion]) => ({ option, goToQuestion }));
    
                subjectArr[idx] = mergedQ;
                await qContainer.items.upsert(doc);            // save back
                updated = true;
              }
            }
          }
        }
    
        /* ───────────────────────────── 3) RESPONSE ───────────────────────────── */
        if (updated) {
          return res.json({ ok: true });
        }
        res.status(404).send("Question not found in any form data");
      } catch (err) {
        console.error("[PUT /api/questions] update failed:", err);
        res.status(500).send("Update failed: " + err.message);
      }
    });

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
   async function loadJsonInfo() {
    /* reset the in-memory map */
    Object.keys(qualificationMap).forEach(k => delete qualificationMap[k]);
  
    try {
      /* pull every container in the database */
      const { resources: containers } = await cosmosDb.containers.readAll().fetchAll();
      console.log("[loadJsonInfo] containers found:", containers.map(c => c.id));
  
      for (const { id: containerId } of containers) {
        /* the base “form” container only holds the core question-set – skip it */
        if (containerId === process.env.COSMOS_FORMS_CONTAINER) continue;
  
        const container = cosmosDb.container(containerId);
        const { resources: docs } = await container.items
          .query("SELECT c.id, c.title, c.qualification, c.formsData FROM c WHERE IS_DEFINED(c.formsData)")
          .fetchAll();
  
        console.log(`[loadJsonInfo] ${containerId}: ${docs.length} doc(s)`);
  
        docs.forEach(doc => {
          /* choose the most useful handle for the qualification */
          const qualification = (doc.qualification || doc.title || doc.id || "").trim();
          if (!qualification) return;
  
          if (!qualificationMap[qualification]) qualificationMap[qualification] = {};
          qualificationMap[qualification].__title     = doc.title || qualification;
          qualificationMap[qualification].__container = containerId;         // 👈 remember where it lives
  
          /* subject → container mapping (optional, kept for completeness) */
          Object.keys(doc.formsData || {}).forEach(subjectKey => {
            if (Array.isArray(doc.formsData[subjectKey])) {
              qualificationMap[qualification][subjectKey] = containerId;
            }
          });
        });
      }
  
      console.log("[loadJsonInfo] final qualificationMap:", qualificationMap);
    } catch (err) {
      console.error("Cosmos-DB loadJsonInfo failed:", err);
    }
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
app.get("/api/qualifications", async (_req, res) => {
  /* if the cache is empty (first call right after boot) */
  if (Object.keys(qualificationMap).length === 0) {
    await loadJsonInfo();
  }

  const list = Object.keys(qualificationMap).map(k => ({
    qualification: k,
    title: qualificationMap[k].__title || k
  }));

  console.log("[/api/qualifications] returning", list.length, "items");
  res.json(list);
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
app.get("/api/formSnippet", async (req, res) => {
  const { qualification, subject } = req.query;
  if (!qualification || !subject) {
    return res.status(400).send("Missing qualification or subject.");
  }

  try {
    /* 1️⃣ — start with the base question set stored in the “form” container */
    const formData = await loadBaseForm();          // { questions:[…] }

    /* 2️⃣ — merge in the qualification-specific add-on (if any) */
    if (qualification !== "default") {
      const qContainerId =
        (qualificationMap[qualification] &&
         qualificationMap[qualification].__container) ||
        qualification;                              // fallback

      const qContainer   = cosmosDb.container(qContainerId);
      const { resources } = await qContainer.items
        .query("SELECT * FROM c WHERE IS_DEFINED(c.formsData)")
        .fetchAll();

      console.log(`[formSnippet] ${qContainerId}: fetched ${resources.length} doc(s)`);

      if (resources.length) {
        const qDoc       = resources[0];
        const formsData  = qDoc.formsData || {};
        const subjectArr = formsData[subject] || formsData[subject.toLowerCase()];
        if (Array.isArray(subjectArr)) {
          formData.questions = formData.questions.concat(subjectArr);
        }
      }
    }

    /* 3️⃣ — prompt arrays (try local prompt.json, but keep going if it’s gone) */
    let promptData = {};
    try {
      const promptPath = path.join(__dirname, "./public/assets/JSON/prompt.json");
      promptData       = JSON.parse(fs.readFileSync(promptPath, "utf8"));
      console.log("[formSnippet] loaded prompt.json");
    } catch (err) {
      console.warn("[formSnippet] prompt.json not found – using empty prompt arrays");
      promptData = {};              // fall back to empty object
    }

    const q2Attr  = JSON.stringify(promptData.q2  || []).replace(/"/g, "&quot;");
    const q3Attr  = JSON.stringify(promptData.q3  || []).replace(/"/g, "&quot;");
    const q6Attr  = JSON.stringify(promptData.q6  || []).replace(/"/g, "&quot;");
    const q7Attr  = JSON.stringify(promptData.q7  || []).replace(/"/g, "&quot;");
    const q10Attr = JSON.stringify(promptData.q10 || []).replace(/"/g, "&quot;");
    const q11Attr = JSON.stringify(promptData.q11 || []).replace(/"/g, "&quot;");

    /* 4️⃣ — build the snippet (unchanged) */
    const formHtml = buildForm(formData);

    const conditionalLogicMap = {};
    formData.questions.forEach((q, idx) => {
      if (Array.isArray(q.conditionalLogic)) {
        conditionalLogicMap[q.id || `question-${idx}`] =
          q.conditionalLogic.map(r => ({
            option: escapeName(r.option),
            targetId: r.goToQuestion || ""
          }));
      }
    });

    const questionIndexMap = {};
    formData.questions.forEach((q, idx) => {
      if (q.id) questionIndexMap[q.id] = idx;
    });

    /* 4️⃣ — build the snippet  (<<< replace the whole const snippet = …) */
  const snippet = `
<!--  MAIN QUESTION CONTAINER  -->
<div class="styled-form-container"
     data-logicmap='${JSON.stringify(conditionalLogicMap)}'
     data-questionindexmap='${JSON.stringify(questionIndexMap)}'
     data-totalquestions='${formData.questions.length}'
     data-q2prompts="${q2Attr}"
     data-q3prompts="${q3Attr}"
     data-q6prompts="${q6Attr}"
     data-q7prompts="${q7Attr}"
     data-q10prompts="${q10Attr}"
     data-q11prompts="${q11Attr}">

  <h2>${qualification} ${subject}</h2>
  <form>
    ${formHtml}                       <!-- all questions inc. q38 -->
  </form>
</div>


<!--  FINAL PROMPT — appears after q38 -->
<div class="styled-form-container"
     id="final-prompt-container"
     style="display:none; margin-top:40px;">
  <h2>Your Final Prompt</h2>
  <p class="final-note">
    (You’ll upload any accompanying document when you send the prompt to the AI.)
  </p>

  <textarea id="final-prompt-textarea" rows="10"></textarea>
  <button id="copy-prompt-btn" class="subject-btn">Copy prompt</button>
</div>


`;


    res.send(snippet);
  } catch (err) {
    console.error("[formSnippet] failed:", err);
    res.status(500).send("Failed to build form snippet: " + err.message);
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
/* ------------------------------------------------------------------
 *  SERVER-SIDE  – build the HTML for the one-page form
 * ------------------------------------------------------------------ */
function buildForm(formData) {
  if (!formData.questions) return "";
  let html = "";

  /* ───────────────────────────── QUESTIONS ───────────────────────────── */
  formData.questions.forEach((question, idx) => {
    const containerId = question.id || `question-${idx}`;
    const hiddenStyle = idx === 0 ? "" : 'style="display:none;"';

    html += `<div class="question-block" id="${containerId}" ${hiddenStyle}>`;
    html +=   `<div class="question-title">${question.title}</div>`;

    if (question.info) {
      html += `<p class="question-info">${question.info}</p>`;
    }

    /* render inputs for every question EXCEPT q38 */
    if (question.id !== "q38") {
      const hasOpts = Array.isArray(question.options);

      if (hasOpts && question.type === "dropdown") {
        html += `<select class="answer-select" name="${escapeName(question.title)}"
                         ${question.isRequired ? "required" : ""}>
                   <option value="">Please select...</option>`;
        question.options.forEach(opt => {
          html += `<option value="${escapeName(opt)}">${opt}</option>`;
        });
        html += `</select>`;

      } else if (hasOpts) {
        const inputType = question.type === "checkbox" ? "checkbox" : "radio";
        question.options.forEach((opt, optIdx) => {
          const uid = `${containerId}-opt${optIdx}`;
          html += `
            <div class="answer-option">
              <label class="answer-box" for="${uid}">
                <input  type="${inputType}" id="${uid}"
                        name="${escapeName(question.title)}"
                        value="${escapeName(opt)}"
                        ${question.isRequired ? "required" : ""}/>
                <span>${opt}</span>
              </label>
            </div>`;
        });

      } else if (question.type === "short_answer") {
        html += `<input  class="answer-text"  type="text"
                         name="${escapeName(question.title)}"
                         ${question.isRequired ? "required" : ""}/>`;

      } else if (question.type === "paragraph") {
        html += `<textarea class="answer-textarea"
                           name="${escapeName(question.title)}"
                           ${question.isRequired ? "required" : ""}></textarea>`;

      } else {
        html += `<input  class="answer-text" type="text"
                         name="${escapeName(question.title)}"
                         ${question.isRequired ? "required" : ""}/>`;
      }
    }

    /* ---------- NAVIGATION BUTTONS ---------- */
    html += `<div class="nav-arrows">`;
    if (idx > 0) {
      const prev = formData.questions[idx - 1].id || `question-${idx - 1}`;
      html += `<button type="button" class="nav-btn subject-btn"
                       onclick="goToQuestionAsync('${containerId}','${prev}',true)">
                 ← Back
               </button>`;
    }
    if (idx < formData.questions.length - 1) {
      const next = formData.questions[idx + 1].id || `question-${idx + 1}`;
      html += `<button type="button" class="nav-btn subject-btn"
                       onclick="goToQuestionAsync('${containerId}','${next}',false)">
                 Next →
               </button>`;
    } else {
      html += `<button type="submit" class="nav-btn subject-btn">Finish</button>`;
    }
    html += `</div></div>\n`;   /* close .question-block */
  });

  return html;
}

  
  function escapeName(str) {
    return str
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
  }