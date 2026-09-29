"""Windows 本地开发：启动后端（127.0.0.1:8000，热重载）"""
import os
import subprocess
import sys

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"))
cmd = [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"]
sys.exit(subprocess.call(cmd))
