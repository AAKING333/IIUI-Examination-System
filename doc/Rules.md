# IIUI Examination Management System — System Rules & Policies

Complete reference of all scheduling, seating, validation, caching, export, and examination-conduct rules currently implemented in the **IIUI Examination Management Portal** (`backend/` and `frontend/`).

---

## 1. Datesheet Scheduling Rules

Implemented primarily in `backend/datesheet.py` (`generate_datesheet`) and enforced at API level in `backend/main.py` (`generate_datesheet_endpoint`).

### 1.1 IIUI Back-Paper & Student Clash Rules (v2)
Checked per individual `(roll_no, course_code)` enrolment via `enrolment_type` (`"regular"` or `"back"`, defaulting to `"regular"`). A single course can be `"regular"` for one student and `"back"` for another.

1. **No Same-Slot Clash:** A student is never scheduled for two exams in the same `slot_id`.
2. **Maximum 1 Regular Paper Per Day:** A student can sit at most **1 `regular` exam per calendar date**. Therefore, no two regular courses taken by the same student ever fall on the same date.
3. **Maximum 2 Papers Total Per Day:** A student can sit at most **2 exams total on any calendar date** across distinct slots (allowing `1 regular`, `1 back`, `1 regular + 1 back`, or up to `2 back` papers in different sessions on the same date).

### 1.2 Faculty / Teacher Clash Guard
- Extracted via `get_course_teachers` (reading `instructors`, `sections[].instructor`, or `instructor`, and ignoring placeholders `"unassigned"`, `"tbd"`, `"n/a"`, `"none"`).
- **One Slot Per Teacher:** An instructor cannot be scheduled for multiple courses in the same `slot_id`, regardless of whether the courses belong to different programs, batches, or sections.

### 1.3 Course Eligibility & Ordering
- **Zero-Enrolment Exclusion:** Courses with `0` enrolled students (`len(student_roll_numbers) == 0`) are excluded from the generated datesheet.
- **Greedy Priority Ordering:** Eligible courses are sorted by enrolled student count descending (`largest first`), and available time slots are processed chronologically by `(date, start_time)`.

### 1.4 Slot Capacity & Two-Pass Room Feasibility
1. **Per-Slot Capacity Ceiling:** Sum of students placed in any slot cannot exceed total physical capacity across all rooms (`sum(room.capacity)`).
2. **Pass 1 (Preferred 2-Paper Pairing + Buffer Check):**
   - Limits each slot to `max_courses_per_slot = 2`.
   - Verifies `courses_fit_in_rooms(slot_courses + [course], active_rooms, require_empty_buffer=True)` so placed courses satisfy alternating column seating, clean teacher columns, and `>= 5` empty buffer chairs.
3. **Pass 2 (Capacity Fallback):**
   - Retries any remaining unplaced courses without the `max_courses_per_slot` cap across chronological slots in two sub-passes:
     - First requiring `require_empty_buffer=True`
     - Then falling back to `require_empty_buffer=False` (clean teacher columns without requiring the full 5-chair trailing buffer).

### 1.5 Atomic Generation Gate (API)
- `POST /api/datesheet/generate` rejects generation with **HTTP 400** if no time slots or no courses exist.
- If **any** schedulable course remains unplaced (`unplaced` non-empty), the endpoint aborts with **HTTP 422** and does **not** save or expose a partial datesheet.

---

## 2. Seating Plan & Hall Allocation Rules

Implemented in `backend/seating.py` (`build_seating_plan`, `courses_fit_in_rooms`, `build_seating_sheet`).

### 2.1 Strict 2-Paper Column Alternation & Adjacency Rules
1. **Max 2 Papers Per Room:** Courses in a slot are sorted by demand (`len(rolls) + EXTRA_EMPTY_CHAIRS * len(groups)`) and partitioned into groups of at most `2` papers (`_partition_course_pairs`).
2. **Column Alternation (`column_papers`):**
   - **2 Papers in Room:** Columns strictly alternate `Paper 0` (Col 01, 03, 05...) and `Paper 1` (Col 02, 04, 06...).
   - **1 Paper in Room:** Occupied columns occupy even 0-based indices (`0, 2, 4...` -> Col 01, 03, 05...) separated by `— (Vacant)` columns (`1, 3, 5...` -> Col 02, 04, 06...).
