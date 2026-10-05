pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// ---- 1. PRICES (php per page). Edit here when rates change. ----
const defaults = {
  letter: { 1: 2, 2: 3, 3: 5, 4: 3, 5: 4, 6: 7, 7: 8,  8: 10 },
  a4:     { 1: 3, 2: 4, 3: 5, 4: 4, 5: 7, 6: 8, 7: 10, 8: 12 },
  long:   { 1: 3, 2: 4, 3: 5, 4: 4, 5: 7, 6: 8, 7: 10, 8: 12 }
};

// use the prices saved on the settings page, if there are any
const savedPrices = localStorage.getItem("prices");
const prices = savedPrices ? JSON.parse(savedPrices) : defaults;

// ---- 2. CUTOFFS (first guesses. Tune these with real pages) ----
const CUT = {
  colorPage: 0.02,                 // color share above this = a color page
  bw: [0.06, 0.18],                // B&W ink below 6% = level 1, below 18% = level 2, else 3
  color: [0.10, 0.22, 0.38, 0.60]  // color share below each = level 4, 5, 6, 7, else 8
};

function getLevel(ink, color) {
  if (color < CUT.colorPage) return ink < CUT.bw[0] ? 1 : ink < CUT.bw[1] ? 2 : 3;
  const i = CUT.color.findIndex(c => color < c);
  return i === -1 ? 8 : 4 + i;
}

// Paper sizes in points (1 point = 1/72 inch)
const PAGE = { letter: [612, 792], a4: [595, 842], long: [612, 936] };

// Match the PDF page size to Letter, A4 or Long
function detectSize(w, h) {
  const a = Math.min(w, h), b = Math.max(w, h);
  let best = "letter", diff = Infinity;
  for (const k in PAGE) {
    const d = Math.abs(a - PAGE[k][0]) + Math.abs(b - PAGE[k][1]);
    if (d < diff) { diff = d; best = k; }
  }
  return best;
}

// Measure ink and color of whatever is drawn on a canvas
function measure(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const n = d.length / 4;
  let ink = 0, colored = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    ink += 1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255;          // how dark this pixel is
    if (Math.max(r, g, b) - Math.min(r, g, b) > 40) colored++;     // strongly colored pixel
  }
  return { ink: ink / n, color: colored / n };
}

// A PDF page: draw it on a hidden canvas, then measure it
async function analyzePage(page) {
  const vp = page.getViewport({ scale: 0.75 });
  const canvas = document.createElement("canvas");
  canvas.width = vp.width;
  canvas.height = vp.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return measure(canvas);
}

// An image: fit it onto a blank page of the chosen paper size, then measure it
async function analyzeImage(file) {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();

  const [pw, ph] = PAGE[$("size").value];
  const canvas = document.createElement("canvas");
  canvas.width = pw * 0.75;
  canvas.height = ph * 0.75;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
  const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);

  URL.revokeObjectURL(img.src);
  return measure(canvas);
}

// ---- 3. PAGE LOGIC ----
const $ = id => document.getElementById(id);
let pages = [];

$("file").addEventListener("change", e => {
  handleFile(e.target.files[0]);
  e.target.value = "";   // lets you choose the same file again
});

async function handleFile(file) {
  if (!file) return;

  pages = [];
  $("cards").innerHTML = "";
  $("total").textContent = "";

  // Word, PowerPoint, Excel: the real print layout only exists in a PDF
  if (/\.(docx?|pptx?|xlsx?)$/i.test(file.name)) {
    $("status").textContent =
      "Open this file and save it as PDF first (File > Save As > PDF). " +
      "For PowerPoint with several slides per page: File > Export > Create PDF > Options > Publish what: Handouts. Then choose the PDF here.";
    return;
  }

  $("status").textContent = "Reading pages...";
  try {
    if (file.type.startsWith("image/")) {
      const r = await analyzeImage(file);
      pages.push({ ...r, level: getLevel(r.ink, r.color) });
    } else {
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        if (n === 1) {
          const v = page.getViewport({ scale: 1 });
          $("size").value = detectSize(v.width, v.height);
        }
        const r = await analyzePage(page);
        pages.push({ ...r, level: getLevel(r.ink, r.color) });
      }
    }
    $("status").textContent = pages.length + " page(s) analyzed. You can change any page's level.";
    render();
  } catch (err) {
    $("status").textContent = "Could not read this file. Use a PDF or an image.";
    console.error(err);
  }
};

function render() {
  const size = $("size").value;
  const copies = Math.max(1, Number($("copies").value) || 1);
  const box = $("cards");
  box.innerHTML = "";
  let sum = 0;

  pages.forEach((p, i) => {
    const price = prices[size][p.level];
    sum += price;
    const opts = [1, 2, 3, 4, 5, 6, 7, 8]
      .map(l => `<option value="${l}" ${l === p.level ? "selected" : ""}>${l}</option>`)
      .join("");
    box.insertAdjacentHTML("beforeend",
      `<div class="card">
         <h3>Page ${i + 1}</h3>
         <p>Ink ${(p.ink * 100).toFixed(1)}%</p>
         <p>Color ${(p.color * 100).toFixed(1)}%</p>
         <select data-i="${i}">${opts}</select>
         <div class="price">₱${price}</div>
       </div>`);
  });

  $("total").textContent = `Total: ₱${sum * copies} (${pages.length} pages × ${copies} copies)`;
}

// Staff can override a page's level from the dropdown
$("cards").addEventListener("change", e => {
  if (e.target.dataset.i !== undefined) {
    pages[e.target.dataset.i].level = Number(e.target.value);
    render();
  }
});

$("size").addEventListener("change", render);
$("copies").addEventListener("input", render);

// ---- 4. DRAG AND DROP ----
const drop = $("drop");

// stop the browser from opening the file itself when it is dropped
["dragover", "drop"].forEach(ev =>
  window.addEventListener(ev, e => e.preventDefault())
);

drop.addEventListener("dragover", () => drop.classList.add("over"));
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", e => {
  drop.classList.remove("over");
  handleFile(e.dataTransfer.files[0]);
});
drop.addEventListener("click", () => $("file").click());