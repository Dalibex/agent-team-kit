# Removes what instalar.ps1 added: the plugin folder, its settings.json entries,
# Claude Code's own records of it, the team rules in CLAUDE.md and the agents it
# installed (if unchanged).
#   powershell -ExecutionPolicy Bypass -File scripts\desinstalar.ps1 [-SinPreguntas] [-ClaudeDir <carpeta>]
param(
    [switch]$SinPreguntas,
    [string]$ClaudeDir
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'comun.ps1')
trap { Stop-WithMessage $_ }

$kit = Split-Path -Parent $PSScriptRoot
$claude = Resolve-ClaudeDir $ClaudeDir
$dest = Join-Path $claude $MarketplaceName
$settingsPath = Join-Path $claude 'settings.json'
$agentsDir = Join-Path $claude 'agents'
$installedPath = Join-Path $claude 'plugins\installed_plugins.json'
$knownPath = Join-Path $claude 'plugins\known_marketplaces.json'
$claudeMdPath = Join-Path $claude 'CLAUDE.md'
$storeDir = Join-Path $claude 'plugins\store'
# The pane's own memory; the pattern is exact so that another marketplace's
# files (agent-team_agent-team-kit-dev-<hash>.json) are not matched.
$storePattern = '^agent-team_agent-team-kit-[0-9a-f]{12}\.json$'

Write-Host ''
Write-Host 'Desinstalador de agent-team' -ForegroundColor Cyan
Write-Host "Carpeta de Claude: $claude"
Write-Host 'Mejor con Claude cerrado, para que no vuelva a escribir sus ficheros mientras tanto.'
Write-Host ''

if (-not $SinPreguntas -and -not (Ask-YesNo '¿Quitar el panel agent-team y lo que instaló el kit?')) {
    Write-Host 'No he tocado nada.'
    return
}

# (a) Parse everything first: if a file is broken, stop before changing any.
$null = Read-JsonObject $settingsPath
$null = Read-JsonObject $installedPath
$marketplace = Get-MarketplaceSource (Read-JsonObject $knownPath) $dest
$record = Read-JsonObject (Join-Path $dest 'instalacion.json')
$recordedRulesHash = Get-Child $record 'reglasSha256'
$rules = Get-ClaudeMdRules $claudeMdPath
# The rules text of this kit version tells the kit's block from one the person
# changed; if the kit's file is unreadable, only the recorded hash can.
$currentRules = $null
try { $currentRules = (Get-RulesLines $kit) -join "`n" } catch { }

# (b) Copies of the files before anything touches them (Claude Code's own
#     uninstall included). The ones still unchanged at the end are dropped again.
$backups = New-BackupDir $claude
$tracked = @(
    @{ Path = $settingsPath; Name = 'settings.json' },
    @{ Path = $installedPath; Name = 'installed_plugins.json' },
    @{ Path = $knownPath; Name = 'known_marketplaces.json' }
)
if ($rules.State -eq 'block') { $tracked += @{ Path = $claudeMdPath; Name = 'CLAUDE.md' } }
foreach ($item in $tracked) {
    if (Test-Path -LiteralPath $item.Path) { Copy-Item -LiteralPath $item.Path -Destination (Join-Path $backups $item.Name) }
}
$storeFiles = @()
if ($marketplace.State -ne 'other' -and (Test-Path -LiteralPath $storeDir)) {
    $storeFiles = @(Get-ChildItem -LiteralPath $storeDir -File | Where-Object { $_.Name -match $storePattern })
    foreach ($file in $storeFiles) { Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $backups $file.Name) }
}
$done = @()

# (c) Claude Code's own way first, when its CLI is there; what it leaves behind
#     is cleared by hand below.
if ($marketplace.State -eq 'other') {
    Write-Host "Tienes un marketplace agent-team-kit de otra fuente ($($marketplace.Description)): solo quito lo que puso el kit." -ForegroundColor Yellow
} else {
    Remove-ClaudePlugin $claude
}

# (d) Read the files again (the CLI may have changed them) and clear what is left.
$settings = Read-JsonObject $settingsPath
$installed = Read-JsonObject $installedPath
$known = Read-JsonObject $knownPath
foreach ($item in $tracked) {
    $copy = Join-Path $backups $item.Name
    if ($item.Name -ne 'CLAUDE.md' -and (Test-Path -LiteralPath $copy) -and
        (-not (Test-Path -LiteralPath $item.Path) -or (Get-FileHashText $copy) -ne (Get-FileHashText $item.Path))) {
        $done += "Claude Code ha quitado sus registros de $($item.Name) con su propio comando"
    }
}

