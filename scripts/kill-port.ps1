# Kill process on specified port
param(
    [Parameter(Mandatory=$false)]
    [int]$Port = 3001
)

Write-Host "Finding process on port $Port..." -ForegroundColor Yellow

$connections = netstat -ano | findstr ":$Port"

if ($connections) {
    Write-Host "Found connections:" -ForegroundColor Cyan
    Write-Host $connections
    
    $processIds = $connections | ForEach-Object {
        if ($_ -match '\s+(\d+)\s*$') {
            $matches[1]
        }
    } | Select-Object -Unique
    
    foreach ($procId in $processIds) {
        try {
            $process = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($process) {
                Write-Host "Killing process: $($process.ProcessName) (PID: $procId)" -ForegroundColor Yellow
                Stop-Process -Id $procId -Force
                Write-Host "[OK] Process $procId killed" -ForegroundColor Green
            }
        } catch {
            Write-Host "[ERROR] Cannot kill process $procId" -ForegroundColor Red
        }
    }
} else {
    Write-Host "[OK] Port $Port is not in use" -ForegroundColor Green
}
