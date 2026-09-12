@echo off
cd /d "%~dp0.."
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0stop-tunnel.ps1"