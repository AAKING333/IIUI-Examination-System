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

### 1.3 Unified Course Co-Scheduling (Same Slot for All Batches & Sections)
- **Simultaneous Examination for All Cohorts:** If a written theory course (e.g., Operating Systems `CS342`, OOP `CS212`, MAD `IT332`) is taken by multiple degree programs (BSCS, BSIT), batches, or sections, all enrolled students and sections are scheduled in the **exact same time slot (`slot_id`)**.
- **No Split Paper Sessions:** A course never has its sections/batches scattered across different time slots or dates.
- **Cross-Program Column Alternation in Halls:** For large multi-program courses exceeding single-course half-capacity (> 145 students across BSCS and BSIT), seating plans split the course into program-level cohorts (e.g., `CS212-CS` and `CS212-IT`) that alternate columns in the halls, ensuring 100% capacity utilization without adjacent student paper sharing.
- **Teacher Co-Scheduling Allowance:** An instructor teaching multiple sections of the *same* course (e.g. Dr. Asim Munir for Sec A and Sec B of `CS342`) is permitted to have all those sections in the same slot. Clashes strictly prevent an instructor from having two *different* courses in the same slot.

### 1.4 Course Eligibility & Ordering
- **Zero-Enrolment Exclusion:** Courses with `0` enrolled students (`len(student_roll_numbers) == 0`) are excluded from the generated datesheet.
- **Conflict-Degree Priority Ordering:** Course/section units are sorted by potential clashes (shared students, instructor, or course code), then by enrolled student count descending. Available time slots are processed chronologically by `(date, start_time)`.

### 1.5 Slot Capacity & Hall vs Lab Venue Allocation
1. **Separation of Venues:** Written examinations are scheduled in examination halls (`room_type != 'lab'`), while practical lab examinations are scheduled in computer labs (`room_type == 'lab'`).
2. **No Fixed Lab Slots:** Slots are not fixed to `slot_type == 'lab'`. Any time slot can accommodate written exams in halls and lab exams in computer labs simultaneously without mutual exclusion.
3. **Per-Venue Capacity Ceilings:** Written papers in a slot must not exceed total hall capacity (`sum(hall.capacity)`), and lab papers in a slot must not exceed total lab capacity (`sum(lab.capacity)`).
4. **Pass 1 & Pass 2 Scheduling:** Evenly places courses across slots ensuring alternating column feasibility, teacher clash prevention, and student day/slot bounds.

### 1.6 Atomic Generation Gate (API)
- `POST /api/datesheet/generate` rejects generation with **HTTP 400** if no time slots or no courses exist.
- If **any** schedulable course remains unplaced (`unplaced` non-empty), the endpoint aborts with **HTTP 422** and does **not** save or expose a partial datesheet.

---

## 2. Seating Plan & Hall Allocation Rules

Implemented in `backend/seating.py` (`build_seating_plan`, `courses_fit_in_rooms`, `build_seating_sheet`).

### 2.1 Strict 2-Paper Column Alternation & Adjacency Rules
1. **Max 2 Papers Per Room:** Courses in a slot are sorted by student count and partitioned into pairs. In any examination room, at most 2 examination papers are seated together in alternating columns.
2. **Column Alternation (`column_papers`):**
   - **2 Papers in Room:** Columns strictly alternate `Paper 0` (Col 01, 03, 05...) and `Paper 1` (Col 02, 04, 06...).
   - **1 Paper in Room:** Occupied columns occupy even 0-based indices (`0, 2, 4...` -> Col 01, 03, 05...) separated by `— (Vacant)` columns (`1, 3, 5...` -> Col 02, 04, 06...).
3. **Anti-Cheating Adjacency Rule (Different Course or Different Instructor):** Horizontally adjacent seats (`grid[r][c]` and `grid[r][c + 1]`) must **NEVER** share both the same `course_code` and the same `instructor` (`check_adjacent_columns`). At least one attribute must differ (`course_1 != course_2` OR `instructor_1 != instructor_2`). If both course and instructor are identical (same exam question paper), the columns must never sit side-by-side and must alternate with `— (Vacant)` buffer columns to completely eliminate side-by-side cheating.
4. **Top-to-Bottom Column Fill:** Within every column, roll numbers read vertically from front (`Row 1`) to back (`Row R`).

