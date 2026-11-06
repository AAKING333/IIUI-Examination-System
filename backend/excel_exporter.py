"""
excel_exporter.py
-----------------
Generates professional IIUI-styled Excel workbooks for exams:
  - Header: International Islamic University, Islamabad
  - Faculty: Department of Computer Science & Information Technology
  - Campus: Male Campus (Fall 2026)
  - Sheets:
    Sheet 1: Datesheet (Date, Time, Course, Instructor, Batch, Enrolled, Rooms)
    Sheet 2: Roll No. Slips (Student, Roll No, Batch, Course, Instructor, Date, Slot, Room, Seat)
    Sheet 3+: Seating Charts (Per Room x Slot, showing Course, Teacher, Roll No, Student Name)
"""

from __future__ import annotations
import io
from datetime import datetime
from typing import List, Dict

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.properties import PageSetupProperties

# ── IIUI academic green palette ─────────────────────────────────────────────
COLOR_BANNER_BG    = "004D25"   # Deep IIUI green
COLOR_PRIMARY      = "006633"   # Primary green
COLOR_SECONDARY    = "008744"   # Accent green
COLOR_ACCENT_ROW   = "F1F8F3"   # Very subtle light green
COLOR_INFO_BG      = "E8F5E9"   # Info-bar green tint
COLOR_WHITE        = "FFFFFF"
COLOR_MUTED_BORDER = "C9DCCF"
COLOR_MUTED_TEXT   = "64748B"

thin_side   = Side(style="thin", color=COLOR_MUTED_BORDER)
THIN_BORDER = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)

# Soft pastel fills for distinguishing seating columns
TEACHER_COLUMN_FILLS = [
    "E8F5E9",  # Soft Green
    "F1F8E9",  # Soft Lime
    "E0F2F1",  # Soft Teal
    "FFF8E1",  # Soft Amber
    "F3E5F5",  # Soft Lilac
    "E3F2FD",  # Soft Blue
]


def _cell_font(bold=False, size=10, color="000000"):
    return Font(name="Calibri", bold=bold, size=size, color=color)


def _fill(hex_color: str) -> PatternFill:
    return PatternFill("solid", fgColor=hex_color)


def _safe_value(value):
    """Prevent spreadsheet formula injection from uploaded text fields."""
    if isinstance(value, str) and value and value[0] in "=+-@":
        return "'" + value
    return value


def _format_date(iso_value) -> str:
    """Format an ISO date as a compact, formal DD-Mon-YYYY string."""
    if not iso_value:
        return ""
    if isinstance(iso_value, datetime):
        return iso_value.strftime("%d-%b-%Y")
    try:
        return datetime.strptime(str(iso_value), "%Y-%m-%d").strftime("%d-%b-%Y")
    except ValueError:
        return str(iso_value)


def _apply_print_setup(
    ws,
    *,
    title_rows: str = "1:5",
    footer_prefix: str = "IIUI - Examination Branch",
) -> None:
    """Apply consistent A4 print settings so reports print cleanly."""
    ws.sheet_view.showGridLines = False
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.print_title_rows = title_rows
    ws.print_options.horizontalCentered = True
    ws.page_margins.left = 0.3
    ws.page_margins.right = 0.3
    ws.page_margins.top = 0.5
    ws.page_margins.bottom = 0.5
    ws.page_margins.header = 0.2
    ws.page_margins.footer = 0.2
    ws.oddFooter.center.text = f"{footer_prefix} | Page &P of &N"
    ws.oddFooter.center.size = 8
    ws.oddFooter.center.color = COLOR_MUTED_TEXT


_INVALID_SHEET_CHARS = set('[]:*?/\\')


def _unique_sheet_title(wb: openpyxl.Workbook, base: str) -> str:
    """Return a valid, collision-free worksheet title (max 31 chars)."""
    cleaned = "".join(ch for ch in base if ch not in _INVALID_SHEET_CHARS).strip() or "Sheet"
    cleaned = cleaned[:31]
    existing = {name.lower() for name in wb.sheetnames}
    if cleaned.lower() not in existing:
        return cleaned
    for n in range(2, 1000):
        suffix = f" ({n})"
        candidate = cleaned[: 31 - len(suffix)] + suffix
        if candidate.lower() not in existing:
            return candidate
    raise ValueError(f"Unable to create a unique sheet title for {base!r}")


