@echo OFF
pushd %~sdp0

call gitsync.cfg_custom.cmd

:getBuildVersion
REM echo on

IF NOT DEFINED buildVersion IF EXIST "%projectConfig%" for /F "tokens=3 delims== "  %%v in ('findstr /R /I /C:"[ ]*[set|export] %buildVersionKeyword%=[v0-9]" "%projectConfig%"') DO set buildVersion=%%v
REM x%buildVersion%x
IF NOT DEFINED buildVersion IF EXIST "%projectConfig%" for /F "tokens=3"            %%v in ('findstr /R /I /C:"[ ]*[#/][#/]*[ ][ ]*%buildVersionKeyword%[:=][ ][ ]*[v0-9]" "%projectConfig%"') DO set buildVersion=%%v
REM x%buildVersion%x
IF NOT DEFINED buildVersion IF EXIST "%projectConfig%" for /F "tokens=3 delims=="   %%v in ('findstr /R /I /C:"[ ]*[#/][#/]*[ ][ ]*%buildVersionKeyword%[ ][ ]*=[ ][ ]*[v0-9]" "%projectConfig%"') DO set buildVersion=%%v
REM x%buildVersion%x
IF NOT DEFINED buildVersion IF EXIST "%projectConfig%" for /F "tokens=3 delims=:= " %%v in ('findstr /R /I /C:"[ ]*[# /]*%buildVersionKeyword%[:=][ ']*[v0-9]" "%projectConfig%"') DO set buildVersion=%%v
REM x%buildVersion%x
IF NOT DEFINED buildVersion IF EXIST "%projectConfig%" for /F "tokens=3 delims=:= " %%v in ('findstr /R /I /C:"[ ]*[# /]*%buildVersionKeyword%[ ][ ]*[:=][ ']*[v0-9]" "%projectConfig%"') DO set buildVersion=%%v
REM x%buildVersion%x
IF NOT DEFINED buildVersion IF EXIST "%projectConfig%" for /F "tokens=2 delims=="   %%v in ('findstr /R /I /C:"[ ]*[# /]*%buildVersionKeyword%[ ][ ]*=[v0-9]" "%projectConfig%"') DO set buildVersion=%%v
REM x%buildVersion%x
IF NOT DEFINED buildVersion IF EXIST "%projectConfig%" for /F "tokens=2 delims=:"   %%v in ('findstr /R /I /C:"[ ]*[# /]*%buildVersionKeyword%[ ][ ]*:[v0-9]" "%projectConfig%"') DO set buildVersion=%%v
REM x%buildVersion%x
:: json
IF NOT DEFINED buildVersion IF EXIST "%projectConfig%" for /F "tokens=2 delims=:, " %%v in ('findstr /R /C:"%buildVersionKeyword%" "%projectConfig%"') DO set buildVersion=%%v
REM x%buildVersion%x

:: cleanup quotes:
IF     DEFINED buildVersion set "buildVersion=%buildVersion:'=%"
IF     DEFINED buildVersion set "buildVersion=%buildVersion:"=%"
REM echo buildVersion=%buildVersion%

IF NOT DEFINED buildVersion IF DEFINED buildVersionAutomated set buildVersion=%buildVersionAutomated%
IF NOT DEFINED buildVersion set /p buildVersion=buildVersion? 

REM echo off
REM pause

set    commitMessage=%buildVersion% WIP
                echo                %commitMessage%
set /P commitMessage=commitMessage? 
echo %commitMessage% >.\backup\commit.%PROJECT%.%buildVersion%-push.txt

git add . >>.\backup\commit.%PROJECT%.%buildVersion%-push.txt 2>&1
git commit -a -F .\backup\commit.%PROJECT%.%buildVersion%-push.txt && git push