### 2.2 `(Course, Teacher)` Contiguous Grouping & Clean Columns
1. **Per-Student Teacher Resolution (`_resolve_student_teacher` & `DataStore.get_instructor_for_student_course`):** Resolves each enrolled student's instructor using exact `(program, batch, section)` match from the timetable.
2. **Same-Teacher Merging (`_course_teacher_groups`):** Students in the same course taught by the **same teacher** across different sections or batches are grouped into one contiguous block.
3. **Clean Column Boundaries:** Each `(course, teacher)` group begins at the top (`Row 1`) of a new column; different teachers of the same course never share a column.

### 2.3 Buffer Optimization & Zero Empty Column Waste
1. **Natural Trailing Buffers:** When a teacher group finishes, any remaining unused seats at the bottom of the final occupied column (`rem_in_last`) serve as natural trailing buffer chairs.
2. **No Dummy Buffer Columns:** The system does not consume entire empty columns for buffer, preventing artificial vacant columns labeled with teacher names.
3. **Vacant Column Display:** Any column without seated students displays `— (Vacant)`. Rooms with 0 seated students are pruned automatically.

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

### 2.6 Computer Lab Seating Rules (Lab 2, Lab 3, Lab 4, Lab 5)
1. **Designated Lab Inventory:** The available computer labs are `Lab 2`, `Lab 3`, `Lab 4`, and `Lab 5` (each 5 rows $\times$ 5 columns, 25 workstations).
2. **Dedicated Teacher per Lab:** Each computer lab is assigned to exactly **one teacher** and their enrolled students (`har lab ma aik teacher apnay students ka paper la ga`). Different teachers or courses are never mixed in the same lab.
3. **No Alternating Column Logic:** Alternating column logic (between courses or alternating vacant columns) does **NOT** apply to computer labs (`alternate column for courses wala logic labs ma nhi ha`). Students are seated contiguously column by column (`Col 01`, `Col 02`, `Col 03`...) from front to back.
4. **Clean Trailing Vacancy:** Once all students under that instructor are seated, any trailing unused columns at the end of the lab are designated `— (Vacant)`.
5. **Full Usable Capacity:** All workstations in the lab are usable (`usable_capacity = rows * columns = 25`), filling laboratories contiguously column by column.
6. **Single Invigilator (Course Instructor):** For computer labs, exactly **1 invigilator** is assigned per lab room (`labs ka liye 1 invigilator jo keh course instructor hoga woh kafi ha`). That invigilator is strictly the **course instructor** conducting their lab exam; duty category is marked `own_subject` (exempt from extra duty quotas), and no external faculty are drafted.

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
- **Factory Reset Rule:** `POST /api/reset-data` restores reference-date-sheet seed data: `6` examination halls (`270` seats), `4` computer labs (`Lab 2, 3, 4, 5` — `100` workstations), `46` courses (including `SE346` E-Commerce), `142` instructor assignments, and `675` students across BSCS/BSIT batches F23–F26. All students are enrolled according to the Fall 2026 timetable course load. The seed has `24` written/lab time slots across six exam days. Reset also clears published datesheet versions, duties, UMC reports, and the seating cache. SQLite is stored in `backend/exam_portal.sqlite3` by default; set `EXAM_PORTAL_DB` to override the path.

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

### 5.3 Official Datesheet Reference Layout (Excel, PDF, UI & Print)
Matches `doc/reference_datesheet.xlsx` structure:
1. **Institutional Header Block:**
   - `INTERNATIONAL ISLAMIC UNIVERSITY` (Times New Roman, bold, centered)
   - `DEPARTMENT OF COMPUTER SCIENCE & INFORMATION TECHNOLOGY` (Times New Roman, bold, centered)
   - `MIDTERM EXAMS DATESHEET (MALE) - FALL 2026` (Times New Roman, bold, centered)
   - `Version {version}` (Times New Roman, bold/italic, centered)
2. **7 Canonical Columns:**
   - `Date  (Day)`: Formatted time session window (e.g. `08:45 - 10:15`), vertically merged/rowSpanned across all courses in that session.
   - `Course`: Spaced course code and title (e.g. `IT 332 Mobile Application Development`, `CS 212 Object Oriented Programming`).
   - `Instructor`: Comma-separated list of course instructors for that slot (cleaned, deduplicated).
   - `Batch(es)`: Combined cohort badge notation (e.g. `BSCS F26/BSIT F26`, `BSCS F24`).
   - `Room No.`: Allocated examination room numbers or computer labs (e.g. `Room 25, Room 26` / `Lab 2, Lab 3`). Merged across the session if uniform.
   - `Students Count`: Number of students enrolled in that specific course in this session.
   - `Total Students per Session`: Total students taking exams in that time window, vertically merged/rowSpanned across all courses of the session.
