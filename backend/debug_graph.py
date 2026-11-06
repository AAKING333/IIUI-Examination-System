"""debug_graph.py — analyse the conflict graph to see what's needed"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "site-packages"))

from data_generator import generate_rooms, generate_students, generate_courses_and_enrollments, generate_time_slots
from collections import defaultdict

rooms    = generate_rooms()
students = generate_students()
courses, enrollments = generate_courses_and_enrollments(students)
slots    = generate_time_slots()

print(f"Courses: {len(courses)}, Slots: {len(slots)}")

# build conflict graph
course_students = defaultdict(set)
for e in enrollments:
    course_students[e["course_id"]].add(e["student_id"])

cids = [c["course_id"] for c in courses]
graph = {cid: set() for cid in cids}
for i in range(len(cids)):
    for j in range(i+1, len(cids)):
        ci, cj = cids[i], cids[j]
        if course_students[ci] & course_students[cj]:
            graph[ci].add(cj)
            graph[cj].add(ci)

cname = {c["course_id"]: c["code"] for c in courses}

print("\nConflict graph (each row = course, # = how many others it conflicts with):")
for cid in cids:
    print(f"  {cname[cid]:8} conflicts with {len(graph[cid]):2d} others: {[cname[x] for x in graph[cid]]}")

# chromatic number needed
# In a path/dense graph the chromatic number >= clique_number
# Simple clique estimation
max_clique = 0
for cid in cids:
    neighbors = graph[cid] | {cid}
    # find clique in neighbors
    clique = {cid}
    for nb in graph[cid]:
        if all(x in graph[nb] for x in clique):
            clique.add(nb)
    max_clique = max(max_clique, len(clique))

print(f"\nEstimated clique size (minimum slots needed): {max_clique}")
print(f"Available slots: {len(slots)}")
print(f"Slots per day: 2, Days: {len(slots)//2}")

# Check one-per-day: how many courses share students across a potential day
print("\n--- Key insight: how many courses share students with CS301? ---")
cs301 = next((c["course_id"] for c in courses if c["code"] == "CS301"), None)
if cs301:
    conflicts = graph.get(cs301, set())
    print(f"  CS301 conflicts with {len(conflicts)} courses")
    print(f"  CS301 enrolled: {len(course_students[cs301])} students")

