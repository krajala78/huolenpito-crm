@echo off
title Huolenpito CRM
echo ================================
echo   Huolenpito CRM - Kaynnistys
echo ================================
echo.

:: Siirry skriptin sijaintikansioon
cd /d "%~dp0"

:: Tarkista onko Python asennettu
python --version >nul 2>&1
if errorlevel 1 (
    echo VIRHE: Python ei loytynyt! Asenna Python osoitteesta https://python.org
    pause
    exit /b 1
)

:: Asenna tarvittavat paketit
echo Asennetaan tarvittavat paketit...
pip install flask pandas openpyxl --quiet

echo.
echo Kaynnistetaan sovellus...
echo Avaa selain osoitteeseen: http://localhost:5000
echo Sulje tama ikkuna lopettaaksesi sovelluksen.
echo.

:: Avaa Chrome 2 sekunnin viiveella
start "" /b cmd /c "timeout /t 2 >nul && start chrome http://localhost:5000"

:: Kaynnista Flask
python app.py

pause
