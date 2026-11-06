# Exam Management Portal — Personal Briefing Guide

> Personal reference for briefing an instructor about this project.  
> Project: **IIUI CS&IT (Male Campus) Examination Management Portal — Phase 1**  
> Workspace: `D:\7th Semester\Exam Project\system design`

---

## 1. One-minute summary

This project is a **Phase 1 exam management system** that automatically generates:
1. a **clash-free exam datesheet**, and
2. **room-wise seating plans**

for the International Islamic University, Islamabad (IIUI), Department of Computer Science & Information Technology, Male Campus.

It uses a **FastAPI backend** to run scheduling and seating logic, and a **React + Vite + Tailwind** frontend to display results and let users download a formatted **Excel workbook**. The current phase uses **deterministic dummy academic data** (rooms, students, courses, enrollments, and exam slots) to demonstrate the full workflow.

---

## 2. Problem this project solves

Manual exam planning is difficult because:
- A student cannot take two exams in the same slot.
- A teacher cannot invigilate/teach conflicting exams in the same slot.
- Students taking the same paper should not sit in adjacent columns when avoidable.
- Rooms have limited capacity and fixed grids.
- The system must produce a practical datesheet, seating arrangement, and printable/exportable report.

This project automates those decisions and presents the output in a web portal.

---

## 3. Scope of Phase 1

### Included
- Dummy data generation for IIUI CS&IT Male Campus context.
- Clash-free datesheet generation.
- Seating plan generation with room allocation.
- Interactive web UI (summary, datesheet, seating grids, search/filter).
- Excel export (datesheet, roll number slips, seating charts).
- In-memory runtime state for generated results.

### Not included (important to say clearly)
- Real database persistence (no PostgreSQL/MySQL/SQLite layer shown in core flow).
- Authentication/authorization (no login/roles).
- Real IIUI student/course data import from SIS.
- Admin CRUD for editing courses/rooms/students through UI.
- Production deployment hardening (CORS is open, static dummy data, in-memory state).
- Multi-campus/generalized production configuration.

---

## 4. Technology stack

| Layer | Technology | Purpose in this project |
|---|---|---|
| Backend framework | **FastAPI** | REST API endpoints, request handling, JSON responses, file download response, static SPA mounting. |
| ASGI server | **Uvicorn** | Runs the FastAPI app (`python run_server.py` → `uvicorn.run("main:app", ...)`). |
| Data validation/types (available in stack) | **Pydantic / Starlette** (vendored) | FastAPI ecosystem support; core logic mostly uses typed Python dicts/lists. |
| Excel generation | **OpenPyXL** | Creates styled multi-sheet `.xlsx` workbook in memory. |
| Frontend UI | **React 18** | Component-based dashboard and interactive state management. |
| Build/dev tool | **Vite 6** | Fast frontend dev server and production build. |
| Styling | **Tailwind CSS 3** | Utility-first UI styling, IIUI-themed layout/cards/tables/grids. |
| Language/runtime | **Python** (backend), **JavaScript/JSX** (frontend) | Core implementation languages. |
| Environment note | Local `backend/site-packages` vendored | `run_server.py` inserts local site-packages into `sys.path` so dependencies can run from the project folder. |

---

## 5. Project structure (important files)

```text
system design/
├── README.md
├── PROJECT_BRIEFING_GUIDE.md          # this personal briefing file
├── Exam_Schedule_Report.xlsx          # sample/generated output artifact
├── IIUI_Exam_Schedule_Seating_Report.xlsx
├── backend/
│   ├── main.py                        # FastAPI app, API routes, orchestration
│   ├── run_server.py                  # server launcher (Uvicorn)
│   ├── data_generator.py              # dummy rooms/students/courses/enrollments/slots
│   ├── scheduler.py                   # clash-free datesheet generation
│   ├── seating_engine.py              # seating rule engine + room allocation
│   ├── excel_exporter.py              # styled Excel workbook export
│   ├── instructor_utils.py            # canonical instructor name normalization
│   ├── verify.py                      # integrity checks (standalone)
│   ├── test_portal.py / debug_graph.py # supporting test/debug utilities
│   ├── requirements.txt
│   └── site-packages/                 # vendored Python dependencies
└── frontend/
    ├── src/App.jsx                    # main React dashboard
    ├── src/main.jsx                   # React entry point
    ├── vite.config.js                 # dev server + /api proxy to backend
    ├── dist/                          # production build served by backend
    └── package.json
```

---

## 6. How the system works (end-to-end)

