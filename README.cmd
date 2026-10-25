@echo OFF

:: This script generates the bullet-list TOC for your README.md, by reading each section
:: sample input: 
::    # ollama-warden
::    ## What it does
::    ## What it is not
::
:: sample output: 
:: - [ollama-warden](#ollama-warden)
::   - [What it does](#What-it-does)
::   - [What it is not](#What-it-is-not)

busybox grep -E "^#+ " README.md | sed -e "s/^# \(.*\)$/- \[\1\](#\1)/g" -e "s/^## \(.*\)$/  - \[\1\](#\1)/g" -e "s/^### \(.*\)$/    - \[\1\](#\1)/g" |^
busybox sed -e ":l s/\(([^:)]*\)[:]/\1/;tl" -e ":l s/\(([^ )]*\)[ ]/\1-/;tl"

echo:
echo                DO NOT FORGET to remove any extra parenthesis in the anchors!
echo:
pause