def _write_iiui_header(ws, title: str, span_cols: int) -> None:
    """Standard formal IIUI institution header."""
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=span_cols)
    c1 = ws.cell(row=1, column=1, value="INTERNATIONAL ISLAMIC UNIVERSITY, ISLAMABAD")
    c1.font = Font(name="Calibri", bold=True, size=13, color=COLOR_WHITE)
    c1.fill = _fill(COLOR_BANNER_BG)
    c1.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 26

    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=span_cols)
    c2 = ws.cell(row=2, column=1, value="DEPARTMENT OF COMPUTER SCIENCE & INFORMATION TECHNOLOGY (MALE CAMPUS)")
    c2.font = Font(name="Calibri", bold=True, size=11, color="E8F5E9")
    c2.fill = _fill(COLOR_PRIMARY)
    c2.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[2].height = 22

    ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=span_cols)
    c3 = ws.cell(row=3, column=1, value=title.upper())
    c3.font = Font(name="Calibri", bold=True, size=10, color="F1F8F3")
    c3.fill = _fill(COLOR_SECONDARY)
    c3.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[3].height = 18


def _write_spacer_row(ws, row: int, span_cols: int) -> None:
    """Thin branded separator between the institution header and table header."""
    for col in range(1, span_cols + 1):
        ws.cell(row=row, column=col).fill = _fill(COLOR_ACCENT_ROW)
    ws.row_dimensions[row].height = 6


# ── Sheet 1: Datesheet ───────────────────────────────────────────────────────

def _build_datesheet_sheet(wb: openpyxl.Workbook, schedule: List[Dict]) -> None:
    ws = wb.active
    ws.title = "Datesheet"

    headers = [
        "Date (Day)", "Slot", "Timing", "Course Code",
        "Course Title", "Instructor(s)", "Enrolled", "Room No(s)."
    ]

    _write_iiui_header(ws, "Midterm Exams Datesheet (Male) - Fall 2026 | Version 1.2", len(headers))
    _write_spacer_row(ws, 4, len(headers))

    header_row = 5
    for col_idx, h in enumerate(headers, 1):
        cell = ws.cell(row=header_row, column=col_idx, value=h)
        cell.font = Font(name="Calibri", bold=True, size=10, color=COLOR_WHITE)
        cell.fill = _fill(COLOR_PRIMARY)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = THIN_BORDER
    ws.row_dimensions[header_row].height = 28

    curr_row = 6
    for idx, entry in enumerate(schedule, 1):
        bg = COLOR_ACCENT_ROW if idx % 2 == 0 else COLOR_WHITE
        fill_obj = _fill(bg)
        day = entry.get("day_label", "").split(",")[0].strip()
        row_vals = [
            f"{_format_date(entry['date'])} ({day})" if day else _format_date(entry["date"]),
            entry["slot_name"],
            entry["time"],
            entry["course_code"],
            entry["course_name"],
            entry.get("instructor_str", ""),
            entry["enrolled_count"],
            ", ".join(entry["allocated_rooms"]),
        ]
        for c_idx, val in enumerate(row_vals, 1):
            c = ws.cell(row=curr_row, column=c_idx, value=_safe_value(val))
            c.font = _cell_font()
            c.fill = fill_obj
            c.border = THIN_BORDER
            c.alignment = Alignment(
                horizontal="center" if c_idx in (1, 2, 3, 4, 7, 8) else "left",
                vertical="center",
                wrap_text=True,
            )
        ws.row_dimensions[curr_row].height = 30
        curr_row += 1

    widths = [24, 12, 22, 14, 32, 40, 11, 38]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A6"
    ws.auto_filter.ref = f"A5:{get_column_letter(len(headers))}{curr_row - 1}"
    ws.sheet_properties.tabColor = COLOR_SECONDARY
    _apply_print_setup(ws, footer_prefix="IIUI - Examination Branch - Datesheet")


