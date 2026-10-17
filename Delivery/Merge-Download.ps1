$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$parts = @(Get-ChildItem 'CPSS-LAB-Windows-0.3.0.zip.part*' | Sort-Object Name)
if ($parts.Count -ne 4) { throw 'Expected 4 parts. Extract the entire downloaded repository ZIP first.' }
$output = Join-Path $PSScriptRoot 'CPSS-LAB-Windows-0.3.0.zip'
$stream = [IO.File]::Create($output)
try { foreach ($part in $parts) { $inputStream = [IO.File]::OpenRead($part.FullName); try { $inputStream.CopyTo($stream) } finally { $inputStream.Dispose() } } } finally { $stream.Dispose() }
$actual = (Get-FileHash -Algorithm SHA256 $output).Hash.ToLowerInvariant()
if ($actual -ne '92d613b392ffeb2b9a3b1c4ba4efdf5b77481f3c4af8f5ffa23cb5e6ffaae634') { Remove-Item $output; throw 'Checksum mismatch. Download and extract the complete repository again.' }
Write-Host 'Checksum OK. Extracting CPSS LAB 0.3.0. Please wait...'
$destination = Join-Path $PSScriptRoot 'CPSS-LAB-0.3.0'
Expand-Archive -LiteralPath $output -DestinationPath $destination -Force
$exe = Join-Path $destination 'CPSS LAB.exe'
if (!(Test-Path -LiteralPath $exe)) { throw 'Application EXE missing after extraction.' }
Write-Host 'SUCCESS: Open CPSS LAB.exe in the selected folder.' -ForegroundColor Green
Start-Process explorer.exe -ArgumentList ('/select,"' + $exe + '"')
