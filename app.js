const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFParser = require("pdf2json");

const app = express();
const PORT = 3000;

const qualificationMap = {};

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

// GET /editForm => parse PDF with pdf2json, build an HTML form
app.get("/editForm", async (req, res) => {
  const { qualification, subject } = req.query;
  if (!qualification || !subject) {
    return res.status(400).send("Missing qualification or subject.");
  }
  const pdfFile = qualificationMap[qualification]?.[subject];
  if (!pdfFile) {
    return res.status(404).send("No PDF found for that qualification + subject!");
  }
  const pdfPath = path.join(__dirname, "pdf", pdfFile);

  try {
    const pdfData = await parsePdf(pdfPath);

    // 1) Convert pdf2json data to array-of-lines for each page
    const pagesLines = extractLines(pdfData);

    // 2) Build HTML form from those lines
    const formHtml = buildForm(pagesLines);

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
          <h1>Editing PDF: ${qualification} - ${subject}</h1>
          <form>
            ${formHtml}
            <button type="button" onclick="alert('Form Saved (demo)')">Save Changes</button>
          </form>
          <p><a href="/">Return Home</a></p>
        </div>
      </body>
      </html>
    `;
    res.send(pageHtml);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to parse PDF: " + err);
  }
});

// pdf2json parse helper
function parsePdf(pdfPath) {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();
    parser.on("pdfParser_dataError", err => reject(err.parserError));
    parser.on("pdfParser_dataReady", pdfData => resolve(pdfData));
    parser.loadPDF(pdfPath);
  });
}

/**
 * Group text objects in each page by Y coordinate, then sort by X,
 * then combine into lines of text.  Returns array-of-pages, each page is array of lines.
 */
function extractLines(pdfData) {
  const result = [];
  pdfData.Pages.forEach(page => {
    const lineMap = {};

    page.Texts.forEach(t => {
      // decode text from each chunk
      const chunk = t.R.map(r => decodeURIComponent(r.T)).join("");
      const x = t.x;
      const y = t.y;

      // Rounding or tolerance for y
      const roundedY = Math.floor(y); 
      // or you could do a custom tolerance check

      if (!lineMap[roundedY]) {
        lineMap[roundedY] = [];
      }
      lineMap[roundedY].push({ x, text: chunk });
    });

    // Now build final lines in ascending order of Y
    const lines = [];
    const yKeys = Object.keys(lineMap).map(Number).sort((a, b) => a - b);

    yKeys.forEach(yVal => {
      // sort all chunks in this line by x
      const row = lineMap[yVal].sort((a,b) => a.x - b.x);
      // combine text with a space
      const lineStr = row.map(o => o.text).join(" ").trim();
      if (lineStr) {
        lines.push(lineStr);
      }
    });

    result.push(lines);
  });
  return result;
}

/**
 * Build the final form HTML from the lines of each page
 * pagesLines is array-of-pages, each item is array of lines (strings)
 */
function buildForm(pagesLines) {
  let html = "";
  pagesLines.forEach((lines, pageIndex) => {
    html += `<h2>Page ${pageIndex + 1}</h2>`;
    lines.forEach(line => {
      // "Mark only one oval." => radio
      // "Check all that apply." => checkboxes
      // else => text
      if (line.includes("Mark only one oval")) {
        html += buildRadio(line);
      } else if (line.includes("Check all that apply")) {
        html += buildCheckboxes(line);
      } else {
        html += buildTextField(line);
      }
    });
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
  return str.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

app.listen(PORT, () => {
  console.log("Server listening on http://localhost:" + PORT);
});
