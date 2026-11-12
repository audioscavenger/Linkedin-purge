@echo off
:: LIpurge.cmd wrapper for npm scripts
:: Forwards commands to npm run with -- to pass extra arguments cleanly.

setlocal

if "%~1"=="" (
    npm run help
    goto :end
)

npm run %1 -- %2 %3 %4 %5 %6 %7 %8 %9

:end
endlocal