3. **No Side-by-Side Same Course:** Horizontally adjacent seats (`grid[r][c]` and `grid[r][c + 1]`) never hold the same `course_code`, verified by `check_adjacent_columns` (`adjacent_rule_pass`).
4. **Top-to-Bottom Column Fill:** Within every column, roll numbers read vertically from front (`Row 1`) to back (`Row R`).

### 2.2 `(Course, Teacher)` Contiguous Grouping & Clean Columns
1. **Per-Student Teacher Resolution (`_resolve_student_teacher` & `DataStore.get_instructor_for_student_course`):** Resolves each enrolled student's instructor using 5-step precedence:
   1. Exact `(program, batch, section)` match
   2. `(program, batch)` match
   3. `program` match (covers back-paper students from earlier cohorts)
   4. First assigned instructor for that course
   5. Normalized course-level `instructor` fallback (excluding placeholders `_PLACEHOLDER_TEACHERS = {"unassigned", "none", "tbd", "n/a", ""}`).
2. **Same-Teacher Merging (`_course_teacher_groups`):** Students in the same course taught by the **same teacher** across different sections, batches, or programs are grouped into one contiguous block (ordered by descending group size, first roll number, then teacher name). Students taught by **different teachers** in a multi-teacher course remain separate groups.
3. **Clean Column Boundaries (`_allocate_paper_columns`):** Each `(course, teacher)` group begins at the top (`Row 1`) of a new column; different teachers of the same course never share a column unless emergency fallback (`allow_mix_teachers=True`) is triggered.

### 2.3 Extra 5 Empty Chairs Buffer Rule
1. **Minimum 5 Trailing Empty Seats (`EXTRA_EMPTY_CHAIRS = 5`):**
   - Every `(course, teacher)` block must leave **at least 5 empty chairs** after its final seated student in its allocated alternating columns.
   - Unused seats at the bottom of the group's final occupied column count first (`rem_in_last`).
   - If `rem_in_last < 5`, extra empty column(s) belonging to that paper are reserved under the same `Course - Teacher` header until total trailing empty chairs `>= 5` (spanning multiple buffer columns if `room["rows"] < 5`).
2. **Verification Flag:** `_verify_empty_chairs_rule` checks all `(course, teacher)` sequences in room/column order and reports `empty_chairs_rule_pass` alongside `extra_empty_chairs: 5`.
3. **Sheet Representation (`build_seating_sheet`):**
   - Active columns and 0-student buffer columns retain all `room["rows"]` entries (`""` for empty seats) and display `CODE - Teacher` (using `column_teachers` metadata when a buffer column has 0 seated students).
   - Unused columns outside allocated blocks display `— (Vacant)` with an empty roll list.

### 2.4 Minimal-Waste Room Selection & Fallbacks
- `best_fit_rooms` / `_search_best_combo` selects the subset of rooms minimizing `(total_usable_capacity - pair_total, room_count)` via exact subset search (`<= 12` available rooms) or largest-room-first greedy selection (`> 12` rooms).
- Allocation tiers in order:
  1. **Tier 1 (Preferred):** Clean teacher columns + `>= 5` empty chairs (`extra_empty=5, allow_mix_teachers=False`).
  2. **Tier 2 (Relaxed Buffer):** Clean teacher columns without full 5-chair buffer (`extra_empty=0, allow_mix_teachers=False`).
  3. **Tier 3 (Emergency Overcapacity):** Sequential packing allowing mixed teachers in a column (`extra_empty=0, allow_mix_teachers=True`).
  4. **Tier 4 (Safety Net):** Returns all remaining rooms if Tier 3 still does not fit.

