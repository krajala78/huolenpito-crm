@echo off
title Tuo Excel-data CRM:aan
echo ================================
echo   Tuodaan Excel-data CRM:aan
echo ================================
echo.

cd /d "%~dp0"

echo Tuodaan data.xlsx tietokantaan...
python import_data.py data.xlsx

echo.
echo Paina mitä tahansa näppäintä sulkeaksesi...
pause
