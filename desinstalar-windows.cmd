@echo off
setlocal
rem Quita el panel agent-team y lo que instalo el kit. Doble clic, o desde una consola: desinstalar-windows.cmd [-SinPreguntas]
rem PSModulePath vacio: si se lanza desde PowerShell 7, Windows PowerShell 5.1 no debe heredar sus modulos.
set "PSModulePath="
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\desinstalar.ps1" %*
set "codigo=%errorlevel%"
rem Con doble clic la ventana se queda abierta; con -SinPreguntas (un script) no espera.
echo %* | "%SystemRoot%\System32\find.exe" /i "-Sin" >nul
if errorlevel 1 (
    echo.
    pause
)
exit /b %codigo%
