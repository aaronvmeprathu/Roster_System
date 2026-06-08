import { useEffect, useState } from "react";

const shiftClassMap = {
  morning: "shift-card morning",
  evening: "shift-card evening",
  night: "shift-card night"
};

const shiftLabelMap = {
  morning: "Morning",
  evening: "Evening",
  night: "Night"
};

const currentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}`;
};

const parseJsonResponse = async (response) => {
  const text = await response.text();

  if (!text) {
    throw new Error("The server returned an empty response.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The server returned an invalid response.");
  }
};

function App() {
  const [month, setMonth] = useState(currentMonthValue());
  const [employees, setEmployees] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedLeaveDates, setSelectedLeaveDates] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const seniorCount = employees.filter((employee) => employee.level === "senior").length;
  const juniorCount = employees.filter((employee) => employee.level === "junior").length;

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [employeeResponse, scheduleResponse] = await Promise.all([
          fetch("/api/employees"),
          fetch(`/api/schedule?month=${month}`)
        ]);

        const employeeData = await parseJsonResponse(employeeResponse);
        const scheduleData = await parseJsonResponse(scheduleResponse);

        if (!employeeResponse.ok) {
          throw new Error(employeeData.message || "Unable to load employees.");
        }

        if (!scheduleResponse.ok) {
          throw new Error(scheduleData.message || "Unable to generate schedule.");
        }

        setEmployees(employeeData);
        setSchedule(scheduleData);
        setSelectedEmployee((previous) => previous || employeeData[0]?.employeeId || "");
        setSelectedLeaveDates([]);
        setError("");
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [month]);

  const monthDates = schedule?.dailySchedule.map((day) => day.date) || [];

  const toggleLeaveDate = (date) => {
    setSelectedLeaveDates((previous) =>
      previous.includes(date) ? previous.filter((item) => item !== date) : [...previous, date]
    );
  };

  const submitLeave = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmployee,
          dates: [...selectedLeaveDates].sort(),
          month
        })
      });

      const data = await parseJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.message || "Unable to save leave.");
      }

      setSchedule(data);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Workforce Command</p>
          <h1>Employee Schedule and Leave Management</h1>
          <p className="muted">
            Monthly shift planning with leave-aware auto-regeneration for engineering teams.
          </p>
        </div>

        <div className="panel">
          <label>Scheduling Month</label>
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </div>

        <div className="panel">
          <label>Employee Leave Planner</label>
          <select value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)}>
            {employees.map((employee) => (
              <option key={employee.employeeId} value={employee.employeeId}>
                {employee.name} - {employee.level}
              </option>
            ))}
          </select>

          <div className="leave-grid">
            {monthDates.map((date) => {
              const active = selectedLeaveDates.includes(date);
              return (
                <button
                  key={date}
                  className={active ? "date-chip active" : "date-chip"}
                  onClick={() => toggleLeaveDate(date)}
                  type="button"
                >
                  {date.slice(-2)}
                </button>
              );
            })}
          </div>

          <button className="primary-button" type="button" onClick={submitLeave} disabled={loading}>
            Save Leave and Regenerate
          </button>
        </div>

        <div className="panel compact">
          <label>Team Snapshot</label>
          <div className="stats">
            <div><strong>{employees.length}</strong><span>Employees</span></div>
            <div><strong>{seniorCount}</strong><span>Senior</span></div>
            <div><strong>{juniorCount}</strong><span>Junior</span></div>
          </div>
        </div>
      </aside>

      <main className="content">
        {error ? <div className="error-banner">{error}</div> : null}
        {loading && !schedule ? <div className="loading-card">Generating workforce plan...</div> : null}

        {schedule ? (
          <>
            <section className="hero-card">
              <div>
                <p className="eyebrow">Monthly Coverage</p>
                <h2>{month}</h2>
              </div>
              <div className="legend">
                <span className="legend-item morning">Morning</span>
                <span className="legend-item evening">Evening</span>
                <span className="legend-item night">Night</span>
              </div>
            </section>

            <section className="summary-grid">
              {schedule.summary.map((employee) => (
                <article className="employee-card" key={employee.employeeId}>
                  <div className="employee-topline">
                    <h3>{employee.name}</h3>
                    <span className={employee.level === "senior" ? "badge senior-badge" : "badge junior-badge"}>
                      {employee.level}
                    </span>
                  </div>
                  <p>{employee.role} - {employee.gender}</p>
                  <div className="metrics">
                    <span>{shiftLabelMap[employee.fixedShift]}</span>
                    <span>{employee.workedDays} days</span>
                    <span>{employee.nightAssignments} night</span>
                  </div>
                </article>
              ))}
            </section>

            <section className="schedule-grid">
              {schedule.dailySchedule.map((day) => (
                <article className="day-card" key={day.date}>
                  <div className="day-card-header">
                    <h3>{day.date}</h3>
                  </div>
                  {Object.entries(day.shifts).map(([shiftName, shiftMembers]) => (
                    <div className={shiftClassMap[shiftName]} key={shiftName}>
                      <div className="shift-heading">
                        <strong>{shiftLabelMap[shiftName]}</strong>
                        <span>{shiftMembers.length} staff</span>
                      </div>
                      <ul>
                        {shiftMembers.map((employee) => (
                          <li key={employee.employeeId}>
                            <span>{employee.name}</span>
                            <small>{employee.level}</small>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <div className="day-meta">
                    <small>Off: {day.off.join(", ") || "None"}</small>
                    <small>Leave: {day.leave.join(", ") || "None"}</small>
                  </div>
                </article>
              ))}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

export default App;
