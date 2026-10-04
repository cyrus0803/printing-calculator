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

// Match the PDF page size (in points) to Letter, A4 or Long
function detectSize(w, h) {
  const a = Math.min(w, h), b = Math.max(w, h);
  const sizes = { letter: [612, 792], a4: [595, 842], long: [612, 936] };
  let best = "letter", diff = Infinity;
  for (const k in sizes) {
    const d = Math.abs(a - sizes[k][0]) + Math.abs(b - sizes[k][1]);
    if (d < diff) { diff = d; best = k; }
  }
  return best;
}

// Draw the page on a hidden canvas, then measure ink and color
async function analyzePage(page) {
  const vp = page.getViewport({ scale: 0.75 });
  const canvas = document.createElement("canvas");
  canvas.width = vp.width;
  canvas.height = vp.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;

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

// ---- 3. PAGE LOGIC ----
const $ = id => document.getElementById(id);
let pages = [];

$("file").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  $("status").textContent = "Reading pages...";
  try {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      if (n === 1) {
        const v = page.getViewport({ scale: 1 });
        $("size").value = detectSize(v.width, v.height);
      }
      const r = await analyzePage(page);
      pages.push({ ...r, level: getLevel(r.ink, r.color) });
    }
    $("status").textContent = pdf.numPages + " page(s) analyzed. You can change any page's level.";
    render();
  } catch (err) {
    $("status").textContent = "Could not read this file. Make sure it is a PDF.";
    console.error(err);
  }
});

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