### 2.5 Room Utilisation Flagging
- Computed per room as `util = (seated / usable_capacity) * 100`:
  - **`LOW`**: `util < 70%`
  - **`FAIR`**: `70% <= util < 85%`
  - **`OK`**: `util >= 85%`

---

## 3. Master Data, Input Validation & Referential Integrity Rules

Implemented across Pydantic schemas (`backend/main.py`), `DataStore` (`backend/data.py`), and form validators (`frontend/src/pages/`).

| Entity | Constraints, Normalization & Safeguards |
| --- | --- |
| **Rooms** | - `name`: `1..100` chars (trimmed).<br>- `rows`: `1..50`; `columns`: `1..50`.<br>- `capacity`: optional override `1..2500`; if omitted or `<= 0`, defaults to `rows * columns`.<br>- **Last-Room Safeguard:** Deleting a room is blocked (`HTTP 400` in `DELETE /api/rooms/{room_id}`, button disabled in `RoomsManagement.jsx`) when `len(rooms) <= 1`. |
| **Courses** | - `code`: `2..20` chars, normalized uppercase, must be unique (`HTTP 400` on duplicate).<br>- `title`: `2..150` chars.<br>- `credit_hours`: integer `1..6` (default `3`).<br>- **Cascade Delete:** Deleting a course automatically removes all matching instructor assignments and removes the course from all students' `enrolments` and `courses`, then rebuilds indexes. |
| **Instructor Assignments** | - `program` (`2..50` upper), `batch` (`2..20` upper), `section` (`1..10` upper), `course_code` (`2..20` upper), `instructor` (`2..120`).<br>- **Referential Integrity:** Creating or updating an assignment fails (`HTTP 400`) if `course_code` does not exist in the courses directory. |
| **Students & Enrolments** | - `roll_no`: `3..30` chars, normalized uppercase on creation, must be unique (`HTTP 400` on duplicate); locked against modification in edit UI (`StudentsManagement.jsx`).<br>- `name` / `father_name`: `2..100` chars; `program`: `2..50`; `batch`: `2..20`; `section`: `1..10` upper; `faculty`: `2..120` (defaults to `"Computing and Information Technology"`).<br>- Each enrolment specifies `course` and `type` constrained to `regular` or `back` (normalized to `"regular"` if unrecognized).<br>- Frontend student form requires at least `1` enrolled course. |
| **Time Slots** | - `date`: `YYYY-MM-DD`; `start_time` & `end_time`: `HH:MM`.<br>- **Duplicate Slot Guard:** `POST /api/time-slots` raises `HTTP 400` if `(date, start_time, end_time)` matches an existing slot.<br>- **Auto-Generation Bounds:** `to_date >= from_date`, `end_time > start_time`, `(end_min - start_min) >= duration_minutes`; backend allows `duration_minutes` `15..360` and `break_minutes` `0..180` (UI modal inputs bound `15..300` and `0..120`).<br>- **Weekend Skip & Deduplication:** Skips Saturday (`weekday 5`) and Sunday (`weekday 6`) when `skip_weekends=True` (default), and skips existing identical slots.<br>- **Session Labeling:** Daily auto-generated slots are labeled `Morning 1`, `Morning 2`, `Afternoon 1`, `Afternoon 2`, `Evening 1`, and `Session N` from index 6 onward.<br>- **Bulk Operations:** Supports bulk delete, bulk day-shift (`timedelta(days=shift_days)`), and full clear. |

---

## 4. State Management & Cache Invalidation Rules