3. **Grouping & Visual Spacing:**
   - Grouped by Date with full-width banner rows (`DD/MM/YYYY - DayName`, e.g. `26/10/2026 - Monday`).
   - Grouped by Session Window with unique course aggregation (multiple sections/teachers of the same course combine into a single clean course row).
   - Spacer rows between distinct time sessions.
4. **Export Endpoints:**
   - `GET /api/datesheet/export.xlsx` (`datesheet_xlsx`): Generates openpyxl workbook matching `doc/reference_datesheet.xlsx` row-for-row with cell merges, borders, and column widths.
   - `GET /api/datesheet/export.pdf` (`datesheet_pdf`): Generates Landscape A4 PDF with table, headers, date banners, and rowSpanned sessions.
   - **Frontend UI & Print (`DatesheetPage.jsx`):** Matches the exact 7 columns and institutional layout on screen, with `@media print` CSS optimizing the layout for clean paper printing.

### 5.4 Seating & Roll Slip Rendering Rules
- **Seating Excel (`exports.seating_xlsx`):** Creates one worksheet per room (tab title truncated to Excel's `31`-character limit), prints `Column XX` and `COURSE - Teacher` / `— (Vacant)` headers, sets uniform column width `20` and row heights (`24` head, `28` sub-head, `20` data), and renders `max(room.rows, max(len(col.roll_nos)))` rows so empty buffer chairs always appear.
- **Seating UI Rendering (`SeatingPlanPage.jsx`):** Uses `Math.max(room.rows || 0, ...sheet.columns.map(c => c.roll_nos.length), 0)` with `26px` table cell height so trailing empty buffer seats never collapse in browser or print views.
- **Roll Slip PDF (`exports.roll_slip_pdf` / `roll_slips_pdf`):** A4 `190mm` usable table width (`15mm` auto page-break margin), sorts papers chronologically, truncates course titles over `32` chars (`title[:29] + "..."`), prints Notes `i–iv`, and appends an IT-Center timestamp footer.

### 5.5 Room Utilization, Co-Scheduling & Stream Seating Rules
- **At Least 90% Room Utilization:** Examination halls must be utilized efficiently. In slots with written exams, courses from different cohorts/batches are co-scheduled together (e.g. `IT332` [180 students, Batch F23] paired with `CS344` [65 students, Batch F24] and `M101` [15 students]) to achieve >= 90% (e.g. 95.9%) hall utilization across Room 25, 26, 27, 18, 21, and 28.
- **Strict Anti-Cheating Column Alternation:**
  - In every room, adjacent columns must never share both the same course and instructor (`(course_a != course_b) or (instructor_a != instructor_b)`).
  - Even columns and odd columns draw from distinct streams (`Stream 0` and `Stream 1`).
  - When courses share an instructor or have multiple instructors (e.g., Dr. Muhammad Adeel vs. Mr. Abid Jamil), teacher groups are partitioned strictly across opposite streams to prevent adjacent duplication.
  - Zero vacant alternate columns exist in full halls; trailing buffer chairs (>= 5 chairs) are kept at the end of the final room.
- **Single Source of Truth & Immediate SQLite Persistence:**
  - All room dimensions, courses, instructor assignments, students, and time slots are persisted immediately to `backend/exam_portal.sqlite3` via `self.save()` on every mutation.
  - Exact hall and lab dimensions configured in database: Room 25 (7x5=35), Room 26 (10x7=70), Room 27 (7x5=35), Room 18 (10x6=60), Room 21 (7x5=35), Room 28 (7x5=35), and Labs 2, 3, 4, 5 (5x5=25 each).

### 5.6 Session Capacity & Strict Room Type Isolation Rules
- **Maximum 330 Students per Slot:** In any single examination session / time slot, the total student count across all scheduled courses (written + lab) must not exceed round about 330 students (`max <= 330`).
- **Strict Room Type Isolation:**
  - **Lab Exams:** Must strictly and exclusively be allocated to Computer Labs (`Lab 2`, `Lab 3`, `Lab 4`, `Lab 5`). Lab courses must NEVER be assigned to an examination hall room.
  - **Written Exams:** Must strictly and exclusively be allocated to Examination Halls (`Room 25`, `Room 26`, `Room 27`, `Room 18`, `Room 21`, `Room 28`). Written courses must NEVER be assigned to a computer lab room.
  - **Real-Time Seating Synchronization:** Datesheet room pills and export columns strictly verify `is_lab == is_lab_room` and match the exact seated course code in each room's grid.