# ── Sheet 2: Roll Number Slips ───────────────────────────────────────────────

def _build_roll_slips_sheet(
    wb: openpyxl.Workbook,
    seating_plans: List[Dict],
    students: List[Dict],
) -> None:
    ws = wb.create_sheet("Roll Number Slips")

    headers = [
        "S. No", "Roll Number", "Student Name", "Batch",
        "Course Code", "Instructor", "Date", "Slot & Time", "Room No.", "Seat Position"
    ]

    _write_iiui_header(ws, "Student Roll Number Slips & Seating Allotment - Fall 2026", len(headers))
    _write_spacer_row(ws, 4, len(headers))

    header_row = 5
    for col_idx, h in enumerate(headers, 1):
        c = ws.cell(row=header_row, column=col_idx, value=h)
        c.font = Font(name="Calibri", bold=True, size=10, color=COLOR_WHITE)
        c.fill = _fill(COLOR_PRIMARY)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = THIN_BORDER
    ws.row_dimensions[header_row].height = 28

    curr_row = 6
    s_no = 1
    for plan in seating_plans:
        cols = plan.get("cols", 0) or 0
        for seat in plan["seats"]:
            bg = COLOR_ACCENT_ROW if s_no % 2 == 0 else COLOR_WHITE
            fill_obj = _fill(bg)
            seat_no = (seat["row"] - 1) * cols + seat["col"] if cols else 0
            seat_label = f"Row {seat['row']}, Col {seat['col_label']}"
            if seat_no:
                seat_label += f" (Seat #{seat_no})"
            row_vals = [
                s_no,
                seat["roll_no"],
                seat["name"],
                seat.get("batch", ""),
                seat["course_code"],
                seat.get("instructor", "N/A"),
                _format_date(plan["date"]),
                f"{plan['slot_name']} ({plan['time']})",
                plan["room_id"],
                seat_label,
            ]
            for c_idx, val in enumerate(row_vals, 1):
                c = ws.cell(row=curr_row, column=c_idx, value=_safe_value(val))
                c.font = _cell_font()
                c.fill = fill_obj
                c.border = THIN_BORDER
                c.alignment = Alignment(
                    horizontal="center" if c_idx in (1, 2, 4, 5, 7, 9, 10) else "left",
                    vertical="center",
                    wrap_text=True,
                )
            ws.row_dimensions[curr_row].height = 26
            curr_row += 1
            s_no += 1

    widths = [6, 16, 24, 14, 14, 28, 14, 32, 12, 24]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A6"
    ws.auto_filter.ref = f"A5:{get_column_letter(len(headers))}{curr_row - 1}"
    ws.sheet_properties.tabColor = COLOR_SECONDARY
    _apply_print_setup(ws, footer_prefix="IIUI - Examination Branch - Roll Number Slips")


# ── Sheet 3+: Room Seating Grids with Teacher Identifiers ────────────────────