Implemented in `backend/main.py`:
- **Automatic Seating Cache Clearing:** `seating_cache.clear()` runs after room create/update/delete, course create/update/delete, instructor assignment create/update/delete, student create/update/delete, time-slot auto-generate/clear/bulk-delete/bulk-shift, and datesheet generation so stale hall plans are never served.
- **Scoped Slot Cache Clearing:** Updating or deleting a single time slot (`PUT`/`DELETE /api/time-slots/{slot_id}`) or recalculating a slot plan (`POST /api/seating-plan/generate`) invalidates that `slot_id` via `seating_cache.pop(slot_id, None)`.
- **Factory Reset Rule:** `POST /api/reset-data` restores seed data (`4` rooms totaling `180` seats, `26` courses, `59` instructor assignments, `200` students across `BSCS`/`BSIT`/`BSSE` batches `F21..F24`, `28` time slots across `7` exam days), clears `datesheet_state`, and clears `seating_cache`.

---

## 5. Roll Number Slips, Exports & Exam Conduct Rules

### 5.1 Roll Number Slip Resolution & UI Navigation Rules
- **Auto-Generation on Demand:** `GET /api/roll-slip/{roll_no}`, `GET /api/roll-slip/{roll_no}/pdf`, and `GET /api/roll-slips/all-pdf` automatically call `generate_datesheet_endpoint()` if `datesheet_state["datesheet"]` is empty and both slots and courses exist.
- **Case-Insensitive Roll Lookup:** Roll number queries match `roll_no.lower()`, returning `HTTP 404` if the student (or allocated exams for PDF download) does not exist.
- **Admin Audit vs. Active Navigation:**
  - `GET /api/student-verifications` (`StudentVerificationPage.jsx`) provides a view-only audit roster (no roll-slip download buttons).
  - Active frontend sidebar (`AdminSidebar.jsx` & `App.jsx`) currently defaults to **Time Slots**, includes **Roll No Slips** (`RollSlipPage.jsx`), and keeps `Dashboard` (`false && ...`) and the `StudentVerificationPage` view hidden/unrouted (`datesheet` and `verification` both render `DatesheetPage.jsx`).

### 5.2 Candidate Examination Conduct Rules (Official Notes)
Published in generated JSON roll slips (`backend/main.py`) and PDF roll slips (`backend/exports.py` `NOTES`):
1. Candidates must bring both their printed **Roll No. Slip** and **University Student ID Card** into the examination hall.
2. **Prohibited Items:** Cell phones, digital gadgets, smartwatches, and programmable electronic devices are strictly banned inside examination halls.
3. **Reporting Time:** Candidates must be seated in their assigned hall and desk **at least 15 minutes** before the exam commences.
4. **Provisional Slip & 75% Attendance Rule:** Roll No. Slips are issued provisionally; students with **less than 75% attendance** in any course are ineligible to sit, and any exam taken despite short attendance will be cancelled.

### 5.3 Excel, PDF & Print Rendering Rules
- **Datesheet Excel (`exports.datesheet_xlsx`):** Groups entries chronologically under date banners (`dd/mm/yyyy - Weekday`), merges `Time`, `Room No.`, and `Total Students per Session` cells across multi-course slots (`k > 1`), displays cleaned instructor names (`_clean_instructor`), and resolves room names from `allocated_rooms` (falling back to slot seating rooms).
- **Seating Excel (`exports.seating_xlsx`):** Creates one worksheet per room (tab title truncated to Excel's `31`-character limit), prints `Column XX` and `COURSE - Teacher` / `— (Vacant)` headers, sets uniform column width `20` and row heights (`24` head, `28` sub-head, `20` data), and renders `max(room.rows, max(len(col.roll_nos)))` rows so empty buffer chairs always appear.
- **Seating UI Rendering (`SeatingPlanPage.jsx`):** Uses `Math.max(room.rows || 0, ...sheet.columns.map(c => c.roll_nos.length), 0)` with `26px` table cell height so trailing empty buffer seats never collapse in browser or print views.
- **Roll Slip PDF (`exports.roll_slip_pdf` / `roll_slips_pdf`):** A4 `190mm` usable table width (`15mm` auto page-break margin), sorts papers chronologically, truncates course titles over `32` chars (`title[:29] + "..."`), prints Notes `i–iv`, and appends an IT-Center timestamp footer.
