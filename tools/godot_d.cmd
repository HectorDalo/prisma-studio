@echo off
rem Roda o Godot do EnglishQuest gravando os dados internos (logs, cache de shaders) no D:, nunca no C:.
rem O Godot guarda isso em %%APPDATA%%\Godot; aqui o APPDATA aponta para D:\Claude\prisma\tmp\godot.
rem Uso: tools\godot_d.cmd --path <projeto> -s <script> -- <argumentos>
setlocal
set "APPDATA=%~dp0..\tmp\godot"
set "LOCALAPPDATA=%~dp0..\tmp\godot"
if not exist "%APPDATA%" mkdir "%APPDATA%"
if "%PRISMA_GODOT%"=="" set "PRISMA_GODOT=D:\EnglishQuest\tools\Godot_v4.7.2-stable_win64_console.exe"
"%PRISMA_GODOT%" %*