### Runtime flow
1. User opens the portal (`http://localhost:8000` in unified mode, or Vite dev URL in dev mode).
2. Frontend shows “Run Generation”.
3. User clicks **Run Generation** → frontend calls `GET /api/generate`.
4. Backend ensures/generates data context and runs:
   - `generate_datesheet(...)` from `scheduler.py`
   - `generate_seating_plans(...)` from `seating_engine.py`
5. Scheduler assigns each course to a valid exam slot while respecting constraints.
6. Scheduler asks seating engine (`can_seat_slot`) whether a candidate slot is actually seatable before accepting it.
7. Seating engine fills rooms column-by-column, applies the two-column/course/teacher rule, and determines actual rooms used.
8. Seating engine writes exact `allocated_rooms` back into schedule entries.
9. Backend computes warnings/conflicts/summaries and returns JSON.
10. Frontend renders KPIs, datesheet, seating grids, and search/filter tools.
11. User clicks **Download Excel** → frontend calls `GET /api/download-excel`.
12. Backend builds workbook with OpenPyXL and streams the `.xlsx` file.

---

## 7. Backend design details

### 7.1 `main.py` (orchestration/API)
- Creates FastAPI app with CORS middleware (`allow_origins=["*"]`).
- Uses lifespan startup to load data via `_load_data()`.
- Stores runtime data in module-level in-memory `_DATA` dictionary:
  - rooms, students, courses, enrollments, slots
  - schedule, seating_plans, generated_at
- `_run_generation()`:
  - runs scheduler, catches `SchedulingError` → HTTP 422
  - runs seating engine, catches `SeatingError` → HTTP 422
  - performs post-generation safety checks:
    - teacher double-booking (`find_teacher_conflicts`) → HTTP 500 if found
    - missing `allocated_rooms` → HTTP 500 if found
- `_build_warnings()` reports:
  - seating fallback usage
  - one-exam-per-day relaxation
- `GET /api/generate` returns a slim seating payload (drops `grid` from seating plans for response size/UI use pattern).
- `GET /api/download-excel` returns `StreamingResponse` with Excel MIME type.
- Mounts `frontend/dist` at `/` if build exists.

### 7.2 `data_generator.py` (dummy dataset)
- Uses `SEED = 42` for deterministic/repeatable generation.
- Generates:
  - **8 rooms/halls** (`R-101..R-203`, `Hall-A`, `Hall-B`), each 5 rows × 6 cols = 30 seats.
  - **240 male students** across batches like `BSCS-F23..F26`, `BSIT-F23..F26`.
  - **IIUI-style course catalog** with course code/name, sections, instructor(s), target batches.
  - **Enrollments** linking students to course sections/instructors (deduplicated by student+course).
  - **Time slots**: 5 exam days × 4 sessions (20 slots).
- Normalizes instructor names using `instructor_utils.normalize_instructor`.

### 7.3 `instructor_utils.py` (data quality)
- Resolves known spelling variants to canonical instructor names (e.g., `Dr. Tariq Saddad` → `Dr. Tariq Sadad`).
- Prevents false negatives where the same teacher appears as two different people, which could hide real conflicts.

### 7.4 `scheduler.py` (datesheet algorithm)
This is a **constraint-aware greedy scheduler** with graph/conflict checks.

**Hard constraints (as implemented):**
- **H1 (Student clash):** courses sharing any enrolled student cannot be in the same slot.
- **H2 (Teacher clash):** courses taught by the same instructor cannot be in the same slot.
- **H3 (Seatable slot):** before accepting a slot, scheduler calls `can_seat_slot(...)`; if seating is impossible under the rule, slot is rejected.

**Soft constraint:**
- **S1 (One exam per student per day):** tried first; if no feasible complete schedule is found, it performs a second pass relaxing this rule globally.

**Key steps:**
- Build student-sharing conflict graph between courses.
- Count enrollments and sort courses by:
  1. descending conflict degree,
  2. descending enrollment count.
  (Heuristic similar to graph-coloring difficulty ordering.)
- Try placing each course into the earliest feasible slot.
- Uses `seat_cache` keyed by candidate course-id set (`frozenset`) to avoid repeated feasibility checks.
- Produces schedule entries; **does not allocate rooms** — sets `allocated_rooms=[]` for seating engine to fill with actual rooms.

### 7.5 `seating_engine.py` (seating + room allocation)
This module enforces the clarified seating rule and determines real room usage.

