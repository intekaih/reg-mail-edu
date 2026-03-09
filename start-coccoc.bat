@echo off
echo Dang khoi dong Coc Coc voi che do Debug...
echo Port: 9222
echo.

:: Dong tat ca Coc Coc dang chay truoc
taskkill /f /im browser.exe 2>nul

:: Doi 2 giay
timeout /t 2 /nobreak >nul

:: Mo Coc Coc voi remote debugging
start "" "C:\Program Files\CocCoc\Browser\Application\browser.exe" --remote-debugging-port=9222 --user-data-dir="%APPDATA%\CocCoc\Browser\User Data"

echo.
echo Coc Coc da khoi dong thanh cong!
echo Ban co the chay: npm start
echo.
pause
