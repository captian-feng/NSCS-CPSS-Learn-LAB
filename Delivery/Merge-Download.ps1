$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$parts = @(Get-ChildItem 'CPSS-LAB-All-Files.zip.part*' | Sort-Object Name)
if ($parts.Count -ne 8) { throw 'Expected 8 parts. Extract the entire downloaded repository ZIP first.' }
$output = Join-Path $PSScriptRoot 'CPSS-LAB-All-Files.zip'
$stream = [IO.File]::Create($output)
try { foreach ($part in $parts) { $inputStream = [IO.File]::OpenRead($part.FullName); try { $inputStream.CopyTo($stream) } finally { $inputStream.Dispose() } } } finally { $stream.Dispose() }
$actual = (Get-FileHash -Algorithm SHA256 $output).Hash.ToLowerInvariant()
if ($actual -ne '848bfbd0829f53de0a95f45725497b1c6e26765136406c65283637515c12839b') { Remove-Item $output; throw 'Checksum mismatch. Download and extract the complete repository again.' }
Write-Host 'SUCCESS: CPSS-LAB-All-Files.zip is ready. Extract it to install CPSS LAB.' -ForegroundColor Green
Start-Process explorer.exe -ArgumentList ('/select,"' + $output + '"')
