$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$configPath = Join-Path $repoRoot 'supabase\config.toml'
$config = Get-Content -LiteralPath $configPath -Raw
if ($config -notmatch '(?m)^project_id\s*=\s*"ehealth-lc-manager-test"\s*$') {
  throw 'Refusing to run: supabase/config.toml is not the isolated ehealth-lc-manager-test project.'
}

$env:SUPABASE_TELEMETRY_DISABLED = '1'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is not installed. Use the separate-development-project instructions in the QA report; this script never links a cloud project.'
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Desktop is not running. Start Docker Desktop, then rerun this script.'
}

Push-Location $repoRoot
try {
  supabase start
  if ($LASTEXITCODE -ne 0) { throw 'supabase start failed.' }

  supabase db reset --local
  if ($LASTEXITCODE -ne 0) { throw 'Local database reset failed.' }

  $stateDirectoryProposalPath = Join-Path $repoRoot 'supabase\proposals\20261120_programme_state_directory.sql'
  supabase db query --local --file $stateDirectoryProposalPath
  if ($LASTEXITCODE -ne 0) { throw 'Applying the programme state directory proposal to the disposable local database failed.' }

  $bossDirectoryProposalPath = Join-Path $repoRoot 'supabase\proposals\20261122_boss_directory_data.sql'
  supabase db query --local --file $bossDirectoryProposalPath
  if ($LASTEXITCODE -ne 0) { throw 'Applying the Boss directory data proposal to the disposable local database failed.' }

  $issueFixturePath = Join-Path $repoRoot 'supabase\tests\fixtures\operational_issues_remote_shape.sql'
  supabase db query --local --file $issueFixturePath
  if ($LASTEXITCODE -ne 0) { throw 'Creating the local-only Operational Issues schema fixture failed.' }

  $proposalPath = Join-Path $repoRoot 'supabase\proposals\20261115_task_movement_state_integrity.sql'
  supabase db query --local --file $proposalPath
  if ($LASTEXITCODE -ne 0) { throw 'Applying the task/movement review proposal to the disposable local database failed.' }

  $reportingProposalPath = Join-Path $repoRoot 'supabase\proposals\20261116_reporting_and_evidence_contract.sql'
  supabase db query --local --file $reportingProposalPath
  if ($LASTEXITCODE -ne 0) { throw 'Applying the reporting/evidence review proposal to the disposable local database failed.' }

  $stateScopeProposalPath = Join-Path $repoRoot 'supabase\proposals\20261117_state_scope_hardening.sql'
  supabase db query --local --file $stateScopeProposalPath
  if ($LASTEXITCODE -ne 0) { throw 'Applying the additional state-scope review proposal to the disposable local database failed.' }

  $issuesProposalPath = Join-Path $repoRoot 'supabase\proposals\20261118_operational_issues_state_scope.sql'
  supabase db query --local --file $issuesProposalPath
  if ($LASTEXITCODE -ne 0) { throw 'Applying the Operational Issues review proposal to the disposable local database failed.' }

  $dpmOverviewProposalPath = Join-Path $repoRoot 'supabase\proposals\20261119_dpm_state_overview.sql'
  supabase db query --local --file $dpmOverviewProposalPath
  if ($LASTEXITCODE -ne 0) { throw 'Applying the DPM state overview proposal to the disposable local database failed.' }

  $timesheetProposalPath = Join-Path $repoRoot 'supabase\proposals\20261121_monthly_lc_timesheets.sql'
  supabase db query --local --file $timesheetProposalPath
  if ($LASTEXITCODE -ne 0) { throw 'Applying the monthly timesheet proposal to the disposable local database failed.' }

  $bossReportingProposalPath = Join-Path $repoRoot 'supabase\proposals\20261123_boss_programme_executive_reporting.sql'
  supabase db query --local --file $bossReportingProposalPath
  if ($LASTEXITCODE -ne 0) { throw 'Applying the Boss executive reporting proposal to the disposable local database failed.' }

  supabase test db supabase/tests/20261115_security_foundation.pgtap.sql supabase/tests/20261116_reporting_evidence.pgtap.sql supabase/tests/20261118_operational_issues_scope.pgtap.sql supabase/tests/20261121_monthly_lc_timesheets.pgtap.sql supabase/tests/20261123_boss_programme_executive_reporting.pgtap.sql --local
  if ($LASTEXITCODE -ne 0) { throw 'The targeted pgTAP suite failed.' }
}
finally {
  Pop-Location
}

Write-Host 'Local security test environment is ready. Fixture users use the password documented in supabase/seed.sql.'
