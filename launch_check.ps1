$exe = "C:\Users\Shadow\ShadowDrive\0.1.Ai\DysonCode\release\win-unpacked\DysonCode.exe"
$p = Start-Process -FilePath $exe -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 4
$id = $p.Id
if ($p.HasExited) {
    $ec = $p.ExitCode
    Write-Output "EXITED:$ec"
} else {
    Write-Output "RUNNING:$id"
    $p.Kill()
}
Remove-Item -Force $MyInvocation.MyCommand.Path