**Rule behavior (important for briefing):**
1. **Primary:** adjacent columns in the same room must not carry the same course.
2. **Fallback (controlled):** if only same course remains and skipping a column would leave candidates unseated, adjacent columns may carry same course only for **different teacher/section units**.
3. **Spacing preference:** if enough capacity exists, leave an empty column between same-course columns (even with different teachers).
4. **Single-teacher/single-course effect:** room tends to use alternate columns (e.g., A, C, E...), reducing usable seats per room.
5. **No silent drops:** if candidates remain unseated, raise `SeatingError`.

**Core concepts:**
- Enrollment index grouped by `course_id` and canonical instructor.
- A “unit” = one course + one teacher/section queue.
- Rooms processed in deterministic order: largest first, then room ID.
- Column-by-column filling updates `SeatingContext` (`remaining_seats`, `remaining_students`, `fallback_columns`).
- `can_seat_slot(...)` simulates feasibility using the same logic (without recording final seat objects) so scheduler and seating engine stay consistent.
- `generate_seating_plans(...)` creates actual plans, then synchronizes **exact rooms used per course/slot** back into `schedule[*]["allocated_rooms"]`.

### 7.6 `excel_exporter.py` (reporting)
- Builds an in-memory workbook (`BytesIO`) and returns bytes.
- Uses IIUI-styled formatting (fonts/fills/borders/alignment) with OpenPyXL.
- **Sheets produced:**
  1. **Datesheet** — date/day, slot, timing, course code/title, instructors, enrolled count, allocated rooms.
  2. **Roll Number Slips** — student/course/teacher/date/slot/room/seat position.
  3. **Seating chart sheets** (one per room × slot plan) — row/column grid with course/instructor headers and seat cells.
- Includes safety/robustness helpers:
  - `_safe_value()` prefixes risky strings starting with `= + - @` to reduce spreadsheet formula injection risk.
  - `_unique_sheet_title()` ensures valid/collision-free Excel sheet names (31-char limit).

---

## 8. Frontend design details (`frontend/src/App.jsx`)

The frontend is a single-page React dashboard that consumes backend APIs.

### Main UI capabilities
- **Run Generation** button → `fetch('/api/generate')`.
- **Download Excel** button → `fetch('/api/download-excel')`, creates blob URL, triggers download.
- **KPI cards**: rooms, students, scheduled courses, enrollments, slots.
- **Warnings display**: shows backend warnings (e.g., fallback seating, one-per-day relaxation).
- **Datesheet view**:
  - searchable table (course code/name, instructor, date, slot, rooms).
- **Seating Arrangement view**:
  - cascading filters: Date → Session/Slot → Hall/Room.
  - global finder across all plans (student name, roll no, teacher, course code).
  - selecting a search match jumps to that plan’s date/slot/room.
  - reconstructs a 2D grid from seat records and renders visual hall layout.
  - highlights matching searched seats.
  - shows column headers from backend (`column_headers`) so spacing/empty columns align correctly.

### Dev integration
- `frontend/vite.config.js` proxies `/api` to `http://localhost:8000`.
- In production/unified mode, backend serves `frontend/dist`.

---

## 9. API contract (practical view)

### `GET /api/generate`
**Purpose:** Run scheduling + seating and return full portal data (minus bulky seat grids in seating plans).

**Returns (high level):**
- `institution` metadata
- `meta` counts (`rooms`, `students`, `courses`, `enrollments`, `slots`, `scheduled_courses`, `seating_plans`, `fallback_plans`, `unseated_students`, `teacher_conflicts`)
- `generated_at`
- `warnings`
- `fallback_plans`
- `teacher_conflicts`
- `courses`, `rooms`, `schedule`
- `seating_plans` (slim; `grid` removed)

### `GET /api/download-excel`
**Purpose:** Download formatted workbook.  
**Response:** Excel file stream (`IIUI_Exam_Schedule_Seating_Report.xlsx`).

### `GET /api/health`
**Purpose:** Simple health/version check.

---

## 10. Constraints and design decisions (good to explain)

- **Feasibility-aware scheduling:** scheduler does not only check graph conflicts; it verifies seatability (`H3`) to avoid producing a datesheet that cannot be physically seated.
- **Room allocation moved to seating engine:** avoids duplicate/misaligned room assignment logic and accounts for capacity loss caused by seating rules.
- **Deterministic data (`SEED=42`)**: makes demos and debugging repeatable.
- **Instructor normalization:** improves correctness of teacher-conflict detection.
- **No silent data loss:** seating engine raises errors if candidates cannot be seated.
- **In-memory state (`_DATA`)**: simple for Phase 1/demo; fast to implement, but not persistent or multi-user safe.
- **Excel safety:** `_safe_value()` mitigates formula injection from text fields.