# 1. settings.json. With a marketplace from another source, only the entry that
#    points to the kit's own folder is ours: enabledPlugins and pluginConfigs
#    belong to the other install.
$changed = $false
$pairs = New-Object System.Collections.ArrayList
$marketsNow = Get-Child $settings 'extraKnownMarketplaces'
if ($marketplace.State -ne 'other' -or (Test-DirectorySource (Get-Child $marketsNow $MarketplaceName) $dest)) {
    [void]$pairs.Add(@('extraKnownMarketplaces', $MarketplaceName))
}
if ($marketplace.State -ne 'other') {
    [void]$pairs.Add(@('enabledPlugins', $PluginKey))
    [void]$pairs.Add(@('pluginConfigs', $PluginKey))
}
foreach ($pair in $pairs) {
    $section = Get-Child $settings $pair[0]
    if (Remove-Child $section $pair[1]) {
        $changed = $true
        if (Test-EmptyObject $section) { [void](Remove-Child $settings $pair[0]) }
    }
}
# Claude Code's own uninstall may leave these sections empty: an empty one goes too.
foreach ($sectionName in @($pairs | ForEach-Object { $_[0] })) {
    if (Test-EmptyObject (Get-Child $settings $sectionName)) {
        [void](Remove-Child $settings $sectionName)
        $changed = $true
    }
}
if ($changed) {
    Write-JsonObject $settingsPath $settings
    $done += 'quitadas sus entradas de settings.json'
}

# 2. Claude Code's records of the install.
if ($marketplace.State -ne 'other' -and (Remove-Child (Get-Child $installed 'plugins') $PluginKey)) {
    Write-JsonObject $installedPath $installed
    $done += 'quitado de plugins\installed_plugins.json'
}
if ($marketplace.State -ne 'other' -and (Remove-Child $known $MarketplaceName)) {
    Write-JsonObject $knownPath $known
    $done += 'quitado de plugins\known_marketplaces.json'
}
foreach ($leftover in @('plugins\cache\agent-team-kit', 'plugins\marketplaces\agent-team-kit')) {
    if ($marketplace.State -eq 'other') { break }
    $path = Join-Path $claude $leftover
    if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Recurse -Force
        $done += "borrada $leftover"
    }
}

# 3. The team rules in CLAUDE.md (already copied above).
$rulesResult = Remove-RulesBlock $claude $currentRules $recordedRulesHash
if ($rulesResult.Status -in @('quitado', 'borrado')) { $done += $rulesResult.Message }

# (e) What the record knows about, from the copy kept in memory.
# The pane's own memory: packs, skill slots, picks per project, the tab, usage readings. Kept
# among the copies, so a reinstall can have it back.
foreach ($file in $storeFiles) {
    if (Test-Path -LiteralPath $file.FullName) {
        Remove-Item -LiteralPath $file.FullName -Force
        $done += "borrada la memoria del panel (plugins\store\$($file.Name))"
    }
}

# 4. Agents the kit installed, only if nobody changed them since.
$kept = @()
foreach ($agent in @(Get-Child $record 'agentes')) {
    if (-not $agent) { continue }
    $path = Join-Path $agentsDir $agent.nombre
    if (-not (Test-Path -LiteralPath $path)) { continue }
    if ((Get-FileHashText $path) -eq $agent.sha256) {
        Remove-Item -LiteralPath $path -Force
        $done += "borrado el agente $($agent.nombre)"
    } else {
        $kept += $agent.nombre
    }
}

# 5. The plugin folder itself.
if (Test-Path -LiteralPath $dest) {
    Remove-Item -LiteralPath $dest -Recurse -Force
    $done += "borrada la carpeta $dest"
}

# Copies of files that ended up unchanged are of no use.
foreach ($item in $tracked) {
    $copy = Join-Path $backups $item.Name
    if ((Test-Path -LiteralPath $copy) -and (Test-Path -LiteralPath $item.Path) -and
        (Get-FileHashText $copy) -eq (Get-FileHashText $item.Path)) {
        Remove-Item -LiteralPath $copy -Force
    }
}

Write-Host ''
if ($done.Count -eq 0) {
    Write-Host 'No había nada del kit instalado.' -ForegroundColor Yellow
} else {
    foreach ($line in $done) { Write-Host "  $line" }
    Write-Host ''
    Write-Host 'Desinstalado.' -ForegroundColor Green
}
if ($marketplace.State -eq 'other') {
    Write-Host 'No he tocado enabledPlugins, pluginConfigs, la memoria del panel ni los registros de Claude Code: son de la otra instalación.' -ForegroundColor Yellow
}
if (@('intacto', 'cambiado') -contains $rulesResult.Status) { Write-Host $rulesResult.Message -ForegroundColor Yellow }
if (@(Get-ChildItem -LiteralPath $backups).Count -gt 0) {
    Write-Host "Copias de los ficheros que he cambiado: $backups"
} else {
    Remove-Item -LiteralPath $backups -Force
}
$backupsRoot = Split-Path -Parent $backups
if ((Test-Path -LiteralPath $backupsRoot) -and @(Get-ChildItem -LiteralPath $backupsRoot).Count -eq 0) {
    Remove-Item -LiteralPath $backupsRoot -Force
}
foreach ($name in $kept) {
    Write-Host "No he borrado agents\$name porque lo has cambiado después de instalarlo." -ForegroundColor Yellow
}
Write-Host 'Abre una sesión nueva de Claude Code para que deje de cargar el panel.'
