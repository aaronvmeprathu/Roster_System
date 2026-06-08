import { employeeSeed } from "./src/data/employees.js";
import { formatDateString, addMonths } from "./src/utils/scheduler.js";

const sortByName = (employees) => [...employees].sort((left, right) => left.name.localeCompare(right.name));

const employees14 = employeeSeed.filter(emp => 
  ["EMP001", "EMP002", "EMP003", "EMP004", "EMP005", "EMP006", "EMP007", "EMP008",
   "EMP014", "EMP015", "EMP016", "EMP017", "EMP018", "EMP019"].includes(emp.employeeId)
);

const createShiftTeams14 = (employees, monthStart, prevEveningTeamIds = null) => {
  const femaleSeniors = sortByName(employees.filter((employee) => employee.level === "senior" && employee.gender === "female"));
  const maleSeniors = sortByName(employees.filter((employee) => employee.level === "senior" && employee.gender === "male"));
  const femaleJuniors = sortByName(employees.filter((employee) => employee.level === "junior" && employee.gender === "female"));
  const maleJuniors = sortByName(employees.filter((employee) => employee.level === "junior" && employee.gender === "male"));

  const nightBlocked = (employee) => {
    const blockedStr = formatDateString(employee.nightShiftBlockedUntil);
    const blockLimitStr = addMonths(monthStart, 2);
    return blockedStr && blockedStr >= monthStart && blockedStr < blockLimitStr;
  };

  const workedEveningLastMonth = (employee) => {
    if (!prevEveningTeamIds) return false;
    return prevEveningTeamIds.includes(employee.employeeId);
  };

  const teams = {
    morning: [],
    evening: [],
    night: []
  };

  const takeFromPool = (pool, count, predicate = () => true) => {
    const chosen = [];
    for (let index = 0; index < pool.length && chosen.length < count; ) {
      if (predicate(pool[index])) {
        chosen.push(pool[index]);
        pool.splice(index, 1);
      } else {
        index += 1;
      }
    }
    return chosen;
  };

  const takeNightShiftWorkers = (pool, count) => {
    const sortedPool = [...pool].sort((left, right) => {
      const leftBlocked = nightBlocked(left);
      const rightBlocked = nightBlocked(right);

      if (leftBlocked !== rightBlocked) {
        return leftBlocked ? 1 : -1;
      }

      if (leftBlocked) {
        const leftDate = left.nightShiftBlockedUntil ? new Date(left.nightShiftBlockedUntil).getTime() : 0;
        const rightDate = right.nightShiftBlockedUntil ? new Date(right.nightShiftBlockedUntil).getTime() : 0;
        if (leftDate !== rightDate) {
          return leftDate - rightDate;
        }
      }

      return left.name.localeCompare(right.name);
    });

    const chosen = [];
    for (const emp of sortedPool) {
      if (chosen.length >= count) break;
      if (!nightBlocked(emp) && !workedEveningLastMonth(emp)) {
        chosen.push(emp);
        const idx = pool.findIndex((e) => e.employeeId === emp.employeeId);
        if (idx !== -1) pool.splice(idx, 1);
      }
    }

    if (chosen.length < count) {
      const remainingNeeded = count - chosen.length;
      const fallbackPool = sortedPool.filter((emp) => !chosen.some((c) => c.employeeId === emp.employeeId));
      const fallbackChosen = fallbackPool.slice(0, remainingNeeded);
      fallbackChosen.forEach((emp) => {
        chosen.push(emp);
        const idx = pool.findIndex((e) => e.employeeId === emp.employeeId);
        if (idx !== -1) pool.splice(idx, 1);
      });
    }

    return chosen;
  };

  const workedNightShiftLastMonth = (employee) => {
    const blockedStr = formatDateString(employee.nightShiftBlockedUntil);
    const lastMonthBlockStr = addMonths(monthStart, 1);
    return blockedStr && blockedStr === lastMonthBlockStr;
  };

  // Night Team: 1 female senior, 1 male senior, 1 female junior, 1 male junior (Total 4)
  teams.night.push(...takeNightShiftWorkers(femaleSeniors, 1));
  teams.night.push(...takeNightShiftWorkers(maleSeniors, 1));
  teams.night.push(...takeNightShiftWorkers(femaleJuniors, 1));
  teams.night.push(...takeNightShiftWorkers(maleJuniors, 1));

  // Morning Team: 5 members (exactly 2 female seniors, 2 male seniors, 1 junior)
  teams.morning.push(...takeFromPool(femaleSeniors, 2, (employee) => !workedNightShiftLastMonth(employee)));
  if (teams.morning.filter(e => e.gender === "female" && e.level === "senior").length < 2) {
    const needed = 2 - teams.morning.filter(e => e.gender === "female" && e.level === "senior").length;
    teams.morning.push(...takeFromPool(femaleSeniors, needed));
  }

  teams.morning.push(...takeFromPool(maleSeniors, 2, (employee) => !workedNightShiftLastMonth(employee)));
  if (teams.morning.filter(e => e.gender === "male" && e.level === "senior").length < 2) {
    const needed = 2 - teams.morning.filter(e => e.gender === "male" && e.level === "senior").length;
    teams.morning.push(...takeFromPool(maleSeniors, needed));
  }

  const remainingJuniors = sortByName([...femaleJuniors, ...maleJuniors]);
  teams.morning.push(...takeFromPool(remainingJuniors, 1, (employee) => !workedNightShiftLastMonth(employee)));
  if (teams.morning.filter(e => e.level === "junior").length < 1) {
    const needed = 1 - teams.morning.filter(e => e.level === "junior").length;
    teams.morning.push(...takeFromPool(remainingJuniors, needed));
  }

  // Evening Team: remaining 5 members (1 female senior, 1 male senior, 3 juniors)
  teams.evening.push(...femaleSeniors);
  teams.evening.push(...maleSeniors);
  teams.evening.push(...remainingJuniors);

  return teams;
};

const run = async () => {
  const simEmployees = employees14.map(emp => ({ ...emp }));
  
  // January
  const teamsJan = createShiftTeams14(simEmployees, "2026-01-01", null);
  console.log("=== January ===");
  console.log("Night Team size:", teamsJan.night.length, teamsJan.night.map(e => e.employeeId));
  console.log("Morning Team size:", teamsJan.morning.length, teamsJan.morning.map(e => e.employeeId));
  console.log("Evening Team size:", teamsJan.evening.length, teamsJan.evening.map(e => e.employeeId));

  // Update blocks for Feb
  teamsJan.night.forEach(emp => {
    const e = simEmployees.find(se => se.employeeId === emp.employeeId);
    if (e) e.nightShiftBlockedUntil = "2026-03-01";
  });

  // February
  const teamsFeb = createShiftTeams14(simEmployees, "2026-02-01", teamsJan.evening.map(e => e.employeeId));
  console.log("\n=== February ===");
  console.log("Night Team size:", teamsFeb.night.length, teamsFeb.night.map(e => e.employeeId));
  console.log("Morning Team size:", teamsFeb.morning.length, teamsFeb.morning.map(e => e.employeeId));
  console.log("Evening Team size:", teamsFeb.evening.length, teamsFeb.evening.map(e => e.employeeId));
};

run();
