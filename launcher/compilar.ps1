# Compila o Prisma.exe com o compilador de C# que já vem no Windows (.NET Framework 4); nada precisa ser baixado.
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { throw "Não achei o compilador de C# do Windows em $csc" }
$raiz = Split-Path -Parent $PSScriptRoot
& $csc /nologo /target:winexe /optimize+ "/win32icon:$PSScriptRoot\Prisma.ico" "/out:$raiz\Prisma.exe" `
  /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "$PSScriptRoot\Prisma.cs"
if ($LASTEXITCODE -ne 0) { throw "A compilação falhou." }
"Pronto: $raiz\Prisma.exe"
