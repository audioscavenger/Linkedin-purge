@echo OFF
pushd %~dp0

:top
set version=v2.1.9
set author=audioscavenger

:defaults
set editor=notepad
set removeDangling=true
set buildVersion=
set buildName=
set PROJECT=%~dp0
for %%a in (%PROJECT:\= %) DO set PROJECT=%%a

:custom
:: WHAT2BACKUP= list of files and subfolders to backup, default is everything recursively
set WHAT2BACKUP=.\*
:: WHAT2EXCLUDE= list of files and subfolders to exclude, 7z format
set WHAT2EXCLUDE=-xr!backup -xr!.svn -xr!.git -xr!*.7z -xr!*.zip -xr!*.msi -xr!*.msu -xr!*.log -xr!*.exe -xr!*.dll -xr!*.bin -xr!*.mp3 -xr!*.mp4 -xr!*.wmv -xr!*.key -xr!*.crt -xr!*.crl -xr!*.pem -xr!*.cer 
:: BACKUP_FOLDER stores rotation of backups: the whole project + diff files
set BACKUP_FOLDER=%~sdp0backup
:: rotation=how many backup-%CURRENT_DATE_NOSEP%-%CURRENT_TIME%.7z to append to the main backup.7z before rebuilding it from scratch
set rotation=20
:: editor must be able to lock on the commit file, notepad does that, notepad++ does not. Test with your own
set editor=notepad
:: PROJECT= should match the root folder
REM set PROJECT=
:: projectConfig= can be empty == the main batch file that holds a line that says "set version=x.y.z", scrapped to fill in commit file header
set projectConfig=%PROJECT%.cmd
:: set buildVersionKeyword whatever the version variable is, otherwise we will look for 'version='
set buildVersionKeyword=version
:: buildVersion= a version string like x.y.z used as header in the commit file, coming from %projectConfig%
:: If your project does not have such a file, and buildVersionAutomated=empty, your will be prompted for a version == not unattended
:: setting up buildVersionAutomated=x.y.z avoids this prompt pause, if you want this script to be fully unattended and not have a projectConfig file
set buildVersionAutomated=
:: textFiles are textFiles extensions, add your own to the list
set textFilesUnix=*.txt *.md *.pl *.py *.ps1 *.ini *.cfg *.xml *.conf *.json *.*js* *.y*ml *.sh *.css *.html
set textFilesDos=*.cmd *.bat *.awk
set textFilesExclude=node_modules dist .git .github backup .continue assets config
:: is true, process textFiles with busybox unix2dos before :local_backup
set doUnix2dos=false
set doDos2Unix=false
REM git config core.autocrlf false
REM git config --global core.autocrlf true
REM git add --renormalize .


