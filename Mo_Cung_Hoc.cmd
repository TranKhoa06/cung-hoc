@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\vite\bin\vite.js" (
  echo Chua co thu vien. Mo terminal tai thu muc nay va chay npm install.
  pause
  exit /b 1
)
echo Mo trinh duyet tai http://127.0.0.1:5178/
echo Giu cua so nay mo khi dung web. Nhan Ctrl+C de dung.
node "node_modules\vite\bin\vite.js" --host 127.0.0.1 --port 5178 --strictPort
pause
