// We want to find an assignment of offsets (0 to 6) to the 6 female seniors
// and 3 female juniors such that for any choice of 2 female seniors and 1 female junior,
// their off-days are completely disjoint (i.e. at most 1 is off on any day).

const checkDisjoint = (o1, o2, o3) => {
  const offDays = new Set();
  const pairs = [
    [(5 - o1 + 14) % 7, (6 - o1 + 14) % 7],
    [(5 - o2 + 14) % 7, (6 - o2 + 14) % 7],
    [(5 - o3 + 14) % 7, (6 - o3 + 14) % 7]
  ];

  for (const pair of pairs) {
    if (offDays.has(pair[0]) || offDays.has(pair[1])) {
      return false;
    }
    offDays.add(pair[0]);
    offDays.add(pair[1]);
  }
  return true;
};

// Search all assignments
const seniorsOffsets = Array(6).fill(0);
const juniorsOffsets = Array(3).fill(0);
let found = false;

const searchS = (idx) => {
  if (idx === 6) {
    searchJ(0);
    return;
  }
  for (let o = 0; o < 7; o++) {
    seniorsOffsets[idx] = o;
    searchS(idx + 1);
    if (found) return;
  }
};

const searchJ = (idx) => {
  if (idx === 3) {
    // Check all combinations of 2 seniors and 1 junior
    let ok = true;
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) {
        for (let k = 0; k < 3; k++) {
          if (!checkDisjoint(seniorsOffsets[i], seniorsOffsets[j], juniorsOffsets[k])) {
            ok = false;
            break;
          }
        }
        if (!ok) break;
      }
      if (!ok) break;
    }
    if (ok) {
      console.log("Found valid assignment!");
      console.log("Seniors offsets:", seniorsOffsets);
      console.log("Juniors offsets:", juniorsOffsets);
      found = true;
    }
    return;
  }
  for (let o = 0; o < 7; o++) {
    juniorsOffsets[idx] = o;
    searchJ(idx + 1);
    if (found) return;
  }
};

searchS(0);
if (!found) {
  console.log("No valid assignment exists where off-days are completely disjoint for all combinations.");
}