def _build_seating_chart_sheet(
    wb: openpyxl.Workbook,
    plan: Dict,
) -> None:
    base_title = f"{plan['date']} {plan['slot_name']} {plan['room_id']}"
    ws = wb.create_sheet(_unique_sheet_title(wb, base_title))

    rows = plan["rows"]
    cols = plan["cols"]
    total_cols = cols + 1

    _write_iiui_header(
        ws,
        f"Seating Chart | Hall: {plan['room_id']} | {plan['day_label']} | {plan['slot_name']} ({plan['time']})",
        total_cols,
    )

    # Info summary bar
    ws.merge_cells(start_row=4, start_column=1, end_row=4, end_column=total_cols)
    info_text = (
        f"Courses: {', '.join(plan['courses_in_room'])}   |   "
        f"Instructors: {', '.join(plan.get('instructors_in_room', []))}   |   "
        f"Total Candidates Seated: {len(plan['seats'])} / {rows * cols}"
    )
    if plan.get("rule_mode") == "fallback":
        info_text += (
            f"   |   RULE FALLBACK: {plan.get('fallback_columns', 0)} column(s) "
            "use same course with a different instructor"
        )
    info_c = ws.cell(row=4, column=1, value=info_text)
    info_c.font = Font(name="Calibri", bold=True, size=9, color=COLOR_PRIMARY)
    info_c.fill = _fill(COLOR_INFO_BG)
    info_c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[4].height = 32

    # Column Headers (Col Letter + Teacher + Course)
    col_header_map = {h["col_index"]: h for h in plan.get("column_headers", [])}
    ws.cell(row=5, column=1, value="Row \\ Col").font = Font(name="Calibri", bold=True, size=9, color=COLOR_WHITE)
    ws.cell(row=5, column=1).fill = _fill(COLOR_BANNER_BG)
    ws.cell(row=5, column=1).alignment = Alignment(horizontal="center", vertical="center")
    ws.cell(row=5, column=1).border = THIN_BORDER

    for c in range(cols):
        col_meta = col_header_map.get(c)
        letter = chr(ord("A") + c)
        if col_meta:
            header_text = f"Col {letter}\n{col_meta['course_code']}\n({col_meta['instructor']})"
        else:
            header_text = f"Col {letter}\n(EMPTY)"

        ch = ws.cell(row=5, column=c + 2, value=_safe_value(header_text))
        ch.font = Font(name="Calibri", bold=True, size=8.5, color=COLOR_WHITE)
        ch.fill = _fill(COLOR_SECONDARY)
        ch.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ch.border = THIN_BORDER
    ws.row_dimensions[5].height = 48

    # Seat Lookup
    seat_map = {(s["row"], s["col"]): s for s in plan["seats"]}

    for r in range(1, rows + 1):
        excel_row = r + 5
        rl = ws.cell(row=excel_row, column=1, value=f"Row {r}")
        rl.font = Font(name="Calibri", bold=True, size=9, color=COLOR_WHITE)
        rl.fill = _fill(COLOR_PRIMARY)
        rl.alignment = Alignment(horizontal="center", vertical="center")
        rl.border = THIN_BORDER

        for c in range(1, cols + 1):
            excel_col = c + 1
            seat = seat_map.get((r, c))
            col_fill = TEACHER_COLUMN_FILLS[(c - 1) % len(TEACHER_COLUMN_FILLS)]

            if seat:
                # Course and instructor are already shown in the column header.
                # Keeping only roll, name, and course code prevents clipped cells.
                txt = f"{seat['roll_no']}\n{seat['name']}\n[{seat['course_code']}]"
                font = Font(name="Calibri", size=8, bold=True, color="1E293B")
                fill_color = col_fill
            else:
                txt = "VACANT"
                font = Font(name="Calibri", size=8, color="94A3B8")
                fill_color = "F8FAFC"

            sc = ws.cell(row=excel_row, column=excel_col, value=_safe_value(txt))
            sc.font = font
            sc.fill = _fill(fill_color)
            sc.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            sc.border = THIN_BORDER

        ws.row_dimensions[excel_row].height = 40

    ws.column_dimensions[get_column_letter(1)].width = 12
    for c in range(1, cols + 1):
        ws.column_dimensions[get_column_letter(c + 1)].width = 26
    ws.freeze_panes = "B6"
    ws.sheet_properties.tabColor = COLOR_SECONDARY
    _apply_print_setup(
        ws,
        footer_prefix=f"IIUI - Examination Branch - {plan['room_id']}",
    )


def generate_excel(
    schedule: List[Dict],
    seating_plans: List[Dict],
    students: List[Dict],
) -> bytes:
    """Builds and exports the official IIUI examination Excel report."""
    wb = openpyxl.Workbook()

    _build_datesheet_sheet(wb, schedule)
    _build_roll_slips_sheet(wb, seating_plans, students)

    for plan in seating_plans:
        _build_seating_chart_sheet(wb, plan)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()