---

## 11. How to run/demo

### Option A — Unified mode (recommended for demo)
```powershell
cd "D:\7th Semester\Exam Project\system design\backend"
python run_server.py
```
Open: `http://localhost:8000`

### Option B — Development mode
**Terminal 1 (backend):**
```powershell
cd "D:\7th Semester\Exam Project\system design\backend"
python run_server.py
```

**Terminal 2 (frontend):**
```powershell
cd "D:\7th Semester\Exam Project\system design\frontend"
npm run dev
```
Open the Vite URL (usually `http://localhost:5173`). Vite proxies `/api` to `:8000`.

---

## 12. Known limitations / honest caveats (say this proactively)

- Uses **dummy/generated data**, not live university records.
- Data and generated results are stored **in memory** (restart resets state).
- No authentication/roles/audit logging.
- CORS is currently permissive (`*`), suitable for local/dev but not production-ready.
- Greedy heuristic finds a feasible schedule under implemented rules, but not necessarily an optimal schedule (e.g., minimal days, balanced load, fairness).
- Excel sheet count can grow large (one chart sheet per room × slot plan).
- Seating fallback is allowed only under constrained conditions; it should be explained as a controlled exception, not a normal case.

---

## 13. Questions you should know before the briefing

### Project understanding
- **What is the core objective?** Automate clash-free datesheet generation and seating allocation with exportable reports.
- **Why split scheduler and seating engine?** Scheduling decides *when*; seating decides *where/how* and validates physical seatability under adjacency rules.
- **What makes a schedule invalid?** Student clash, teacher clash, or a slot that cannot be seated under the rule/capacity constraints.
- **What is the two-column rule here?** Adjacent columns should not contain the same course; constrained fallback may allow same course only for different teacher/section when unavoidable.
- **Why can a 5×6 room not always seat 30 for one course?** Adjacency/spacing rule can force alternate or spaced columns.
- **What happens if the system cannot place everything?** It raises a scheduling/seating error and the API returns an error (422 in handled cases).
- **Why normalize instructor names?** To avoid missing teacher conflicts due to spelling variants.
- **What does the Excel report contain?** Datesheet, roll number slips, and room-wise seating charts.

### Technical understanding
- **Why FastAPI?** Fast to build APIs, clean endpoint structure, easy JSON/file responses, good Python ecosystem fit.
- **Why React + Vite?** Interactive UI state (filters/search/grids), fast dev experience, easy build for deployment/static serving.
- **Why OpenPyXL?** Programmatic Excel generation with formatting and multiple sheets.
- **How does frontend talk to backend?** HTTP calls to `/api/generate` and `/api/download-excel` (Vite proxy in dev).
- **Where is state stored now?** In backend memory (`_DATA`) and React component state on the frontend.

---

## 14. Likely counter questions and strong answers

### Q1. “Why not use a database?”
**Answer:** Phase 1 focuses on validating the scheduling/seating workflow and user-facing outputs. In-memory deterministic dummy data keeps the prototype simple and reproducible. A database (e.g., PostgreSQL) is the next step for persistence, real imports, audit history, and multi-user operations.

### Q2. “Is this actually optimal scheduling?”
**Answer:** It is a **feasible, heuristic-based** scheduler (greedy ordering with conflict and seatability checks), not a mathematically proven global optimizer. It prioritizes correctness under constraints. Optimization (fewer days, better spread, load balancing) can be added later using constraint solvers/ILP/metaheuristics.

### Q3. “What if the dataset becomes very large?”
**Answer:** The current approach is fine for a prototype, but scaling would require performance profiling, indexing/caching strategies, possible solver redesign, pagination/streaming responses, database-backed storage, and background job processing for long-running generation.

### Q4. “Why check seatability inside the scheduler?”
**Answer:** Because a slot can be conflict-free on paper but physically impossible to seat under the adjacency rule and room capacities. Checking `can_seat_slot` prevents generating a datesheet that fails later.

### Q5. “Why are rooms allocated by the seating engine, not the scheduler?”
**Answer:** The seating rule affects usable capacity and column placement. The seating engine knows the actual room filling outcome, so it assigns the real rooms used and syncs them back to the schedule for accuracy.

### Q6. “Can the same course appear in adjacent columns?”
**Answer:** Only as a controlled fallback: same course is allowed in adjacent columns **only if instructors/sections differ** and only when leaving an empty column would cause unseated candidates. Otherwise, the engine preserves spacing/paper-level separation.

