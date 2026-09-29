"""Windows 本地开发：启动前端（localhost:3000，代理到本地后端）"""
import os
import shutil
import subprocess
import sys

os.environ.setdefault("BACKEND_URL", "http://localhost:8000")
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend"))

npx = shutil.which("npx")
if not npx:
    print("未找到 npx，请先安装 Node.js")
    sys.exit(1)

cmd = [npx, "next", "dev", "-p", "3000"]
sys.exit(subprocess.call(cmd))
