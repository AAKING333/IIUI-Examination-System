"""SQLite persistence for the examination portal."""
import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional


DATABASE_PATH = Path(os.environ.get(
    "EXAM_PORTAL_DB",
    str(Path(__file__).with_name("exam_portal.sqlite3")),
))


class _ClosingConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


class SQLiteDatabase:
    def __init__(self, path: Path = DATABASE_PATH):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def connect(self):
        connection = sqlite3.connect(
            str(self.path), timeout=30, factory=_ClosingConnection,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize(self):
        with self.connect() as connection:
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS rooms (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    rows INTEGER NOT NULL,
                    columns_count INTEGER NOT NULL,
                    capacity INTEGER NOT NULL,
                    department TEXT NOT NULL DEFAULT '',
                    reserve_capacity INTEGER NOT NULL DEFAULT 0,
                    invigilators_required INTEGER NOT NULL DEFAULT 1,
                    room_type TEXT NOT NULL DEFAULT 'hall'
                );
                CREATE TABLE IF NOT EXISTS courses (
                    code TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    credit_hours INTEGER NOT NULL DEFAULT 3,
                    is_lab INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS students (
                    roll_no TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    father_name TEXT NOT NULL,
                    program TEXT NOT NULL,
                    batch TEXT NOT NULL,
                    section TEXT NOT NULL,
                    faculty TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS instructor_assignments (
                    id TEXT PRIMARY KEY,
                    program TEXT NOT NULL,
                    batch TEXT NOT NULL,
                    section TEXT NOT NULL,
                    course_code TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
                    instructor TEXT NOT NULL,
                    UNIQUE(program, batch, section, course_code)
                );
                CREATE TABLE IF NOT EXISTS enrolments (
                    roll_no TEXT NOT NULL REFERENCES students(roll_no) ON DELETE CASCADE,
                    course_code TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
                    type TEXT NOT NULL CHECK(type IN ('regular', 'back')),
                    attendance_percent REAL NOT NULL DEFAULT 100,
                    PRIMARY KEY(roll_no, course_code)
                );
                CREATE TABLE IF NOT EXISTS time_slots (
                    id TEXT PRIMARY KEY,
                    date TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    label TEXT NOT NULL DEFAULT '',
                    slot_type TEXT NOT NULL DEFAULT 'written'
                );
                CREATE TABLE IF NOT EXISTS datesheet_versions (
                    version INTEGER PRIMARY KEY,
                    status TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    is_current INTEGER NOT NULL DEFAULT 1
                );
                CREATE TABLE IF NOT EXISTS invigilation_duties (
                    id TEXT PRIMARY KEY,
                    slot_id TEXT NOT NULL,
                    room_id TEXT NOT NULL,
                    instructor TEXT NOT NULL,
                    duty_type TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'assigned',
                    source TEXT NOT NULL DEFAULT 'auto',
                    is_counted INTEGER NOT NULL DEFAULT 1,
                    notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT '',
                    UNIQUE(slot_id, room_id, instructor)
                );
                CREATE TABLE IF NOT EXISTS umc_reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    slot_id TEXT NOT NULL,
                    room_id TEXT NOT NULL,
                    roll_no TEXT NOT NULL,
                    course_code TEXT NOT NULL,
                    invigilator TEXT NOT NULL,
                    details TEXT NOT NULL,
                    evidence TEXT NOT NULL DEFAULT '[]',
                    signature_data TEXT NOT NULL DEFAULT '',
                    student_statement TEXT NOT NULL DEFAULT '',
                    invigilator_remarks TEXT NOT NULL DEFAULT '',
                    instructor_comments TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'reported',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS custom_seating_plans (
                    slot_id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS faculty_policy (
                    instructor_name TEXT PRIMARY KEY,
                    role TEXT NOT NULL DEFAULT 'regular',
                    max_extra_duties INTEGER,
                    notes TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL DEFAULT ''
                );
            """)
            columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(umc_reports)")
            }
            if "signature_data" not in columns:
                connection.execute(
                    "ALTER TABLE umc_reports ADD COLUMN signature_data TEXT NOT NULL DEFAULT ''"
                )
            enrolment_columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(enrolments)")
            }
            if "attendance_percent" not in enrolment_columns:
                connection.execute(
                    "ALTER TABLE enrolments ADD COLUMN attendance_percent REAL NOT NULL DEFAULT 100"
                )

            # Invigilation roster migrations.  Existing installations may have
            # the original table without manual-override metadata.
            duty_columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(invigilation_duties)")
            }
            duty_migrations = (
                ("source", "TEXT NOT NULL DEFAULT 'auto'"),
                ("is_counted", "INTEGER NOT NULL DEFAULT 1"),
                ("notes", "TEXT NOT NULL DEFAULT ''"),
                ("updated_at", "TEXT NOT NULL DEFAULT ''"),
            )
            for column, definition in duty_migrations:
                if column not in duty_columns:
                    connection.execute(
                        f"ALTER TABLE invigilation_duties ADD COLUMN {column} {definition}"
                    )
            connection.execute(
                "UPDATE invigilation_duties "
                "SET is_counted = CASE WHEN duty_type = 'extra' THEN 1 ELSE 0 END"
            )
            connection.execute(
                "UPDATE invigilation_duties SET updated_at = created_at WHERE updated_at = ''"
            )

            # A lab course can legitimately be split across multiple lab rooms
            # with the same course instructor.  The service enforces one room
            # per instructor for halls and prevents lab/hall overlaps; a global
            # (slot, instructor) database index would incorrectly reject the
            # split-lab case.
            connection.execute("DROP INDEX IF EXISTS idx_invigilation_slot_instructor")

            # Buffer seats rule: buffer seats only in large rooms (capacity >= 50, e.g. Room 18 and Room 26).
            # Smaller rooms (< 50) and labs must have 0 reserve capacity.
            connection.execute("UPDATE rooms SET reserve_capacity = 0 WHERE capacity < 50 OR room_type = 'lab'")
            connection.execute("UPDATE rooms SET reserve_capacity = 10 WHERE capacity >= 50 AND room_type != 'lab'")

    def load_master_data(self) -> Optional[Dict[str, List[Dict[str, Any]]]]:
        with self.connect() as connection:
            if connection.execute("SELECT COUNT(*) FROM rooms").fetchone()[0] == 0:
                return None

            rooms = [dict(row) for row in connection.execute(
                "SELECT id, name, rows, columns_count, capacity, department, "
                "reserve_capacity, invigilators_required, room_type FROM rooms"
            )]
            for room in rooms:
                room["columns"] = room.pop("columns_count")

            courses = [dict(row) for row in connection.execute(
                "SELECT code, title, credit_hours, is_lab FROM courses"
            )]
            for course in courses:
                course["is_lab"] = bool(course["is_lab"])

            students = [dict(row) for row in connection.execute(
                "SELECT roll_no, name, father_name, program, batch, section, faculty FROM students"
            )]
            enrolments: Dict[str, List[Dict[str, str]]] = {}
            for row in connection.execute("SELECT roll_no, course_code, type, attendance_percent FROM enrolments"):
                enrolments.setdefault(row["roll_no"], []).append({
                    "course": row["course_code"], "type": row["type"],
                    "attendance_percent": row["attendance_percent"],
                })
            for student in students:
                student["enrolments"] = enrolments.get(student["roll_no"], [])
                student["courses"] = [item["course"] for item in student["enrolments"]]

            assignments = [dict(row) for row in connection.execute(
                "SELECT id, program, batch, section, course_code, instructor "
                "FROM instructor_assignments"
            )]
            slots = [dict(row) for row in connection.execute(
                "SELECT id, date, start_time, end_time, label, slot_type FROM time_slots"
            )]
            return {
                "rooms": rooms,
                "courses": courses,
                "students": students,
                "instructor_assignments": assignments,
                "time_slots": slots,
            }

    def save_master_data(self, store):
        with self.connect() as connection:
            connection.execute("BEGIN")
            for table in (
                "enrolments", "instructor_assignments", "students", "courses",
                "rooms", "time_slots",
            ):
                connection.execute(f"DELETE FROM {table}")

            connection.executemany(
                "INSERT INTO rooms (id, name, rows, columns_count, capacity, department, "
                "reserve_capacity, invigilators_required, room_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [(
                    room["id"], room["name"], room["rows"], room["columns"],
                    room["capacity"], room.get("department", ""),
                    room.get("reserve_capacity", 0), room.get("invigilators_required", 1),
                    room.get("room_type", "hall"),
                ) for room in store.rooms],
            )
            connection.executemany(
                "INSERT INTO courses (code, title, credit_hours, is_lab) VALUES (?, ?, ?, ?)",
                [(
                    course["code"], course["title"], course.get("credit_hours", 3),
                    int(bool(course.get("is_lab", False))),
                ) for course in store.courses],
            )
            connection.executemany(
                "INSERT INTO students (roll_no, name, father_name, program, batch, section, faculty) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                [(
                    student["roll_no"], student["name"], student["father_name"],
                    student["program"], student["batch"], student["section"],
                    student["faculty"],
                ) for student in store.students],
            )
            connection.executemany(
                "INSERT INTO instructor_assignments "
                "(id, program, batch, section, course_code, instructor) VALUES (?, ?, ?, ?, ?, ?)",
                [(
                    item["id"], item["program"], item["batch"], item["section"],
                    item["course_code"], item["instructor"],
                ) for item in store.instructor_assignments],
            )
            connection.executemany(
                "INSERT INTO enrolments (roll_no, course_code, type, attendance_percent) VALUES (?, ?, ?, ?)",
                [(
                    student["roll_no"], item["course"], item.get("type", "regular"),
                    item.get("attendance_percent", 100),
                ) for student in store.students for item in student.get("enrolments", [])],
            )
            connection.executemany(
                "INSERT INTO time_slots (id, date, start_time, end_time, label, slot_type) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                [(
                    slot["id"], slot["date"], slot["start_time"], slot["end_time"],
                    slot.get("label", ""), slot.get("slot_type", "written"),
                ) for slot in store.time_slots],
            )

    def load_datesheet(self) -> Dict[str, Any]:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT payload FROM datesheet_versions WHERE is_current = 1 "
                "ORDER BY version DESC LIMIT 1"
            ).fetchone()
        return json.loads(row["payload"]) if row else {
            "datesheet": [], "unplaced": [], "total_capacity_per_slot": 0,
        }

    def get_datesheet_versions(self) -> List[Dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT version, status, created_at, is_current "
                "FROM datesheet_versions ORDER BY version DESC"
            ).fetchall()
        return [dict(row) for row in rows]

    def publish_datesheet(self, result: Dict[str, Any], created_at: str) -> Dict[str, Any]:
        with self.connect() as connection:
            connection.execute("BEGIN")
            current = connection.execute(
                "SELECT COALESCE(MAX(version), 0) FROM datesheet_versions"
            ).fetchone()[0]
            version = current + 1
            connection.execute(
                "UPDATE datesheet_versions SET is_current = 0, status = 'SUPERSEDED' "
                "WHERE is_current = 1"
            )
            published = {
                **result, "version": version, "status": "PUBLISHED",
                "published_at": created_at,
            }
            connection.execute(
                "INSERT INTO datesheet_versions (version, status, payload, created_at, is_current) "
                "VALUES (?, 'PUBLISHED', ?, ?, 1)",
                (version, json.dumps(published), created_at),
            )
        return published

    def supersede_datesheet(self):
        with self.connect() as connection:
            row = connection.execute(
                "SELECT version, payload FROM datesheet_versions WHERE is_current = 1"
            ).fetchone()
            if not row:
                return None
            payload = json.loads(row["payload"])
            payload["status"] = "SUPERSEDED"
            connection.execute(
                "UPDATE datesheet_versions SET status = 'SUPERSEDED', payload = ? "
                "WHERE version = ?",
                (json.dumps(payload), row["version"]),
            )
            return payload

    def reset_operational_data(self):
        with self.connect() as connection:
            connection.execute("DELETE FROM datesheet_versions")
            connection.execute("DELETE FROM invigilation_duties")
            connection.execute("DELETE FROM umc_reports")

    def replace_invigilation_duties(self, duties: List[Dict[str, Any]]):
        with self.connect() as connection:
            connection.execute("BEGIN")
            connection.execute("DELETE FROM invigilation_duties")
            connection.executemany(
                "INSERT INTO invigilation_duties "
                "(id, slot_id, room_id, instructor, duty_type, status, source, "
                "is_counted, notes, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [(
                    duty["id"], duty["slot_id"], duty["room_id"], duty["instructor"],
                    duty["duty_type"], duty.get("status", "assigned"),
                    duty.get("source", "auto"),
                    int(duty.get("is_counted", 1 if duty["duty_type"] == "extra" else 0)),
                    duty.get("notes", ""), duty["created_at"],
                    duty.get("updated_at") or duty["created_at"],
                ) for duty in duties],
            )

    def get_invigilation_duties(
        self, slot_id: Optional[str] = None, instructor: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        query = "SELECT * FROM invigilation_duties WHERE 1 = 1"
        params = []
        if slot_id:
            query += " AND slot_id = ?"
            params.append(slot_id)
        if instructor:
            query += " AND instructor LIKE ?"
            params.append(f"%{instructor}%")
        query += " ORDER BY slot_id, room_id, instructor"
        with self.connect() as connection:
            return [dict(row) for row in connection.execute(query, params)]

    def get_invigilation_duty(self, duty_id: str) -> Optional[Dict[str, Any]]:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM invigilation_duties WHERE id = ?", (duty_id,)
            ).fetchone()
        return dict(row) if row else None

    def add_invigilation_duty(self, duty: Dict[str, Any]) -> Dict[str, Any]:
        with self.connect() as connection:
            connection.execute(
                "INSERT INTO invigilation_duties "
                "(id, slot_id, room_id, instructor, duty_type, status, source, "
                "is_counted, notes, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    duty["id"], duty["slot_id"], duty["room_id"], duty["instructor"],
                    duty["duty_type"], duty.get("status", "assigned"),
                    duty.get("source", "manual"),
                    int(duty.get("is_counted", 1 if duty["duty_type"] == "extra" else 0)),
                    duty.get("notes", ""), duty["created_at"],
                    duty.get("updated_at") or duty["created_at"],
                ),
            )
        return self.get_invigilation_duty(duty["id"])

    def update_invigilation_duty(
        self, duty_id: str, values: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        allowed = {
            "instructor", "status", "notes", "duty_type", "is_counted",
            "source", "updated_at",
        }
        updates = {
            key: value for key, value in values.items()
            if key in allowed and value is not None
        }
        if not updates:
            return self.get_invigilation_duty(duty_id)
        assignments = ", ".join(f"{key} = ?" for key in updates)
        with self.connect() as connection:
            cursor = connection.execute(
                f"UPDATE invigilation_duties SET {assignments} WHERE id = ?",
                [*updates.values(), duty_id],
            )
            if cursor.rowcount == 0:
                return None
        return self.get_invigilation_duty(duty_id)

    def delete_invigilation_duty(self, duty_id: str) -> bool:
        with self.connect() as connection:
            cursor = connection.execute(
                "DELETE FROM invigilation_duties WHERE id = ?", (duty_id,)
            )
            return cursor.rowcount > 0

    def delete_invigilation_duties_for_slot(self, slot_id: str) -> int:
        with self.connect() as connection:
            cursor = connection.execute(
                "DELETE FROM invigilation_duties WHERE slot_id = ?", (slot_id,)
            )
            return cursor.rowcount

    def clear_invigilation_duties(self) -> int:
        with self.connect() as connection:
            cursor = connection.execute("DELETE FROM invigilation_duties")
            return cursor.rowcount

    # ------------------------------------------------------------------
    # Faculty policy (admin-managed roles / duty caps / added faculty)
    # ------------------------------------------------------------------

    def get_faculty_policy(self, instructor_name: str) -> Optional[Dict[str, Any]]:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM faculty_policy WHERE instructor_name = ?",
                (instructor_name,),
            ).fetchone()
        return dict(row) if row else None

    def list_faculty_policy(self) -> List[Dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM faculty_policy ORDER BY instructor_name"
            ).fetchall()
        return [dict(row) for row in rows]

    def upsert_faculty_policy(self, policy: Dict[str, Any]) -> Dict[str, Any]:
        with self.connect() as connection:
            connection.execute(
                "INSERT INTO faculty_policy "
                "(instructor_name, role, max_extra_duties, notes, updated_at) "
                "VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(instructor_name) DO UPDATE SET "
                "role = excluded.role, "
                "max_extra_duties = excluded.max_extra_duties, "
                "notes = excluded.notes, "
                "updated_at = excluded.updated_at",
                (
                    policy["instructor_name"],
                    policy.get("role", "regular"),
                    policy.get("max_extra_duties"),
                    policy.get("notes", ""),
                    policy["updated_at"],
                ),
            )
        return self.get_faculty_policy(policy["instructor_name"])

    def delete_faculty_policy(self, instructor_name: str) -> bool:
        with self.connect() as connection:
            cursor = connection.execute(
                "DELETE FROM faculty_policy WHERE instructor_name = ?",
                (instructor_name,),
            )
            return cursor.rowcount > 0

    def create_umc_report(self, report: Dict[str, Any], timestamp: str) -> Dict[str, Any]:
        with self.connect() as connection:
            cursor = connection.execute(
                "INSERT INTO umc_reports "
                "(slot_id, room_id, roll_no, course_code, invigilator, details, evidence, "
                "signature_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    report["slot_id"], report["room_id"], report["roll_no"],
                    report["course_code"], report["invigilator"], report["details"],
                    json.dumps(report.get("evidence", [])), report.get("signature_data", ""),
                    timestamp, timestamp,
                ),
            )
            report_id = cursor.lastrowid
        return self.get_umc_report(report_id)

    def get_umc_report(self, report_id: int) -> Optional[Dict[str, Any]]:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM umc_reports WHERE id = ?", (report_id,)
            ).fetchone()
        if not row:
            return None
        report = dict(row)
        report["evidence"] = json.loads(report["evidence"])
        return report

    def get_umc_reports(
        self, status: Optional[str] = None, roll_no: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        query = "SELECT id FROM umc_reports WHERE 1 = 1"
        params = []
        if status:
            query += " AND status = ?"
            params.append(status)
        if roll_no:
            query += " AND roll_no LIKE ?"
            params.append(f"%{roll_no}%")
        query += " ORDER BY created_at DESC, id DESC"
        with self.connect() as connection:
            ids = [row["id"] for row in connection.execute(query, params)]
        return [self.get_umc_report(report_id) for report_id in ids]

    def update_umc_report(self, report_id: int, values: Dict[str, Any], timestamp: str):
        allowed = {
            "student_statement", "invigilator_remarks", "instructor_comments", "status",
        }
        updates = {key: value for key, value in values.items() if key in allowed and value is not None}
        if not updates:
            return self.get_umc_report(report_id)
        updates["updated_at"] = timestamp
        assignments = ", ".join(f"{key} = ?" for key in updates)
        with self.connect() as connection:
            cursor = connection.execute(
                f"UPDATE umc_reports SET {assignments} WHERE id = ?",
                [*updates.values(), report_id],
            )
            if cursor.rowcount == 0:
                return None
        return self.get_umc_report(report_id)

    def save_custom_seating_plan(self, slot_id: str, plan: Dict[str, Any], timestamp: str) -> None:
        with self.connect() as connection:
            connection.execute(
                "INSERT INTO custom_seating_plans (slot_id, payload, updated_at) "
                "VALUES (?, ?, ?) "
                "ON CONFLICT(slot_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
                (slot_id, json.dumps(plan), timestamp),
            )

    def get_custom_seating_plan(self, slot_id: str) -> Optional[Dict[str, Any]]:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT payload FROM custom_seating_plans WHERE slot_id = ?",
                (slot_id,),
            ).fetchone()
        if not row:
            return None
        return json.loads(row["payload"])

    def delete_custom_seating_plan(self, slot_id: str) -> bool:
        with self.connect() as connection:
            cursor = connection.execute(
                "DELETE FROM custom_seating_plans WHERE slot_id = ?",
                (slot_id,),
            )
            return cursor.rowcount > 0


database = SQLiteDatabase()