### Q7. “How do you ensure the same teacher is not double-booked?”
**Answer:** The scheduler tracks teachers busy in a slot and blocks conflicts. Instructor names are normalized first. After generation, the backend also runs `find_teacher_conflicts` as a safety check.

### Q8. “Why React if FastAPI could render templates?”
**Answer:** The UI needs interactive filtering, cascading selections, instant search across seating plans, and dynamic grid rendering/highlighting. React makes that client-side interactivity cleaner. FastAPI remains focused on computation and APIs.

### Q9. “Is this secure for production?”
**Answer:** Not yet. It’s a Phase 1 prototype: open CORS, no auth, no persistent secure storage, and dummy data. Production would need authentication, authorization, input validation for real uploads, audit logs, stricter CORS, HTTPS, and deployment hardening.

### Q10. “What would Phase 2 include?”
**Answer (example roadmap):** real data import (CSV/Excel/SIS), database persistence, admin panels, role-based access, invigilator assignment, editable constraints, conflict reports/history, PDF exports, and optimization/tuning for larger institutions.

---

## 15. Logically valid project flow chart (Mermaid)

```mermaid
flowchart TD
    A[User opens Exam Management Portal] --> B[Frontend loads React dashboard]
    B --> C{User clicks Run Generation?}
    C -- No --> B
    C -- Yes --> D[Frontend calls GET /api/generate]

    D --> E[FastAPI main.py receives request]
    E --> F{Runtime data loaded in memory?}
    F -- No --> G[Load dummy data: rooms, students, courses, enrollments, slots]
    F -- Yes --> H[Use existing in-memory data]
    G --> H

    H --> I[Scheduler: build conflict graph<br/>student overlaps + teacher checks]
    I --> J[Order courses by difficulty<br/>conflict degree, enrollments]
    J --> K[Try slot assignment<br/>H1 student clash<br/>H2 teacher clash<br/>S1 one-per-day]

    K --> L{Candidate slot conflict-free?}
    L -- No --> K
    L -- Yes --> M[Call can_seat_slot() in seating engine]

    M --> N{Slot seatable under rule/capacity?}
    N -- No --> K
    N -- Yes --> O[Accept slot for course]

    O --> P{All courses scheduled?}
    P -- No --> K
    P -- Yes, strict pass --> Q[Datesheet generated]
    P -- No feasible strict schedule --> R[Relax S1: allow >1 exam/day if needed]
    R --> K

    Q --> S[Seating engine generates room plans<br/>column-by-column filling]
    S --> T[Apply rule:<br/>no same course adjacent columns<br/>controlled fallback for different teacher/section]
    T --> U{All candidates seated?}
    U -- No --> V[Raise SeatingError / API returns error]
    U -- Yes --> W[Sync actual allocated_rooms back to schedule]

    W --> X[Backend safety checks<br/>teacher conflicts, missing room allocation]
    X --> Y{Checks pass?}
    Y -- No --> Z[Return HTTP 500 with details]
    Y -- Yes --> AA[Return JSON: meta, warnings, schedule, seating summary]

    AA --> AB[Frontend renders KPIs, datesheet, seating grids, search/filter]
    AB --> AC{User clicks Download Excel?}
    AC -- No --> AB
    AC -- Yes --> AD[Frontend calls GET /api/download-excel]
    AD --> AE[excel_exporter builds workbook in memory]
    AE --> AF[Datesheet + Roll Slips + Seating Charts sheets]
    AF --> AG[FastAPI streams .xlsx file to browser]
```

---

## 16. Suggested 60–90 second briefing script (personal)

“This project is a Phase 1 IIUI CS&IT Male Campus exam management portal. It automatically creates a clash-free datesheet and room-wise seating plans from an academic dataset. I used FastAPI for the backend APIs, React with Vite and Tailwind for the frontend interface, and OpenPyXL to generate a formatted Excel report.

The backend first generates or loads structured exam data, then the scheduler assigns courses to slots while preventing student clashes and teacher double-bookings. Before accepting a slot, it checks with the seating engine to ensure the slot is physically seatable under the room and adjacency rules. The seating engine fills rooms column by column, avoids placing the same course in adjacent columns where possible, and uses a controlled fallback only when necessary. Finally, the frontend displays the datesheet and seating grids with filters and search, and the user can download a complete Excel workbook.”

---

## 17. Final note for yourself

If the instructor asks for a weakness, answer honestly: **Phase 1 proves the logic and workflow with dummy in-memory data**. The main next step is making it production-ready with **real data integration, database persistence, authentication, and stronger deployment/security practices**.
