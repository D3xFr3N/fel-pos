@echo off
REM Compatibilidad: scripts viejos abren este .cmd; redirige a VBS silencioso.
REM Evita errores de "start" con rutas Program Files (x86).
wscript //nologo "%~dp0Boot_FELPOS.vbs"
exit /b 0