:prechecks
where git >NUL  || (echo ERROR: git.exe not found: https://git-scm.com/install/windows & timeout /t 10 & exit 1)
where gh >NUL   || (echo ERROR: gh.exe not found:  https://cli.github.com/ & timeout /t 10 & exit 1)

call "%~dpn0.cfg_custom.cmd" >NUL 2>&1
IF "%~d0"=="%PROJECT%\" echo ERROR: this cannot work at the root drive without a PROJECT name & timeout /t 10 & exit 1
git config core.autocrlf true
git config http.postBuffer 209715200
call :setup_time
call :set_colors
:: WIP: notepad++ unfortunately does not work with start /wait
REM IF EXIST "%ProgramFiles%\Notepad++\notepad++.exe" set editor="%ProgramFiles%\Notepad++\notepad++.exe"
IF NOT EXIST "%BACKUP_FOLDER%\" set BACKUP_FOLDER=%~dp0\backup

:main
title %~n0 %version% by %author%: syncing %PROJECT%
call :getBuildVersion
call :local_backup
set commitFile=%BACKUP_FOLDER%\commit.%PROJECT%.%buildVersion%.txt
call :unix2dos
call :fetch
call :status_uptodate && goto :end
call :status_master   && call :rename_master
call :status_uptodate && goto :end
call :status_ff       && call :pull_ff
call :status_uptodate && goto :end
call :status_diverged && call :pull_merge
call :status_uptodate && goto :end
call :status_modified && call :add
call :commitMessage
call :local_backup_named "%buildName%"
call :createTag %commitFile% %buildVersion%
call :commit %commitFile%
call :push
IF DEFINED releaseVersion (
  call :createRelease %commitFile% %buildVersion%
)
goto :end

:pull_ff
echo %HIGH%%b%  %~0 %END% 1>&2

:: These REM blocks are to account for when we pull a different version of this batch.
:: It will eventually crash if the modifications moves the cursor above or below.
:: The solution is to encaps the pull line with commented REM and eventually the cursor will move within the REMs.
:: Indeed this works only if the quantity of modifications that take place BEFORE the pull line stay within +/- 2064 chars.
:: To further protect this sritical line, :pull_ff has been move to the top just afer :main
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 

git merge --ff-only origin/main || git reset --hard origin/main

:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
:: REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM REM 
exit /b %ERRORLEVEL%
goto :EOF

:local_backup
echo %HIGH%%b%  %~0 %END% 1>&2

md "%BACKUP_FOLDER%" 2>NUL
del /f /q "%BACKUP_FOLDER%\%PROJECT%.7z.tmp*" 2>NUL
echo testing "%BACKUP_FOLDER%\%PROJECT%.7z" ... 1>&2
IF EXIST "%BACKUP_FOLDER%\%PROJECT%.7z" 7z t "%BACKUP_FOLDER%\%PROJECT%.7z" -bse1 2>NUL | findstr ERROR: >NUL && del /f /q "%BACKUP_FOLDER%\%PROJECT%.7z"

:: every nth rotation differential backups, we reset the master backup to decrease its size
for /f %%n in ('dir /b "%BACKUP_FOLDER%\*.7z" 2^>NUL') DO set /A _num=1
set /a "_num%%=rotation"
IF %_num% EQU 0 del /f /q "%BACKUP_FOLDER%\%PROJECT%.7z" 2>NUL

REM -slp : set Large Pages mode
REM -ms=off : disable solid
REM -bso0 : standard output messages to NUL
REM -bsp2 : progress information to stderr
REM -uq0 : File exists in archive, but deleted on disk = Ignore file
REM -uq3 : File exists in archive, but deleted on disk = Create Anti-item
IF EXIST "%BACKUP_FOLDER%\%PROJECT%.7z" (
  call :local_backup_update
) ELSE (
  echo %c%7z a "%BACKUP_FOLDER%\%PROJECT%.7z" -ms=off -slp -bso0 -bsp2 -uq3 %WHAT2BACKUP% %HIGH%%k%%WHAT2EXCLUDE%
  7z a "%BACKUP_FOLDER%\%PROJECT%.7z" -ms=off -slp -bso0 -bsp2 -uq3 %WHAT2BACKUP% %WHAT2EXCLUDE%
  echo:%END%
)

goto :EOF

:local_backup_update
echo %HIGH%%b%  %~0 %END% 1>&2

:: creates a new archive %PROJECT%-%CURRENT_DATE_NOSEP%-%buildVersion%.7z and writes to this archive all files from current directory which differ from files in %PROJECT%.7z archive
:: %PROJECT%.7z archive will also be updated after.

echo %c%7z u "%BACKUP_FOLDER%\%PROJECT%.7z" -ms=off -bso0 -bsp2 -up0q3x2z0!"%BACKUP_FOLDER%\%PROJECT%-%CURRENT_DATE_NOSEP%-%buildVersion%.7z" %WHAT2BACKUP% %HIGH%%k%%WHAT2EXCLUDE%
7z u "%BACKUP_FOLDER%\%PROJECT%.7z" -ms=off -bso0 -bsp2 -up0q3x2z0!"%BACKUP_FOLDER%\%PROJECT%-%CURRENT_DATE_NOSEP%-%buildVersion%.7z" %WHAT2BACKUP% %WHAT2EXCLUDE%
echo:%END% 1>&2

IF EXIST "%BACKUP_FOLDER%\%PROJECT%-%CURRENT_DATE_NOSEP%-%buildVersion%.7z" (
  echo 7z t "%BACKUP_FOLDER%\%PROJECT%-%CURRENT_DATE_NOSEP%-%buildVersion%.7z" ^| findstr /C:"No files" 
  7z t "%BACKUP_FOLDER%\%PROJECT%-%CURRENT_DATE_NOSEP%-%buildVersion%.7z" | findstr /C:"No files" && del /f /q "%BACKUP_FOLDER%\%PROJECT%-%CURRENT_DATE_NOSEP%-%buildVersion%.7z"
)

goto :EOF

:local_backup_named "buildName"
echo %HIGH%%b%  %~0 %END% 1>&2
set buildName=%~1

IF DEFINED buildName (
  IF EXIST "%BACKUP_FOLDER%\%PROJECT%-%CURRENT_DATE_NOSEP%-%buildVersion%.7z" (
    move /y "%BACKUP_FOLDER%\%PROJECT%-%CURRENT_DATE_NOSEP%-%buildVersion%.7z" "%BACKUP_FOLDER%\%PROJECT%-%CURRENT_DATE_NOSEP%-%buildVersion%-%buildName%.7z" >NUL 2>&1
  )
)

exit /b %ERRORLEVEL%
goto :EOF

:getBuildVersion
echo %HIGH%%b%  %~0 %END% 1>&2

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
echo buildVersion=%buildVersion%

IF NOT DEFINED buildVersion IF DEFINED buildVersionAutomated set buildVersion=%buildVersionAutomated%
IF NOT DEFINED PROJECT      set /p PROJECT=PROJECT? 
IF NOT DEFINED buildVersion set /p buildVersion=buildVersion? 


:: get version number when it's a release; then we set releaseVersion == flag for a release
IF     "%buildVersion:~0,1%"=="v" set releaseVersion=%buildVersion:~1%
echo releaseVersion=%releaseVersion%
call :getPreviousVersion %releaseVersion%

REM echo off
REM pause

goto :EOF

:getPreviousVersion releaseVersion
echo %HIGH%%b%  %~0 %END% 1>&2

IF NOT DEFINED releaseVersion exit /b 0
for /f "tokens=1,2,3 delims=." %%a in ("%releaseVersion%") DO (
  set versionMajor=%%a
  set versionMinor=%%b
  set versionPatch=%%c
)

:: now we guestimate the previous version. This will only work for 3 numbers AND Minor increases. 
:: We cannot guess when Major increases because it's up to the maintainer
set /A versionPatchPrevious=versionPatch - 1
:: case for 1.1.99 -> 1.2.0 = we will   look for 1.1.*
:: case for 1.0.99 -> 1.1.0 = we will   look for 1.0.*
IF %versionPatchPrevious% LSS 0 (
  set versionPatchPrevious=[0-9]+
  set /A versionMinorPrevious=versionMinor - 1
) ELSE set versionMinorPrevious=%versionMinor%

:: case for 1.0.99 -> 1.1.0 = we shall  look for 1.0.* BUT stop at the next v1.* line
:: case for 1.8.99 -> 2.0.0 = we shall  look for 1.8.* BUT we cannot know that
::    all we can do is grab lines with 1.*.*
::    we could solve this by looking at the previous release from git or local commit files
IF %versionMinorPrevious% LSS 0 (
  set versionMinorPrevious=[0-9]+
  set /A versionMajorPrevious=versionMajor - 1
) ELSE set versionMajorPrevious=%versionMajor%

echo previousVersion=%versionMajorPrevious%.%versionMinorPrevious%.%versionPatchPrevious%

goto :EOF

:fetch
echo %HIGH%%b%  %~0 %END% 1>&2
git fetch --all
goto :EOF

:status_ff
echo %HIGH%%b%  %~0 %END% 1>&2
git status | findstr /C:"can be fast-forwarded" && exit /b 0
exit /b 1
goto :EOF

:pull_merge
echo %HIGH%%b%  %~0 %END% 1>&2
git merge origin/main && exit /b 0
git add .
git status >>%commitFile%
git commit -a -F %commitFile%
exit /b %ERRORLEVEL%
goto :EOF

:pull_force
echo %HIGH%%b%  %~0 %END% 1>&2
git pull --force || git reset --hard origin/main
exit /b %ERRORLEVEL%
goto :EOF

:rename_master
echo %HIGH%%b%  %~0 %END% 1>&2
:: for cases such as: Your configuration specifies to merge with the ref 'refs/heads/master'
:: git has renamed master to main since 2020 but people did not notice. Including me.
:: https://www.git-tower.com/learn/git/faq/git-rename-master-to-main
REM git checkout master
REM git branch -a
git symbolic-ref HEAD refs/heads/main
git remote set-head origin -a
git remote set-head origin main
git branch -m master main || git branch -d master --force
git push -u origin main
git push origin --delete master || (
  echo:
  echo NOW go to your git^>Settings^>Branches and make the main branch the default
  pause
  git push origin --delete master
)
REM branch 'main' set up to track 'origin/main'.
REM remote: Gitea: branch master is the default branch and cannot be deleted
REM ! [remote rejected] master (pre-receive hook declined)

REM and for all other clients, switch to main:
REM git fetch origin
REM git branch --unset-upstream
REM git branch --set-upstream-to=origin/main
REM git reset --hard origin/main
REM git clean -d --force
REM git checkout main
REM git pull

exit /b %ERRORLEVEL%
goto :EOF

:status_diverged
echo %HIGH%%b%  %~0 %END% 1>&2

git status | findstr /C:"have diverged" >NUL && git status && exit /b 0
exit /b 1
goto :EOF

:status_modified
echo %HIGH%%b%  %~0 %END% 1>&2

git status | findstr /C:"Untracked files:" >NUL && git status && exit /b 0
git status | findstr /C:"Changes not staged for commit:" >NUL && git status && exit /b 0
exit /b 1
goto :EOF

:status_master
echo %HIGH%%b%  %~0 %END% 1>&2

git status | findstr /I /C:"On branch master" && exit /b 0
git branch -a | findstr /I /C:"origin/master" && exit /b 0
exit /b 1
goto :EOF

:status_uptodate
echo %HIGH%%b%  %~0 %END% 1>&2

git status | findstr /I /C:"On branch master" >NUL && exit /b 1
git status | findstr /I /C:"Your branch is ahead" >NUL && exit /b 1
git status | findstr /I /C:"Your branch is behind" >NUL && exit /b 1
git status | findstr /I /C:"Changes not staged for commit" >NUL && exit /b 1
git status | findstr /I /C:"have diverged" >NUL && exit /b 1
git status | findstr /I /C:"nothing to commit" && exit /b 0

git status
exit /b 1
goto :EOF

:add
echo %HIGH%%b%  %~0 %END% 1>&2
:: git rm --cached `git ls-files -i -c --exclude-from=.gitignore` 
for /f "tokens=*" %%a in ('git ls-files -i -c --exclude-from=.gitignore') DO git rm --cached "%%a"
git add .
git status
exit /b %ERRORLEVEL%
goto :EOF

:commitMessage
echo %HIGH%%b%  %~0 %END% 1>&2

:: get remote message over local message; we must assume that the remote is always the current one
git tag -l %buildVersion% -n999 >%commitFile%
call :isEmpty %commitFile% && echo Pulling message for tag %buildVersion%: EMPTY || echo Pulling message for tag %buildVersion%: EXIST

:: we now reuse older commitFile if exist. Commit again over same version will also recreate the tag
IF DEFINED releaseVersion (
  REM :: release!
  call :isEmpty %commitFile% && echo %buildVersion% release >%commitFile%
  
  REM :: now we extract all the previous patch version lines from that file
  REM :: this works only if the lines start with "* [x] 1.0.7.x .. message.."
  echo ddebug IF EXIST CONTRIBUTING.md busybox grep -E "^\* \[x\] %versionMajorPrevious%.%versionMinorPrevious%.%versionPatchPrevious%" CONTRIBUTING.md
  IF EXIST CONTRIBUTING.md busybox grep -E "^\* \[x\] [v]?%versionMajorPrevious%.%versionMinorPrevious%.%versionPatchPrevious%" CONTRIBUTING.md | busybox sed -n "/\* \[x\] v[0-9]\./q;p" >>%commitFile%
  
) ELSE (
  REM :: just a commit
  call :isEmpty %commitFile% && echo %buildVersion% WIP >%commitFile%
  REM :: now we append found dev notes for that version
  IF EXIST CONTRIBUTING.md busybox grep -E "^\* \[x\] %buildVersion%" CONTRIBUTING.md >>%commitFile%
  REM :: now we append modifications to the same commit message and replace the tag each time. Makes more sense.
  git status | findstr "modified: deleted:" >>%commitFile%
)

:: insert smth like "v1.2.3 tidy" or "1.2.3 WIP" as the first line; 
:: named differential zipfile will be created if buildName != WIP
:: buildVersion starting with a v triggers the release
start "" /wait %editor% %commitFile%

:: if you input smth like "release 1.2.3 tidy" as the first line, buildName=tidy and a named differential zipfile will be created
for /f "tokens=2*" %%n in ('findstr /B v %commitFile%') DO set "buildName=%%n"
IF /I "%buildName%"=="WIP" set buildName=

exit /b %ERRORLEVEL%
goto :EOF

:createTag commitFile buildVersion
echo %HIGH%%b%  %~0 %END% 1>&2
set commitFile=%1
set buildVersion=%2

echo git tag -d %buildVersion% 1>&2
git tag -d %buildVersion% 2>NUL || echo Tag %buildVersion% not found, creating it

echo git push --delete origin %buildVersion% 1>&2
git push --delete origin %buildVersion% 2>NUL

:: failure to delete remote tage will simply output an error when pushing later on:
 REM ! [rejected]        7.2.19 -> 7.2.19 (already exists)
REM error: failed to push some refs to 'https://github.com/user/project'
REM hint: Updates were rejected because the tag already exists in the remote.

echo git tag -a %buildVersion% --file=%commitFile% 1>&2
git tag -a %buildVersion% --file=%commitFile%
:: what to do with error: failed to push some refs to 'https://git/name/project'?

exit /b %ERRORLEVEL%
goto :EOF

:createRelease commitFile buildVersion
echo %HIGH%%b%  %~0 %END% 1>&2
set commitFile=%1
set buildVersion=%2

IF NOT "%buildVersion:~0,1%"=="v" exit /b 1

set /p title=< %commitFile%

echo gh release create %buildVersion% --title "%title%" -F %commitFile%
gh release create %buildVersion% --title "%title%" -F %commitFile%

exit /b %ERRORLEVEL%
goto :EOF

:commit commitFile
echo %HIGH%%b%  %~0 %END% 1>&2

attrib /S -R >NUL 2>&1
REM icacls .git       /q /c /t /reset
REM The tag present in the reparse point buffer is invalid.

git commit -a -F %1
REM error: unable to create temporary file: Invalid argument      -->.git was read-only
REM error: install-DS-1-product.cmd: failed to insert into database
REM error: unable to index file 'install-DS-1-product.cmd'
REM fatal: updating files failed

exit /b %ERRORLEVEL%
goto :EOF

:push
echo %HIGH%%b%  %~0 %END% 1>&2
REM git push
git push origin main --tags --set-upstream 

exit /b %ERRORLEVEL%
goto :EOF

:unix2dos
echo %HIGH%%b%  %~0 %END% 1>&2
IF /I "%doUnix2dos%"=="true" where busybox >NUL 2>&1 && FOR /f "tokens=*" %%F in ('dir /b /s %textFilesDos% ^| findstr /V "%textFilesExclude%"') DO busybox unix2dos "%%~F"
goto :EOF

:dos2unix
echo %HIGH%%b%  %~0 %END% 1>&2
IF /I "%doDos2Unix%"=="true" where busybox >NUL 2>&1 && FOR /f "tokens=*" %%F in ('dir /b /s %textFilesUnix% ^| findstr /V "%textFilesExclude%"') DO busybox dos2unix "%%~F"
goto :EOF

:set_colors
set END=[0m
set HIGH=[1m
set Underline=[4m
set REVERSE=[7m

REM echo [101;93m NORMAL FOREGROUND COLORS [0m
set k=[30m
set r=[31m
set g=[32m
set y=[33m
set b=[34m
set m=[35m
set c=[36m
set w=[37m

goto :EOF


:setup_time
IF DEFINED DEBUG echo DEBUG: %m%%~n0 %~0 %HIGH%%*%END% 1>&2

set CURRENT_DATE=%DATE:/=-%
set GOOD_DATE=%CURRENT_DATE:~0,10%
:: ISO
if "%CURRENT_DATE:~2,1%" EQU "-" set GOOD_DATE=%DATE:~6,4%-%DATE:~3,2%-%DATE:~0,2%
:: US
if "%CURRENT_DATE:~3,1%" EQU " " set GOOD_DATE=%DATE:~10,4%-%DATE:~4,2%-%DATE:~7,2%
set CURRENT_DATE_NOSEP=%GOOD_DATE:-=%

set CURRENT_TIME=%TIME::=%

:: BUG: cannot add numbers that start with 0
set /A nextHour=%CURRENT_TIME:~0,2% + 1
set nextHour=%nextHour%%TIME:~3,2%

if "%CURRENT_TIME:~0,1%" == " " set CURRENT_TIME=0%CURRENT_TIME:~1%
set CURRENT_TIME=%CURRENT_TIME:~0,4%
goto :EOF


:isEmpty
IF NOT EXIST %1 exit /b 0
exit /b 0%~z1
goto :EOF


:end
echo -------------------- THE END -------------------- 1>&2
git gc --auto
IF NOT DEFINED removeDangling git fsck | findstr dangling && (
  echo: 1>&2
  set /p removeDangling=remove danglings? [N/y] 
)
IF DEFINED removeDangling (
  git reflog expire --expire=now --all
  git gc --prune=now
)

timeout /t 5
exit /b 0

REM redirect origin: git remote set-url origin https://github.com/user/gitsync
REM git config merge.tool vimdiff
REM git config merge.conflictstyle diff3
REM git config mergetool.prompt false

REM git config --global user.email you@example.com
REM git commit --amend --reset-author

REM reset existing project:
REM git init
REM git remote add origin https://github.com/user/gitsync
REM git fetch --force
REM git reset --hard
REM git clean -fd
REM git pull --force

REM also rename master to main:
REM git symbolic-ref HEAD refs/heads/main
REM git remote set-head origin -a
REM git remote set-head origin main
REM git branch -m master main || git branch -d master --force
REM git push -u origin main
REM git push origin --delete master || echo now switch master as default on the remote
REM git push origin --delete master

REM git pull origin main --force


