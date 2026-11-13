const defaults = {
  letter: { 1: 2, 2: 3, 3: 5, 4: 3, 5: 4, 6: 7, 7: 8,  8: 10 },
  a4:     { 1: 3, 2: 4, 3: 5, 4: 4, 5: 7, 6: 8, 7: 10, 8: 12 },
  long:   { 1: 3, 2: 4, 3: 5, 4: 4, 5: 7, 6: 8, 7: 10, 8: 12 }
};

const names = {
  1: "Plain B&W text",
  2: "B&W text with table or lines",
  3: "B&W with photo or dark areas",
  4: "Color at the top only",
  5: "Color chart or table",
  6: "Six slides per page",
  7: "Colored flyer or certificate",
  8: "Full-color photo"
};

// use saved prices if there are any, otherwise the defaults
const saved = localStorage.getItem("prices");
const prices = saved ? JSON.parse(saved) : defaults;

// build one table row per level
const tbody = document.querySelector("#table tbody");
for (let level = 1; level <= 8; level++) {
  tbody.innerHTML +=
    `<tr>
       <td><img src="images/level${level}.svg" width="60"></td>
       <td>${level}. ${names[level]}</td>
       <td><input type="number" min="0" data-size="letter" data-level="${level}" value="${prices.letter[level]}"></td>
       <td><input type="number" min="0" data-size="a4" data-level="${level}" value="${prices.a4[level]}"></td>
       <td><input type="number" min="0" data-size="long" data-level="${level}" value="${prices.long[level]}"></td>
     </tr>`;
}

// save: read every box and store the result
document.getElementById("save").addEventListener("click", function () {
  const result = { letter: {}, a4: {}, long: {} };
  document.querySelectorAll("input").forEach(function (box) {
    result[box.dataset.size][box.dataset.level] = Number(box.value);
  });
  localStorage.setItem("prices", JSON.stringify(result));
  document.getElementById("msg").textContent = "Saved.";
});

// reset: delete the saved prices and reload
document.getElementById("reset").addEventListener("click", function () {
  localStorage.removeItem("prices");
  location.reload();
});