// We want to find an assignment of offsets (0 to 6) to the 20 employees:
// - 6 female seniors (FS0..FS5)
// - 7 male seniors (MS0..MS6)
// - 3 female juniors (FJ0..FJ2)
// - 4 male juniors (MJ0..MJ3)
//
// Constraints:
// For any choice of:
// - 2 female seniors (out of 6)
// - 2 male seniors (out of 7)
// - 1 female junior (out of 3)
// - 1 male junior (out of 4)
// (Total 6 members on night team: 3 females, 3 males)
//
// We must have:
// 1. Total working staff on night shift >= 3 on all 7 days of the week.
// 2. Working female staff on night shift >= 1 on all 7 days of the week.

const FS = [0,1,2,3,4,5];
const MS = [0,1,2,3,4,5,6];
const FJ = [0,1,2];
const MJ = [0,1,2,3];

// Precompute all combinations of night teams (indices)
const teamCombs = [];
for (let fs1 = 0; fs1 < 6; fs1++) {
  for (let fs2 = fs1 + 1; fs2 < 6; fs2++) {
    for (let ms1 = 0; ms1 < 7; ms1++) {
      for (let ms2 = ms1 + 1; ms2 < 7; ms2++) {
        for (let fj = 0; fj < 3; fj++) {
          for (let mj = 0; mj < 4; mj++) {
            teamCombs.push({ fs1, fs2, ms1, ms2, fj, mj });
          }
        }
      }
    }
  }
}
console.log(`Total team combinations to check: ${teamCombs.length}`);

// Backtracking search
const fsOffsets = Array(6).fill(0);
const msOffsets = Array(7).fill(0);
const fjOffsets = Array(3).fill(0);
const mjOffsets = Array(4).fill(0);

let found = false;

// We can assign offsets to FS, FJ first, and check female constraint
const searchFS = (idx) => {
  if (idx === 6) {
    searchFJ(0);
    return;
  }
  for (let o = 0; o < 7; o++) {
    fsOffsets[idx] = o;
    searchFS(idx + 1);
    if (found) return;
  }
};

const checkFemaleCoverage = (o1, o2, o3) => {
  for (let day = 0; day < 7; day++) {
    let working = 0;
    if ((day + o1) % 7 < 5) working++;
    if ((day + o2) % 7 < 5) working++;
    if ((day + o3) % 7 < 5) working++;
    if (working < 1) return false;
  }
  return true;
};

const checkAllFemaleCombs = () => {
  for (let fs1 = 0; fs1 < 6; fs1++) {
    for (let fs2 = fs1 + 1; fs2 < 6; fs2++) {
      for (let fj = 0; fj < 3; fj++) {
        if (!checkFemaleCoverage(fsOffsets[fs1], fsOffsets[fs2], fjOffsets[fj])) {
          return false;
        }
      }
    }
  }
  return true;
};

const searchFJ = (idx) => {
  if (idx === 3) {
    if (checkAllFemaleCombs()) {
      // Now search MS and MJ
      searchMS(0);
    }
    return;
  }
  for (let o = 0; o < 7; o++) {
    fjOffsets[idx] = o;
    searchFJ(idx + 1);
    if (found) return;
  }
};

const checkFullCoverage = (fs1, fs2, ms1, ms2, fj, mj) => {
  const o = [
    fsOffsets[fs1],
    fsOffsets[fs2],
    msOffsets[ms1],
    msOffsets[ms2],
    fjOffsets[fj],
    mjOffsets[mj]
  ];
  for (let day = 0; day < 7; day++) {
    let working = 0;
    for (let i = 0; i < 6; i++) {
      if ((day + o[i]) % 7 < 5) working++;
    }
    if (working < 3) return false;
  }
  return true;
};

const searchMS = (idx) => {
  if (idx === 7) {
    searchMJ(0);
    return;
  }
  for (let o = 0; o < 7; o++) {
    msOffsets[idx] = o;
    searchMS(idx + 1);
    if (found) return;
  }
};

const searchMJ = (idx) => {
  if (idx === 4) {
    // Check all combinations
    let ok = true;
    for (const comb of teamCombs) {
      if (!checkFullCoverage(comb.fs1, comb.fs2, comb.ms1, comb.ms2, comb.fj, comb.mj)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      console.log("Found valid assignment!");
      console.log("FS offsets:", fsOffsets);
      console.log("FJ offsets:", fjOffsets);
      console.log("MS offsets:", msOffsets);
      console.log("MJ offsets:", mjOffsets);
      found = true;
    }
    return;
  }
  for (let o = 0; o < 7; o++) {
    mjOffsets[idx] = o;
    searchMJ(idx + 1);
    if (found) return;
  }
};

searchFS(0);
if (!found) {
  console.log("No valid assignment exists.");
}
