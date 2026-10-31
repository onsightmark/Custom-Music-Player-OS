param(
  [string]$ReportPath = '.artifacts/ci/windows-audio.json'
)

$ErrorActionPreference = 'Stop'
$serviceNames = @('AudioEndpointBuilder', 'Audiosrv')
$report = [ordered]@{
  startedAt = [DateTime]::UtcNow.ToString('o')
  before = $null
  startAttempts = @()
  after = $null
  error = $null
  afterError = $null
}

function Get-AudioState {
  [ordered]@{
    observedAt = [DateTime]::UtcNow.ToString('o')
    services = @(
      Get-CimInstance -ClassName Win32_Service -OperationTimeoutSec 10 `
        -Filter "Name = 'AudioEndpointBuilder' OR Name = 'Audiosrv'" |
        Select-Object Name, DisplayName, State, StartMode, ExitCode, ServiceSpecificExitCode
    )
    soundDevices = @(
      Get-CimInstance -ClassName Win32_SoundDevice -OperationTimeoutSec 10 |
        Select-Object Name, Status, Manufacturer, PNPDeviceID, ConfigManagerErrorCode
    )
    audioEndpoints = @(
      Get-CimInstance -ClassName Win32_PnPEntity -OperationTimeoutSec 10 `
        -Filter "PNPClass = 'AudioEndpoint'" |
        Select-Object Name, Status, Manufacturer, DeviceID, ConfigManagerErrorCode
    )
  }
}

$failure = $null
try {
  $report.before = Get-AudioState
  foreach ($serviceName in $serviceNames) {
    $service = Get-Service -Name $serviceName
    if ($service.Status -ne [System.ServiceProcess.ServiceControllerStatus]::Running) {
      $report.startAttempts += $serviceName
      if ($service.Status -ne [System.ServiceProcess.ServiceControllerStatus]::StartPending) {
        $service.Start()
      }
      $service.WaitForStatus(
        [System.ServiceProcess.ServiceControllerStatus]::Running,
        [TimeSpan]::FromSeconds(15)
      )
    }
  }
} catch {
  $failure = $_
  $report.error = $_.Exception.Message
}

try {
  $report.after = Get-AudioState
} catch {
  if ($null -eq $failure) { $failure = $_ }
  $report.afterError = $_.Exception.Message
}

$report.finishedAt = [DateTime]::UtcNow.ToString('o')
$directory = Split-Path -Parent $ReportPath
if ($directory) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
$json = $report | ConvertTo-Json -Depth 6
$json | Set-Content -Path $ReportPath -Encoding utf8
Write-Output $json
if ($null -ne $failure) { throw $failure }
