"""Seating-plan generation.

STRICT 2-PAPER COLUMN ALTERNATION RULES:
  * In any room, at most 2 examination papers are seated together (e.g. PF and OS).
  * Adjacent columns strictly alternate between the two papers:
      Column 01: Paper 0
      Column 02: Paper 1
      Column 03: Paper 0
      Column 04: Paper 1 ...
    This prevents teacher/invigilator overload ("khap") by giving each hall
    only 2 distinct papers to distribute and collect.
  * If only 1 paper is in a hall:
      Columns alternate between the paper and a vacant column:
      Column 01: Paper 0
      Column 02: — (Vacant)
      Column 03: Paper 0
      Column 04: — (Vacant) ...
  * Adjacent seats NEVER share the same course code.
  * Roll numbers read down each column from front to back.
  * Students of a course sharing the same teacher (across sections/programs)
    are seated together as one contiguous block, never sharing a column with
    another teacher of the same course, and at least 5 empty buffer chairs
    are left at the end of each (course, teacher) block.
"""
import itertools
import re
from typing import List, Dict, Any, Optional, Tuple
from data import store, enrolment_type

EXTRA_EMPTY_CHAIRS = 0
_PLACEHOLDER_TEACHERS = {"unassigned", "none", "tbd", "n/a", ""}


def column_papers(room: Dict[str, Any], papers: List[Dict[str, Any]]) -> List[Optional[str]]:
    """Assigns paper code to each column of a room.

    Halls:
      Strict rule: At most 2 papers per room in alternating columns.
      - len(papers) == 0: all columns None.
      - len(papers) == 1: odd columns (0, 2, 4...) get the paper; even columns (1, 3, 5...) are vacant (None).
      - len(papers) >= 2: column 0 gets Paper 0, column 1 gets Paper 1, column 2 gets Paper 0, etc.

    Labs (room_type == 'lab'):
      No alternating columns. Exactly 1 paper per lab, occupying all columns.
    """
    cols = room["columns"]
    if not papers:
        return [None] * cols

    if room.get("room_type") == "lab":
        c0 = papers[0]["code"]
        return [c0] * cols

    if len(papers) == 1:
        c0 = papers[0]["code"]
        return [c0 if c % 2 == 0 else None for c in range(cols)]
    else:
        # Strictly pair the first two papers in this room: P0, P1, P0, P1...
        p0 = papers[0]["code"]
        p1 = papers[1]["code"]
        return [p0 if c % 2 == 0 else p1 for c in range(cols)]


def paper_column_capacity(room: Dict[str, Any], papers: List[Dict[str, Any]]) -> Dict[str, int]:
    """Max seats available per paper in this room under 2-paper alternation (or full capacity for labs)."""
    if not papers:
        return {}
    if room.get("room_type") == "lab":
        p0 = papers[0]["code"]
        return {p["code"]: (room["rows"] * room["columns"] if p["code"] == p0 else 0) for p in papers}

    target_papers = papers[:2] if len(papers) >= 2 else papers
    cap = {p["code"]: 0 for p in target_papers}
    for code in column_papers(room, target_papers):
        if code and code in cap:
            cap[code] += room["rows"]
    return cap


def clean_teacher_name(inst: str) -> str:
    """Extracts a clean, compact instructor name (e.g. 'Dr. Adeel', 'Dr. Sajid Ali Khan')."""
    if not inst:
        return ""
    # If separated by pipe, take first section's teacher
    first = inst.split("|")[0].strip()
    # Strip parenthetical comments like (All Batches: ...) or (Sec A & B) first
    without_parens = re.sub(r"\(.*?\)", "", first).strip()
    # If there is a section/batch prefix like 'BSCS Sec A: Dr. Sajid', take what's after the colon
    if ":" in without_parens:
        return without_parens.split(":", 1)[1].strip()
    return without_parens.strip()


def _normalize_teacher(raw: str) -> str:
    cleaned = clean_teacher_name(raw)
    if cleaned.strip().lower() in _PLACEHOLDER_TEACHERS:
        return ""
    return cleaned.strip()


def _resolve_student_teacher(
    student: Optional[Dict[str, Any]],
    course: Dict[str, Any],
) -> str:
    """Resolves the assigned teacher for a student's enrolment in a course."""
    if student:
        t = _normalize_teacher(store.get_instructor_for_student_course(student, course["code"]))
        if t:
            return t
    return _normalize_teacher(course.get("instructor", ""))


