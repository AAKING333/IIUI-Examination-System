"""
run_server.py
-------------
Entry-point launcher for the FastAPI backend.
Adds the local site-packages to sys.path and boots Uvicorn.
"""
import sys
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
_SITE = os.path.join(_HERE, "site-packages")
if _SITE not in sys.path:
    sys.path.insert(0, _SITE)

import uvicorn

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)