def _course_teacher_groups(
    course: Dict[str, Any],
    student_by_roll: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Groups a course's enrolled students by teacher so same-teacher sections stay together."""
    rolls = list(course.get("student_roll_numbers", []))
    by_teacher: Dict[str, List[str]] = {}
    for roll in rolls:
        teacher = _resolve_student_teacher(student_by_roll.get(roll), course)
        by_teacher.setdefault(teacher, []).append(roll)

    # Within every teacher group, regular students sit first and repeaters last.
    base_code = re.sub(r"-T\d+$", "", str(course.get("code") or ""))
    groups = []
    for t, rs in by_teacher.items():
        if not rs:
            continue
        rs.sort(key=lambda roll: (0 if enrolment_type(roll, base_code) == "regular" else 1, str(roll)))
        groups.append({"teacher": t, "rolls": rs})
    groups.sort(key=lambda g: (-len(g["rolls"]), g["rolls"][0], g["teacher"]))
    return groups


def _ensure_paper_groups(
    papers: List[Dict[str, Any]],
    student_by_roll: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Ensures every paper dict carries its (course, teacher) student groups."""
    enriched = []
    for p in papers:
        if "groups" in p:
            enriched.append(p)
        else:
            course_stub = {
                "code": p["code"],
                "title": p.get("title", ""),
                "instructor": p.get("instructor", ""),
                "student_roll_numbers": p.get("rolls", []),
            }
            groups = _course_teacher_groups(course_stub, student_by_roll)
            enriched.append({**p, "groups": groups})
    return enriched


def _allocate_paper_columns(
    groups: List[Dict[str, Any]],
    cols_meta: List[Tuple[int, int, int]],
    extra_empty: int = EXTRA_EMPTY_CHAIRS,
    allow_mix_teachers: bool = False,
) -> Optional[List[Dict[str, Any]]]:
    """Packs (course, teacher) groups into a paper's alternating columns.

    Each group starts at the top of a clean column (unless allow_mix_teachers=True)
    and reserves at least `extra_empty` empty chairs after its final seated student.
    Returns a list of column allocations or None if cols_meta is insufficient.
    """
    if not groups:
        return []

    if allow_mix_teachers:
        # Emergency overcapacity fallback: pack all rolls sequentially without column boundaries
        all_rolls = [(g["teacher"], r) for g in groups for r in g["rolls"]]
        total_seats = sum(h for _, _, h in cols_meta)
        if len(all_rolls) > total_seats:
            return None
        allocs = []
        idx = 0
        for r_idx, c_idx, h in cols_meta:
            if idx >= len(all_rolls):
                break
            chunk = all_rolls[idx:idx + h]
            teachers = list(dict.fromkeys(t for t, _ in chunk if t))
            allocs.append({
                "room_idx": r_idx,
                "col_idx": c_idx,
                "teacher": " / ".join(teachers),
                "rolls": [r for _, r in chunk],
            })
            idx += len(chunk)
        return allocs

    ptr = 0
    total_cols = len(cols_meta)
    allocs: List[Dict[str, Any]] = []

    for g in groups:
        rolls = g["rolls"]
        teacher = g["teacher"]
        n = len(rolls)
        if n == 0:
            continue

        idx = 0
        rem_in_last = 0
        while idx < n:
            if ptr >= total_cols:
                return None
            r_idx, c_idx, h = cols_meta[ptr]
            take = min(h, n - idx)
            allocs.append({
                "room_idx": r_idx,
                "col_idx": c_idx,
                "teacher": teacher,
                "rolls": rolls[idx:idx + take],
            })
            rem_in_last = h - take
            idx += take
            ptr += 1

    return allocs


def _partition_stream_strictly(groups: List[Dict[str, Any]], even_cap: int, odd_cap: int) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Partitions discrete (course, teacher) groups into Stream 0 (even cols) and Stream 1 (odd cols)
    so that a single (course, teacher) is never in both streams, avoiding adjacent-column clashes."""
    def _has_regular(g: Dict[str, Any]) -> bool:
        code = str(g.get("code") or "")
        if not code:
            return True
        return any(enrolment_type(r, code) == "regular" for r in g["rolls"])

    # Groups that still contain regular students queue before repeater-only groups.
    sorted_groups = sorted(
        groups,
        key=lambda g: (0 if _has_regular(g) else 1, -len(g["rolls"])),
    )
    n = len(sorted_groups)
    best_part = None
    best_diff = 999999

    for mask in range(1 << n):
        s0_cand = []
        s1_cand = []
        s0_tot = 0
        s1_tot = 0
        for i in range(n):
            g = sorted_groups[i]
            cnt = len(g["rolls"])
            if (mask >> i) & 1:
                s0_cand.append(g)
                s0_tot += cnt
            else:
                s1_cand.append(g)
                s1_tot += cnt

        if s0_tot <= even_cap and s1_tot <= odd_cap:
            diff = abs((s0_tot / max(1, even_cap)) - (s1_tot / max(1, odd_cap)))
            if diff < best_diff:
                best_diff = diff
                best_part = (s0_cand, s1_cand)

    if best_part is not None:
        return best_part

    best_overflow = 999999
    for mask in range(1 << n):
        s0_cand = []
        s1_cand = []
        s0_tot = 0
        s1_tot = 0
        for i in range(n):
            g = sorted_groups[i]
            cnt = len(g["rolls"])
            if (mask >> i) & 1:
                s0_cand.append(g)
                s0_tot += cnt
            else:
                s1_cand.append(g)
                s1_tot += cnt
        overflow = max(0, s0_tot - even_cap) + max(0, s1_tot - odd_cap)
        if overflow < best_overflow:
            best_overflow = overflow
            best_part = (s0_cand, s1_cand)

    return best_part or (sorted_groups, [])


def _paper_ordered_queue(groups: List[Dict[str, Any]]) -> List[tuple]:
    """Flattens (course, teacher) groups into a seat queue where every course's
    regular students are seated before any of its repeaters, keeping each
    section's teacher block contiguous."""
    order: List[str] = []
    buckets: Dict[str, List[tuple]] = {}
    for g in groups:
        base = re.sub(r"-T\d+$", "", str(g.get("code") or ""))
        if base not in buckets:
            buckets[base] = []
            order.append(base)
        buckets[base].extend((g["code"], g["instructor"], r) for r in g["rolls"])

    queue: List[tuple] = []
    for base in order:
        items = buckets[base]
        items.sort(key=lambda it: (
            0 if enrolment_type(it[2], base) == "regular" else 1,
            str(it[0]),
            str(it[2]),
        ))
        queue.extend(items)
    return queue


def _pack_pair_into_rooms(
    pair: List[Dict[str, Any]],
    combo: List[Dict[str, Any]],
    student_by_roll: Dict[str, Dict[str, Any]],
    extra_empty: int = EXTRA_EMPTY_CHAIRS,
    allow_mix_teachers: bool = False,
) -> Optional[Dict[str, List[Dict[str, Any]]]]:
    """Attempts to pack a 1- or 2-paper pair into the given room list."""
    target = pair[:2] if len(pair) >= 2 else pair
    target = _ensure_paper_groups(target, student_by_roll)
    packed: Dict[str, List[Dict[str, Any]]] = {}

    for p in target:
        code = p["code"]
        cols_meta: List[Tuple[int, int, int]] = []
        for r_idx, room in enumerate(combo):
            cp = column_papers(room, target)
            for c_idx, c_code in enumerate(cp):
                if c_code == code:
                    cols_meta.append((r_idx, c_idx, room["rows"]))

        allocs = _allocate_paper_columns(
            p["groups"],
            cols_meta,
            extra_empty=extra_empty,
            allow_mix_teachers=allow_mix_teachers,
        )
        if allocs is None:
            return None
        packed[code] = allocs

    return packed


def _compute_active_reserve_capacity(
    room: Dict[str, Any],
    grid: List[List[Any]],
    col_papers: List[Optional[str]],
    active_sbr: Dict[str, Dict[str, Any]],
) -> int:
    """Buffer seats rule:
    1. Buffer seats ONLY exist in large rooms (capacity >= 50, e.g. Room 18 and Room 26).
       Smaller rooms (< 50) and labs strictly have 0 buffer seats.
    2. Buffer seats are ONLY active when the room hosts a repeater course (or repeaters are seated).
    3. The buffer seats are ALWAYS the last row of the room (number of seats = room's column count).
    """
    base_cap = int(room.get("capacity", 0) or 0)
    if base_cap < 50 or room.get("room_type") == "lab":
        return 0

    cols = int(room.get("columns", 0) or 0)
    # Check if any repeater student is seated in this room
    for row in grid:
        for seat in row:
            if seat and seat.get("roll_no") and str(seat.get("roll_no")).strip().lower() != "buffer":
                r_no = seat["roll_no"]
                c_code = seat.get("course_code", "")
                if enrolment_type(r_no, c_code) == "back":
                    return cols if cols > 0 else 10

    # Check if any course scheduled in this room is a repeater course
    for p in col_papers:
        if p and p != "—" and "Vacant" not in p:
            clean_p = re.sub(r"-(CS|IT|T\d+)$", "", p)
            c = store.get_course(clean_p)
            if c:
                if c.get("back_roll_numbers"):
                    return cols if cols > 0 else 10
                if any(enrolment_type(r, clean_p) == "back" for r in c.get("student_roll_numbers", [])):
                    return cols if cols > 0 else 10

    return 0


def _search_best_combo(
    target_papers: List[Dict[str, Any]],
    total: int,
    active_rooms: List[Dict[str, Any]],
    student_by_roll: Dict[str, Dict[str, Any]],
    extra_empty: int,
    allow_mix_teachers: bool = False,
) -> Optional[List[Dict[str, Any]]]:
    """Finds the smallest-waste subset of active_rooms that satisfies packing constraints.
    Prioritizes large rooms (50+ cap: Room 26 & 18) for courses with repeaters (>= 5 repeaters)."""
    if not active_rooms:
        return None

    has_repeater_paper = any(
        (p.get("back_count", 0) >= 5 or sum(1 for r in p.get("rolls", []) if enrolment_type(r, p.get("code", "")) == "back") >= 5)
        for p in target_papers
    )

    if has_repeater_paper:
        sorted_active_rooms = sorted(
            active_rooms,
            key=lambda r: (1 if r.get("capacity", 0) >= 50 else 0, r.get("capacity", 0)),
            reverse=True,
        )
    else:
        sorted_active_rooms = sorted(active_rooms, key=lambda r: r.get("capacity", 0), reverse=True)

    # Guard combinatorial explosion if many rooms exist
    if len(sorted_active_rooms) > 12:
        if _pack_pair_into_rooms(
            target_papers, sorted_active_rooms, student_by_roll,
            extra_empty=extra_empty, allow_mix_teachers=allow_mix_teachers,
        ) is None:
            return None
        chosen: List[Dict[str, Any]] = []
        for r in sorted_active_rooms:
            chosen.append(r)
            if _pack_pair_into_rooms(
                target_papers, chosen, student_by_roll,
                extra_empty=extra_empty, allow_mix_teachers=allow_mix_teachers,
            ) is not None:
                return chosen
        return list(sorted_active_rooms)

    best = None
    for n in range(1, len(sorted_active_rooms) + 1):
        for combo in itertools.combinations(sorted_active_rooms, n):
            combo_list = list(combo)
            if _pack_pair_into_rooms(
                target_papers, combo_list, student_by_roll,
                extra_empty=extra_empty, allow_mix_teachers=allow_mix_teachers,
            ) is None:
                continue
            total_usable = sum(sum(paper_column_capacity(r, target_papers).values()) for r in combo_list)
            waste = total_usable - total
            has_big = 1 if any(r.get("capacity", 0) >= 50 for r in combo_list) else 0
            if has_repeater_paper:
                key = (-has_big, waste, n)
            else:
                key = (waste, n)
            if best is None or key < best[0]:
                best = (key, combo_list)
        if best is not None:
            break
    return best[1] if best else None


def best_fit_rooms(
    papers: List[Dict[str, Any]],
    total: int,
    rooms: Optional[List[Dict[str, Any]]] = None,
    student_by_roll: Optional[Dict[str, Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Smallest-waste room combination that fits students, clean teacher columns, and 5 empty buffer chairs."""
    active_rooms = rooms if rooms is not None else store.get_rooms()
    active_sbr = student_by_roll if student_by_roll is not None else store.student_by_roll
    target_papers = _ensure_paper_groups(papers[:2] if len(papers) >= 2 else papers, active_sbr)

    # 1. Preferred: clean teacher columns + >=5 empty chairs at end of each (course, teacher)
    chosen = _search_best_combo(
        target_papers, total, active_rooms, active_sbr,
        extra_empty=EXTRA_EMPTY_CHAIRS, allow_mix_teachers=False,
    )
    if chosen is not None:
        return chosen

    # 2. Fallback: clean teacher columns without full 5-chair buffer
    chosen = _search_best_combo(
        target_papers, total, active_rooms, active_sbr,
        extra_empty=0, allow_mix_teachers=False,
    )
    if chosen is not None:
        return chosen

    # 3. Last-resort fallback: fit all students sequentially across alternating columns
    chosen = _search_best_combo(
        target_papers, total, active_rooms, active_sbr,
        extra_empty=0, allow_mix_teachers=True,
    )
    return chosen if chosen is not None else list(active_rooms)


def check_adjacent_columns(grid: List[List[Any]], rows: int, cols: int) -> bool:
    """True if no two side-by-side occupied seats share both course code and instructor.
    Cheating rule: (course != course) OR (instructor != instructor).
    Adjacent seats must differ in course or instructor (or be separated by a vacant seat).
    """
    for r in range(rows):
        for c in range(cols - 1):
            a, b = grid[r][c], grid[r][c + 1]
            if a and b:
                c_a = re.sub(r"-(CS|IT|T\d+)$", "", a.get("course_code", ""))
                c_b = re.sub(r"-(CS|IT|T\d+)$", "", b.get("course_code", ""))
                inst_a = (a.get("instructor") or "").strip().lower()
                inst_b = (b.get("instructor") or "").strip().lower()
                if c_a == c_b and inst_a == inst_b:
                    return False
    return True


def _partition_course_pairs(
    slot_courses: List[Dict[str, Any]],
    student_by_roll: Dict[str, Dict[str, Any]],
) -> List[List[Dict[str, Any]]]:
    """Builds enriched paper objects and partitions them into <=2-paper pairs by demand.
    Prioritizes repeater-heavy courses (>= 5 repeaters) to be paired and placed into big rooms."""
    papers = []
    for course in slot_courses:
        groups = _course_teacher_groups(course, student_by_roll)
        rolls = [r for g in groups for r in g["rolls"]]
        demand = len(rolls)
        back_count = sum(1 for r in rolls if enrolment_type(r, course["code"]) == "back")
        papers.append({
            "code": course["code"],
            "title": course["title"],
            "instructor": course.get("instructor", ""),
            "rolls": rolls,
            "groups": groups,
            "demand": demand,
            "back_count": back_count,
        })
    # Courses with >= 5 repeaters are sorted first so they get first pick of large rooms
    sorted_papers = sorted(
        papers,
        key=lambda p: (
            1 if p.get("back_count", 0) >= 5 else 0,
            p["demand"],
            len(p["rolls"]),
        ),
        reverse=True,
    )
    return [sorted_papers[i:i + 2] for i in range(0, len(sorted_papers), 2)]


def courses_fit_in_rooms(
    slot_courses: List[Dict[str, Any]],
    rooms: Optional[List[Dict[str, Any]]] = None,
    student_by_roll: Optional[Dict[str, Dict[str, Any]]] = None,
    require_empty_buffer: bool = True,
) -> bool:
    """Returns True if all slot_courses can be seated into rooms under all rules."""
    active_sbr = student_by_roll if student_by_roll is not None else store.student_by_roll
    active_rooms = list(rooms if rooms is not None else store.get_rooms())
    active_rooms = [r for r in active_rooms if r.get("capacity", 0) > 0]
    if not active_rooms:
        return False

    is_all_labs = bool(active_rooms and all(r.get("room_type") == "lab" for r in active_rooms))
    if is_all_labs:
        # Computer Labs: each teacher group needs a dedicated lab. No alternating columns.
        groups = []
        for course in slot_courses:
            for g in _course_teacher_groups(course, active_sbr):
                if g["rolls"]:
                    groups.append(g)
        if not groups:
            return True
        if len(groups) > len(active_rooms):
            return False
        group_sizes = sorted([len(g["rolls"]) for g in groups], reverse=True)
        lab_caps = sorted([r["rows"] * r["columns"] for r in active_rooms], reverse=True)
        for size, cap in zip(group_sizes, lab_caps):
            if size > cap:
                return False
        return True

    has_labs = any(r.get("room_type") == "lab" for r in active_rooms)
    has_halls = any(r.get("room_type", "hall") != "lab" for r in active_rooms)
    if has_labs and has_halls:
        written_courses = [c for c in slot_courses if not c.get("is_lab")]
        lab_courses = [c for c in slot_courses if c.get("is_lab")]
        halls = [r for r in active_rooms if r.get("room_type", "hall") != "lab"]
        labs = [r for r in active_rooms if r.get("room_type") == "lab"]
        return courses_fit_in_rooms(written_courses, halls, active_sbr, require_empty_buffer) and \
               courses_fit_in_rooms(lab_courses, labs, active_sbr, require_empty_buffer)

    pairs = _partition_course_pairs([c for c in slot_courses if c.get("student_roll_numbers")], active_sbr)
    if not pairs:
        return True

    extra_empty = EXTRA_EMPTY_CHAIRS if require_empty_buffer else 0
    remaining = list(active_rooms)
    for pair in pairs:
        pair_total = sum(len(p["rolls"]) for p in pair)
        chosen = _search_best_combo(
            pair, pair_total, remaining, active_sbr,
            extra_empty=extra_empty, allow_mix_teachers=False,
        )
        if chosen is None:
            return False
        for r in chosen:
            if r in remaining:
                remaining.remove(r)
    return True


def build_seating_sheet(
    room_out: Dict[str, Any],
    instructor_map: Optional[Dict[str, str]] = None,
    student_by_roll: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Official DCS arrangement sheet layout for a room."""
    inst_map = instructor_map or {}
    active_sbr = student_by_roll if student_by_roll is not None else store.student_by_roll
    cols_out = []
    rotation = room_out.get("column_papers") or []
    col_teachers_meta = room_out.get("column_teachers") or []

    for c in range(room_out["columns"]):
        paper = rotation[c] if c < len(rotation) else None
        raw_rolls = []
        for r in range(room_out["rows"]):
            cell = room_out["grid"][r][c]
            if cell:
                if cell.get("is_buffer") or str(cell.get("roll_no")).strip().lower() == "buffer":
                    raw_rolls.append("Buffer")
                else:
                    paper = cell["course_code"]
                    raw_rolls.append(cell["roll_no"])
            elif room_out.get("has_buffer_row") and r == room_out["rows"] - 1:
                raw_rolls.append("Buffer")
            else:
                raw_rolls.append("")

        has_rolls = any(r and str(r).strip() for r in raw_rolls)
        is_vacant = not paper or paper == "—" or "Vacant" in paper or not has_rolls
        # Keep full room row height for active/buffer columns so empty chairs appear cleanly
        roll_nos = [] if is_vacant else raw_rolls

        # Look up instructor specifically from students actually seated in this column
        col_teachers = []
        if active_sbr and paper and not is_vacant:
            for roll in roll_nos:
                if roll:
                    st = active_sbr.get(roll)
                    if st:
                        t = _resolve_student_teacher(st, {"code": paper, "instructor": inst_map.get(paper, "")})
                        if t and t not in col_teachers:
                            col_teachers.append(t)

        if col_teachers:
            short_inst = " / ".join(col_teachers)
        elif not is_vacant and c < len(col_teachers_meta) and col_teachers_meta[c] is not None:
            short_inst = col_teachers_meta[c]
        elif paper and not is_vacant:
            course_all_insts = store.get_instructors_for_course(paper)
            if course_all_insts:
                short_inst = " / ".join(list(dict.fromkeys(_normalize_teacher(i) for i in course_all_insts if _normalize_teacher(i))))
            else:
                short_inst = _normalize_teacher(inst_map.get(paper, ""))
        else:
            short_inst = ""

        if is_vacant:
            paper_header = "— (Vacant)"
        else:
            display_paper = re.sub(r"-T\d+$", "", re.sub(r"-CS$", " (BSCS)", re.sub(r"-IT$", " (BSIT)", paper)))
            code_spaced = re.sub(r"^([A-Za-z]+)(\d+)", r"\1 \2", display_paper)
            paper_header = f"{code_spaced} - {short_inst}" if short_inst else code_spaced

        clean_code = re.sub(r"-(CS|IT|T\d+)$", "", paper) if paper and not is_vacant else ""
        cols_out.append({
            "column_no": c + 1,
            "paper": paper if not is_vacant else "— (Vacant)",
            "course_code": clean_code,
            "instructor": short_inst,
            "paper_header": paper_header,
            "roll_nos": roll_nos,
        })
    return {"columns": cols_out}


def _verify_empty_chairs_rule(
    rooms_out: List[Dict[str, Any]],
    expected_groups: Dict[Tuple[str, str], int],
    min_empty: int = EXTRA_EMPTY_CHAIRS,
) -> bool:
    """Verifies each (course_code, teacher) group ends with >= min_empty empty chairs."""
    if not expected_groups:
        return True

    # Collect per-(course_code, teacher) sequence of column heights and occupied counts in seat order
    seq: Dict[Tuple[str, str], List[Tuple[int, int]]] = {}
    for room in rooms_out:
        rows = room["rows"]
        col_papers = room.get("column_papers") or []
        col_teachers = room.get("column_teachers") or []
        for c in range(room["columns"]):
            code = col_papers[c] if c < len(col_papers) else None
            if not code:
                continue
            teacher = col_teachers[c] if c < len(col_teachers) and col_teachers[c] is not None else ""
            occupied = sum(1 for r in range(rows) if room["grid"][r][c] is not None)
            seq.setdefault((code, teacher), []).append((rows, occupied))

    for key, student_count in expected_groups.items():
        if student_count <= 0:
            continue
        cols_list = seq.get(key)
        if not cols_list:
            return False
        trailing_empty = 0
        for h, occ in reversed(cols_list):
            if occ == 0:
                trailing_empty += h
            else:
                trailing_empty += (h - occ)
                break
        if trailing_empty < min_empty:
            return False
    return True


def _build_lab_seating_plan(
    slot_courses: List[Dict[str, Any]],
    lab_rooms: List[Dict[str, Any]],
    active_sbr: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """Generates seating plan for computer labs:
    - Exactly ONE teacher and their students per lab (har lab ma aik teacher apnay students ka paper la ga).
    - NO alternating column logic (alternate column for courses wala logic labs ma nhi ha).
    - Students are seated contiguously column by column (front to back, col 1, col 2, ...).
    - Unused trailing columns in the lab are marked — (Vacant).
    """
    groups: List[Dict[str, Any]] = []
    for course in slot_courses:
        c_groups = _course_teacher_groups(course, active_sbr)
        for g in c_groups:
            if g["rolls"]:
                groups.append({
                    "course_code": course["code"],
                    "course_title": course.get("title", ""),
                    "instructor": g["teacher"],
                    "rolls": list(g["rolls"]),
                })

    if not groups or not lab_rooms:
        return {
            "rooms": [],
            "total_students": 0,
            "total_capacity": 0,
            "physical_capacity": 0,
            "utilisation_pct": 0.0,
            "adjacent_rule_pass": True,
            "extra_empty_chairs": 0,
            "empty_chairs_rule_pass": True,
        }

    # Sort groups descending by student count
    groups.sort(key=lambda g: len(g["rolls"]), reverse=True)
    available_rooms = sorted(lab_rooms, key=lambda r: r.get("name", r.get("id", "")))

    rooms_out = []
    room_idx = 0

    for group in groups:
        rolls = group["rolls"]
        roll_idx = 0
        total_rolls = len(rolls)

        while roll_idx < total_rolls and room_idx < len(available_rooms):
            room = available_rooms[room_idx]
            room_idx += 1

            rows, cols = room["rows"], room["columns"]
            grid = [[None] * cols for _ in range(rows)]
            col_paper: List[Optional[str]] = [None] * cols
            col_teacher: List[Optional[str]] = [None] * cols
            seated_in_room = 0

            for c in range(cols):
                if roll_idx < total_rolls:
                    col_paper[c] = group["course_code"]
                    col_teacher[c] = group["instructor"]
                    for r in range(rows):
                        if roll_idx < total_rolls:
                            roll = rolls[roll_idx]
                            st = active_sbr.get(roll, {"name": roll})
                            grid[r][c] = {
                                "roll_no": roll,
                                "name": st.get("name", roll),
                                "course_code": group["course_code"],
                                "seat": f"Row {r + 1}, Col {c + 1}",
                            }
                            roll_idx += 1
                            seated_in_room += 1
                else:
                    col_paper[c] = None
                    col_teacher[c] = None

            if seated_in_room <= 0:
                continue

            r_usable = rows * cols  # In a lab, all seats are valid computers
            reserve_cap = 0
            util = (seated_in_room / r_usable * 100) if r_usable else 0
            room_out = {
                "room_id": room["id"],
                "room_name": room["name"],
                "rows": rows,
                "columns": cols,
                "capacity": room["capacity"],
                "reserve_capacity": reserve_cap,
                "usable_capacity": r_usable,
                "total_usable_seats": r_usable + reserve_cap,
                "seated": seated_in_room,
                "utilisation_pct": round(util, 1),
                "utilisation_flag": "LOW" if util < 70 else ("OK" if util >= 85 else "FAIR"),
                "grid": grid,
                "column_papers": col_paper,
                "column_teachers": col_teacher,
                "adjacent_rule_pass": True,  # Labs do not alternate courses
                "single_paper": True,
            }
            inst_dict = {group["course_code"]: group["instructor"]}
            room_out["seating_sheet"] = build_seating_sheet(room_out, inst_dict, student_by_roll=active_sbr)
            rooms_out.append(room_out)

    overall_seated = sum(r["seated"] for r in rooms_out)
    total_usable_cap = sum(r["usable_capacity"] for r in rooms_out)
    overall_util = (overall_seated / total_usable_cap * 100) if total_usable_cap else 0

    return {
        "rooms": rooms_out,
        "total_students": overall_seated,
        "total_capacity": total_usable_cap,
        "physical_capacity": sum(r["capacity"] for r in rooms_out),
        "utilisation_pct": round(overall_util, 1),
        "adjacent_rule_pass": True,
        "extra_empty_chairs": 0,
        "empty_chairs_rule_pass": True,
    }


def _build_hall_seating_plan(
    slot_courses: List[Dict[str, Any]],
    rooms: List[Dict[str, Any]],
    active_sbr: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """Generates hall seating plan with strict 2-paper alternation across columns."""
    # Room 26 / Room 18 (the largest halls) are always offered first so the
    # biggest cohorts — and therefore their course teachers — are seated in
    # the rooms with the most seats, per the own-paper seating ruling.
    all_rooms = sorted(
        list(rooms),
        key=lambda r: (-r.get("capacity", 0), str(r.get("name", ""))),
    )
    course_instructor_map = {c["code"]: c.get("instructor", "") for c in slot_courses}

    non_empty_courses = [c for c in slot_courses if c.get("student_roll_numbers")]
    total = sum(len(c.get("student_roll_numbers", [])) for c in non_empty_courses)
    if total == 0 or not all_rooms:
        return {
            "rooms": [],
            "total_students": 0,
            "total_capacity": 0,
            "physical_capacity": 0,
            "utilisation_pct": 0.0,
            "adjacent_rule_pass": True,
            "extra_empty_chairs": EXTRA_EMPTY_CHAIRS,
            "empty_chairs_rule_pass": True,
        }

    # If all non-empty papers fit within available halls together:
    if total <= sum(r["capacity"] for r in all_rooms):
        chosen = []
        c_cap = 0
        for r in all_rooms:
            chosen.append(r)
            c_cap += r["capacity"]
            if c_cap >= total:
                break

        slot_groups = []
        for p in non_empty_courses:
            for g in p.get("groups", []):
                if g.get("rolls"):
                    slot_groups.append({
                        "code": p["code"],
                        "instructor": g.get("teacher", p.get("instructor", "")),
                        "rolls": list(g["rolls"]),
                    })
            if not p.get("groups") and p.get("rolls"):
                slot_groups.append({
                    "code": p["code"],
                    "instructor": p.get("instructor", ""),
                    "rolls": list(p["rolls"]),
                })
            elif not p.get("groups") and p.get("student_roll_numbers"):
                slot_groups.append({
                    "code": p["code"],
                    "instructor": p.get("instructor", ""),
                    "rolls": list(p["student_roll_numbers"]),
                })

        slot_has_repeaters = any(
            bool(c.get("back_roll_numbers"))
            or any(enrolment_type(r, c["code"]) == "back" for r in c.get("student_roll_numbers", []))
            for c in slot_courses
        )

        def _room_student_rows(rm: Dict[str, Any]) -> int:
            is_lg = (rm.get("capacity", 0) >= 50 and rm.get("room_type") != "lab")
            if is_lg and slot_has_repeaters:
                return max(1, rm["rows"] - 1)
            return rm["rows"]

        if len(slot_groups) > 1:
            even_cap = sum(_room_student_rows(r) * ((r["columns"] + 1) // 2) for r in chosen)
            odd_cap = sum(_room_student_rows(r) * (r["columns"] // 2) for r in chosen)
            s0, s1 = _partition_stream_strictly(slot_groups, even_cap, odd_cap)
            s0_queue = _paper_ordered_queue(s0)
            s1_queue = _paper_ordered_queue(s1)

            while (len(s0_queue) > even_cap or len(s1_queue) > odd_cap) and len(chosen) < len(all_rooms):
                for r in all_rooms:
                    if r not in chosen:
                        chosen.append(r)
                        even_cap += _room_student_rows(r) * ((r["columns"] + 1) // 2)
                        odd_cap += _room_student_rows(r) * (r["columns"] // 2)
                        break
                s0, s1 = _partition_stream_strictly(slot_groups, even_cap, odd_cap)
                s0_queue = _paper_ordered_queue(s0)
                s1_queue = _paper_ordered_queue(s1)

            s0_idx = 0
            s1_idx = 0
            rooms_out = []
            for room in chosen:
                rows, cols = room["rows"], room["columns"]
                is_lg = (room.get("capacity", 0) >= 50 and room.get("room_type") != "lab")
                use_buffer_row = is_lg and slot_has_repeaters
                student_rows = (rows - 1) if use_buffer_row else rows

                grid = [[None] * cols for _ in range(rows)]
                col_paper = [None] * cols
                col_teacher = [None] * cols
                seated = 0
                for c in range(cols):
                    if c % 2 == 0:
                        if s0_idx < len(s0_queue):
                            cd, tc, _ = s0_queue[s0_idx]
                            col_paper[c] = cd
                            col_teacher[c] = tc
                            for r in range(student_rows):
                                if s0_idx < len(s0_queue):
                                    c_code, teacher, roll = s0_queue[s0_idx]
                                    grid[r][c] = {
                                        "roll_no": roll,
                                        "name": active_sbr.get(roll, {}).get("name", roll),
                                        "course_code": c_code,
                                        "instructor": teacher,
                                        "seat": f"Row {r + 1}, Col {c + 1}",
                                    }
                                    s0_idx += 1
                                    seated += 1
                    else:
                        if s1_idx < len(s1_queue):
                            cd, tc, _ = s1_queue[s1_idx]
                            col_paper[c] = cd
                            col_teacher[c] = tc
                            for r in range(student_rows):
                                if s1_idx < len(s1_queue):
                                    c_code, teacher, roll = s1_queue[s1_idx]
                                    grid[r][c] = {
                                        "roll_no": roll,
                                        "name": active_sbr.get(roll, {}).get("name", roll),
                                        "course_code": c_code,
                                        "instructor": teacher,
                                        "seat": f"Row {r + 1}, Col {c + 1}",
                                    }
                                    s1_idx += 1
                                    seated += 1
                if seated <= 0:
                    continue

                if use_buffer_row:
                    for c in range(cols):
                        grid[rows - 1][c] = {
                            "roll_no": "Buffer",
                            "name": "Buffer Seat",
                            "course_code": col_paper[c] or "",
                            "instructor": col_teacher[c] or "",
                            "seat": f"Row {rows}, Col {c + 1} (Buffer)",
                            "is_buffer": True,
                        }

                reserve_cap = cols if use_buffer_row else 0
                util = (seated / (student_rows * cols) * 100) if (student_rows and cols) else 0
                room_out = {
                    "room_id": room["id"],
                    "room_name": room["name"],
                    "rows": rows,
                    "columns": cols,
                    "capacity": room["capacity"],
                    "reserve_capacity": reserve_cap,
                    "usable_capacity": student_rows * cols,
                    "total_usable_seats": room["capacity"],
                    "seated": seated,
                    "utilisation_pct": round(util, 1),
                    "utilisation_flag": "LOW" if util < 70 else ("OK" if util >= 85 else "FAIR"),
                    "grid": grid,
                    "column_papers": col_paper,
                    "column_teachers": col_teacher,
                    "adjacent_rule_pass": check_adjacent_columns(grid, rows, cols),
                    "single_paper": False,
                    "has_buffer_row": use_buffer_row,
                    "buffer_row_index": (rows - 1) if use_buffer_row else None,
                }
                room_out["seating_sheet"] = build_seating_sheet(room_out, course_instructor_map, student_by_roll=active_sbr)
                rooms_out.append(room_out)

            overall_seated = sum(r["seated"] for r in rooms_out)
            total_usable_cap = sum(r["usable_capacity"] for r in rooms_out)
            overall_util = (overall_seated / total_usable_cap * 100) if total_usable_cap else 0
            all_pass = all(r["adjacent_rule_pass"] for r in rooms_out)
            return {
                "rooms": rooms_out,
                "total_students": overall_seated,
                "total_capacity": total_usable_cap,
                "physical_capacity": sum(r["capacity"] for r in rooms_out),
                "utilisation_pct": round(overall_util, 1),
                "adjacent_rule_pass": all_pass,
                "extra_empty_chairs": 0,
                "empty_chairs_rule_pass": True,
            }

    pairs = _partition_course_pairs(non_empty_courses, active_sbr)
    expected_groups: Dict[Tuple[str, str], int] = {}
    for pair in pairs:
        for p in pair:
            for g in p["groups"]:
                expected_groups[(p["code"], g["teacher"])] = len(g["rolls"])

    remaining_rooms = list(all_rooms)
    rooms_out = []

    for pair in pairs:
        pair_total = sum(len(p["rolls"]) for p in pair)
        chosen = best_fit_rooms(pair, pair_total, rooms=remaining_rooms, student_by_roll=active_sbr)
        for r in chosen:
            if r in remaining_rooms:
                remaining_rooms.remove(r)

        packed = (
            _pack_pair_into_rooms(pair, chosen, active_sbr, extra_empty=EXTRA_EMPTY_CHAIRS, allow_mix_teachers=False)
            or _pack_pair_into_rooms(pair, chosen, active_sbr, extra_empty=0, allow_mix_teachers=False)
            or _pack_pair_into_rooms(pair, chosen, active_sbr, extra_empty=0, allow_mix_teachers=True)
            or {}
        )

        if not packed:
            # High-capacity stream allocation for alternating columns
            rooms_to_use = chosen if sum(r["capacity"] for r in chosen) >= pair_total else list(chosen) + [r for r in remaining_rooms if r not in chosen]
            pair_groups = []
            for p in pair:
                for g in p.get("groups", []):
                    if g.get("rolls"):
                        pair_groups.append({
                            "code": p["code"],
                            "instructor": g.get("teacher", ""),
                            "rolls": list(g["rolls"]),
                        })
                if not p.get("groups") and p.get("rolls"):
                    pair_groups.append({
                        "code": p["code"],
                        "instructor": p.get("instructor", ""),
                        "rolls": list(p["rolls"]),
                    })
            pair_has_repeaters = any(
                bool(p.get("back_roll_numbers"))
                or any(enrolment_type(r, p["code"]) == "back" for r in p.get("student_roll_numbers", []))
                for p in pair
            )

            def _room_pair_usable_rows(rm: Dict[str, Any]) -> int:
                is_lg = (rm.get("capacity", 0) >= 50 and rm.get("room_type") != "lab")
                if is_lg and pair_has_repeaters:
                    return max(1, rm["rows"] - 1)
                return rm["rows"]

            even_cap = sum(_room_pair_usable_rows(r) * ((r["columns"] + 1) // 2) for r in rooms_to_use)
            odd_cap = sum(_room_pair_usable_rows(r) * (r["columns"] // 2) for r in rooms_to_use)
            s0, s1 = _partition_stream_strictly(pair_groups, even_cap, odd_cap)
            s0_queue = _paper_ordered_queue(s0)
            s1_queue = _paper_ordered_queue(s1)
            s0_idx = 0
            s1_idx = 0
            for room in rooms_to_use:
                rows, cols = room["rows"], room["columns"]
                is_lg = (room.get("capacity", 0) >= 50 and room.get("room_type") != "lab")
                use_buffer_row = is_lg and pair_has_repeaters
                student_rows = (rows - 1) if use_buffer_row else rows

                grid = [[None] * cols for _ in range(rows)]
                col_paper = [None] * cols
                col_teacher = [None] * cols
                seated = 0
                for c in range(cols):
                    if c % 2 == 0:
                        if s0_idx < len(s0_queue):
                            cd, tc, _ = s0_queue[s0_idx]
                            col_paper[c] = cd
                            col_teacher[c] = tc
                            for r in range(student_rows):
                                if s0_idx < len(s0_queue):
                                    c_code, teacher, roll = s0_queue[s0_idx]
                                    grid[r][c] = {
                                        "roll_no": roll,
                                        "name": active_sbr.get(roll, {}).get("name", roll),
                                        "course_code": c_code,
                                        "instructor": teacher,
                                        "seat": f"Row {r + 1}, Col {c + 1}",
                                    }
                                    s0_idx += 1
                                    seated += 1
                    else:
                        if s1_idx < len(s1_queue):
                            cd, tc, _ = s1_queue[s1_idx]
                            col_paper[c] = cd
                            col_teacher[c] = tc
                            for r in range(student_rows):
                                if s1_idx < len(s1_queue):
                                    c_code, teacher, roll = s1_queue[s1_idx]
                                    grid[r][c] = {
                                        "roll_no": roll,
                                        "name": active_sbr.get(roll, {}).get("name", roll),
                                        "course_code": c_code,
                                        "instructor": teacher,
                                        "seat": f"Row {r + 1}, Col {c + 1}",
                                    }
                                    s1_idx += 1
                                    seated += 1
                if seated <= 0:
                    continue

                if use_buffer_row:
                    for c in range(cols):
                        grid[rows - 1][c] = {
                            "roll_no": "Buffer",
                            "name": "Buffer Seat",
                            "course_code": col_paper[c] or "",
                            "instructor": col_teacher[c] or "",
                            "seat": f"Row {rows}, Col {c + 1} (Buffer)",
                            "is_buffer": True,
                        }

                reserve_cap = cols if use_buffer_row else 0
                util = (seated / (student_rows * cols) * 100) if (student_rows and cols) else 0
                room_out = {
                    "room_id": room["id"],
                    "room_name": room["name"],
                    "rows": rows,
                    "columns": cols,
                    "capacity": room["capacity"],
                    "reserve_capacity": reserve_cap,
                    "usable_capacity": student_rows * cols,
                    "total_usable_seats": room["capacity"],
                    "seated": seated,
                    "utilisation_pct": round(util, 1),
                    "utilisation_flag": "LOW" if util < 70 else ("OK" if util >= 85 else "FAIR"),
                    "grid": grid,
                    "column_papers": col_paper,
                    "column_teachers": col_teacher,
                    "adjacent_rule_pass": check_adjacent_columns(grid, rows, cols),
                    "single_paper": False,
                    "has_buffer_row": use_buffer_row,
                    "buffer_row_index": (rows - 1) if use_buffer_row else None,
                }
                room_out["seating_sheet"] = build_seating_sheet(room_out, course_instructor_map, student_by_roll=active_sbr)
                rooms_out.append(room_out)
            continue

        # Build per-room allocation lookup: (r_idx, c_idx) -> (code, teacher, rolls)
        cell_alloc: Dict[Tuple[int, int], Tuple[str, str, List[str]]] = {}
        for code, allocs in packed.items():
            for alloc in allocs:
                cell_alloc[(alloc["room_idx"], alloc["col_idx"])] = (
                    code,
                    alloc["teacher"],
                    alloc["rolls"],
                )

        for r_idx, room in enumerate(chosen):
            rows, cols = room["rows"], room["columns"]
            grid = [[None] * cols for _ in range(rows)]
            col_paper: List[Optional[str]] = [None] * cols
            col_teacher: List[Optional[str]] = [None] * cols
            r_usable = sum(paper_column_capacity(room, pair).values())
            seated = 0

            for c in range(cols):
                alloc_entry = cell_alloc.get((r_idx, c))
                if not alloc_entry:
                    continue
                code, teacher, rolls_slice = alloc_entry
                col_paper[c] = code
                col_teacher[c] = teacher
                for r, roll in enumerate(rolls_slice):
                    student = active_sbr.get(roll, {"name": roll})
                    grid[r][c] = {
                        "roll_no": roll,
                        "name": student.get("name", roll),
                        "course_code": code,
                        "instructor": teacher,
                        "seat": f"Row {r + 1}, Col {c + 1}",
                    }
                    seated += 1

            if seated <= 0:
                continue
            util = (seated / r_usable * 100) if r_usable else 0
            reserve_cap = _compute_active_reserve_capacity(room, grid, col_paper, active_sbr)
            use_buffer_row = reserve_cap > 0
            if use_buffer_row:
                for c in range(cols):
                    grid[rows - 1][c] = {
                        "roll_no": "Buffer",
                        "name": "Buffer Seat",
                        "course_code": col_paper[c] or "",
                        "instructor": col_teacher[c] or "",
                        "seat": f"Row {rows}, Col {c + 1} (Buffer)",
                        "is_buffer": True,
                    }
            room_out = {
                "room_id": room["id"],
                "room_name": room["name"],
                "rows": rows,
                "columns": cols,
                "capacity": room["capacity"],
                "reserve_capacity": reserve_cap,
                "usable_capacity": r_usable,
                "total_usable_seats": room["capacity"],
                "seated": seated,
                "utilisation_pct": round(util, 1),
                "utilisation_flag": "LOW" if util < 70 else ("OK" if util >= 85 else "FAIR"),
                "grid": grid,
                "column_papers": col_paper,
                "column_teachers": col_teacher,
                "adjacent_rule_pass": check_adjacent_columns(grid, rows, cols),
                "single_paper": len(pair) < 2,
                "has_buffer_row": use_buffer_row,
                "buffer_row_index": (rows - 1) if use_buffer_row else None,
            }
            room_out["seating_sheet"] = build_seating_sheet(room_out, course_instructor_map, student_by_roll=active_sbr)
            rooms_out.append(room_out)

    overall_seated = sum(r["seated"] for r in rooms_out)
    total_usable_cap = sum(r["usable_capacity"] for r in rooms_out)
    overall_util = (overall_seated / total_usable_cap * 100) if total_usable_cap else 0
    all_pass = all(r["adjacent_rule_pass"] for r in rooms_out)
    empty_pass = _verify_empty_chairs_rule(rooms_out, expected_groups, EXTRA_EMPTY_CHAIRS)

    return {
        "rooms": rooms_out,
        "total_students": overall_seated,
        "total_capacity": total_usable_cap,
        "physical_capacity": sum(r["capacity"] for r in rooms_out),
        "utilisation_pct": round(overall_util, 1),
        "adjacent_rule_pass": all_pass,
        "extra_empty_chairs": EXTRA_EMPTY_CHAIRS,
        "empty_chairs_rule_pass": empty_pass,
    }


def build_seating_plan(
    slot_courses: List[Dict[str, Any]],
    rooms: Optional[List[Dict[str, Any]]] = None,
    student_by_roll: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Generates an intelligent seating plan: halls alternate 2 papers, labs seat 1 teacher contiguously."""
    active_sbr = student_by_roll if student_by_roll is not None else store.student_by_roll
    all_rooms = list(rooms if rooms is not None else store.get_rooms())
    active_rooms = [r for r in all_rooms if r.get("capacity", 0) > 0]

    is_all_labs = bool(active_rooms and all(r.get("room_type") == "lab" for r in active_rooms))
    if is_all_labs:
        return _build_lab_seating_plan(slot_courses, active_rooms, active_sbr)

    has_labs = any(r.get("room_type") == "lab" for r in active_rooms)
    has_halls = any(r.get("room_type", "hall") != "lab" for r in active_rooms)
    if has_labs and has_halls:
        written_courses = [c for c in slot_courses if not c.get("is_lab")]
        lab_courses = [c for c in slot_courses if c.get("is_lab")]
        halls = [r for r in active_rooms if r.get("room_type", "hall") != "lab"]
        labs = [r for r in active_rooms if r.get("room_type") == "lab"]

        sp_written = _build_hall_seating_plan(written_courses, halls, active_sbr) if written_courses else {"rooms": []}
        sp_labs = _build_lab_seating_plan(lab_courses, labs, active_sbr) if lab_courses else {"rooms": []}

        merged_rooms = sp_written.get("rooms", []) + sp_labs.get("rooms", [])
        overall_seated = sum(r["seated"] for r in merged_rooms)
        total_usable_cap = sum(r["usable_capacity"] for r in merged_rooms)
        overall_util = (overall_seated / total_usable_cap * 100) if total_usable_cap else 0
        all_pass = all(r["adjacent_rule_pass"] for r in merged_rooms)
        empty_pass = sp_written.get("empty_chairs_rule_pass", True) and sp_labs.get("empty_chairs_rule_pass", True)
        return {
            "rooms": merged_rooms,
            "total_students": overall_seated,
            "total_capacity": total_usable_cap,
            "physical_capacity": sum(r["capacity"] for r in merged_rooms),
            "utilisation_pct": round(overall_util, 1),
            "adjacent_rule_pass": all_pass,
            "extra_empty_chairs": EXTRA_EMPTY_CHAIRS,
            "empty_chairs_rule_pass": empty_pass,
        }

    return _build_hall_seating_plan(slot_courses, active_rooms, active_sbr)
