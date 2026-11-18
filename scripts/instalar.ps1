# Installs the agent-team pane (which brings its four agents) and, if asked, the team rules into Claude Code.
# From 0.8.0 the agents come inside the plugin: the copies an earlier kit put in agents/ are retired.
# -Agentes is still accepted, so older command lines keep working, and does nothing.
# Run it through instalar-windows.cmd, or:
#   powershell -ExecutionPolicy Bypass -File scripts\instalar.ps1 [-Nombre Ana] [-Reglas] [-SinPreguntas] [-ClaudeDir <carpeta>]
param(
    [string]$Nombre,
    [switch]$Agentes,
    [switch]$Reglas,
    [switch]$SinPreguntas,
    [string]$ClaudeDir
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'comun.ps1')
trap { Stop-WithMessage $_ }

$kit = Split-Path -Parent $PSScriptRoot
$source = Join-Path $kit 'plugin'
if (-not (Test-Path -LiteralPath (Join-Path $source '.claude-plugin\marketplace.json'))) {
    throw "No encuentro la carpeta plugin del kit en $kit. Descomprime el zip entero y ejecuta el script desde ahí."
}

$claude = Resolve-ClaudeDir $ClaudeDir
$dest = Join-Path $claude $MarketplaceName
$settingsPath = Join-Path $claude 'settings.json'
$agentsDir = Join-Path $claude 'agents'
$claudeMdPath = Join-Path $claude 'CLAUDE.md'

Write-Host ''
Write-Host 'Instalador de agent-team' -ForegroundColor Cyan
Write-Host "Carpeta de Claude: $claude"
Write-Host ''

# Read settings.json first: if it is broken, stop before copying anything.
$settings = Read-JsonObject $settingsPath

# A marketplace agent-team-kit that Claude Code already has from another source
# (GitHub) is not ours to overwrite: stop before anything is written.
try {
    $knownOwner = Get-MarketplaceSource (Read-JsonObject (Join-Path $claude 'plugins\known_marketplaces.json')) $dest
} catch {
    $knownOwner = [PSCustomObject]@{ State = 'none'; Description = '' }
}
if ($knownOwner.State -eq 'other') { throw (Get-OtherSourceMessage $knownOwner.Description) }

# An update keeps the name given last time unless a new one is asked for.
$recordPath = Join-Path $dest 'instalacion.json'
$previousName = ''
$recordedRulesHash = $null
if (Test-Path -LiteralPath $recordPath) {
    $previousRecord = Read-JsonObject $recordPath
    $previousName = "$(Get-Child $previousRecord 'nombre')".Trim()
    $recordedRulesHash = Get-Child $previousRecord 'reglasSha256'
}
$kitVersion = "$(Get-Child (Read-JsonObject (Join-Path $source 'agent-team\.claude-plugin\plugin.json')) 'version')"
Write-Host "Versión del kit: $kitVersion"
Write-Host ''

# The rules text is read now, with the other checks, so that a broken kit stops
# the script before anything is written.
$rulesLines = $null
if ($Reglas -or -not $SinPreguntas) { $rulesLines = Get-RulesLines $kit }
$overrideRules = $false

if (-not $SinPreguntas) {
    if (-not $PSBoundParameters.ContainsKey('Nombre')) {
        Write-Host 'El panel lleva un título en letras de píxeles. Con un nombre sale «<NOMBRE> TEAM»;'
        Write-Host 'sin nombre, «AGENT TEAM».'
        if ($previousName) {
            $answer = Read-Host "Nombre del equipo (ahora «$previousName»; Enter lo deja igual, un guion - lo quita)"
            $answer = "$answer".Trim()
            if (-not $answer) { $Nombre = $previousName } elseif ($answer -eq '-') { $Nombre = '' } else { $Nombre = $answer }
        } else {
            $Nombre = Read-Host 'Nombre del equipo (Enter para dejarlo sin nombre)'
        }
    }
    if (-not $Reglas) {
        $current = Get-ClaudeMdRules $claudeMdPath
        Write-Host ''
        if ($current.State -eq 'malformed') {
            # Nothing to ask: the step below says why CLAUDE.md is left alone.
            $Reglas = $true
        } elseif ($current.State -eq 'block') {
            $owner = Get-RulesOwnership $current.Inner ($rulesLines -join "`n") $recordedRulesHash
            if ($owner -eq 'current') {
                $Reglas = $true
            } elseif ($owner -eq 'older') {
                $Reglas = Ask-YesNo 'Tu CLAUDE.md ya tiene las reglas del equipo. ¿Las pongo al día con las de esta versión?' $true
            } else {
                $Reglas = Ask-YesNo 'Has cambiado las reglas del equipo de tu CLAUDE.md. ¿Las sustituyo por las de esta versión?' $false
                $overrideRules = [bool]$Reglas
            }
        } elseif ($current.Legacy) {
            $Reglas = Ask-YesNo "Tu CLAUDE.md ya tiene unas reglas del equipo sin las marcas del kit («$($current.Legacy.Heading)», línea $($current.Legacy.Line)), seguramente de una versión anterior. Si añado las nuevas tendrás las dos. Quita esa sección y vuelve a ejecutar el instalador, o contesta s para añadirlas igualmente." $false
            $overrideRules = [bool]$Reglas
        } else {
            $Reglas = Ask-YesNo '¿Añado las reglas de reparto a tu CLAUDE.md para que Claude trabaje con el equipo?' $true
        }
    }
}
if ($SinPreguntas -and -not $PSBoundParameters.ContainsKey('Nombre')) { $Nombre = $previousName }
$Nombre = "$Nombre".Trim()

$backups = $null
# The folder for this run's copies, made the first time something needs one.
function Get-RunBackups {
    if (-not $script:backups) { $script:backups = New-BackupDir $claude }
    return $script:backups
}

# 1. The plugin, as a local marketplace folder. A reinstall replaces the
#    plugin but keeps the record of the agents installed earlier.
$installedAgents = @()
if (Test-Path -LiteralPath $recordPath) {
    $old = Read-JsonObject $recordPath
    $oldAgents = Get-Child $old 'agentes'
    if ($oldAgents) { $installedAgents = @($oldAgents) }
    Write-Host 'Ya estaba instalado: lo actualizo.'
}
New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($item in @('.claude-plugin', 'agent-team')) {
    $target = Join-Path $dest $item
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
    Copy-Item -LiteralPath (Join-Path $source $item) -Destination $target -Recurse
}

$manifestPath = Join-Path $dest 'agent-team\.claude-plugin\plugin.json'
$manifest = Read-JsonObject $manifestPath
$manifest.userConfig.teamName.default = $Nombre
Write-JsonObject $manifestPath $manifest

# 2. The agents now come inside the plugin (agent-team:explorer...). The
#    copies an earlier kit put in agents/ are retired when nobody changed
#    them, a copy kept first; a changed one stays, and so does its record,
#    so the uninstaller still knows it.
if ($Agentes) { Write-Host '  -Agentes ya no hace falta: el panel trae sus cuatro agentes.' }
$keptAgents = @()
$teamFiles = @('explorer.md', 'implementer.md', 'tester.md', 'reviewer.md')
foreach ($agent in @($installedAgents)) {
    # Only an entry the kit could have written: one of its four files with a hash. Anything else is dropped.
    if (-not ($agent -is [PSCustomObject])) { continue }
    $file = Get-Child $agent 'nombre'
    $hash = Get-Child $agent 'sha256'
    if (-not ($file -is [string]) -or $teamFiles -cnotcontains $file -or -not ($hash -is [string])) { continue }
    $path = Join-Path $agentsDir $file
    $base = [IO.Path]::GetFileNameWithoutExtension($file)
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
    if ((Get-FileHashText $path) -eq $agent.sha256) {
        $copies = Join-Path (Get-RunBackups) 'agents'
        New-Item -ItemType Directory -Force -Path $copies | Out-Null
        Copy-Item -LiteralPath $path -Destination (Join-Path $copies $agent.nombre)
        Remove-Item -LiteralPath $path -Force
        Write-Host "  agente $($base): retirado de agents\, ahora viene en el panel como agent-team:$base"
    } else {
        $keptAgents += $agent
        Write-Host "  agente $($base): lo cambiaste, así que lo dejo; el panel trae agent-team:$base, y Claude verá los dos" -ForegroundColor Yellow
    }
}
$installedAgents = @($keptAgents)
# Agents of the same name the kit never installed are the person's own: left alone, but said.
foreach ($name in @('explorer', 'implementer', 'tester', 'reviewer')) {
    $own = Join-Path $agentsDir "$name.md"
    if ((Test-Path -LiteralPath $own) -and -not ($installedAgents | Where-Object { $_.nombre -eq "$name.md" })) {
        Write-Host "  agents\$name.md es tuyo: no lo toco. Claude verá $name y agent-team:$name." -ForegroundColor Yellow
    }
}

# 3. settings.json: the marketplace and the switch that turns the plugin on.
if (Test-Path -LiteralPath $settingsPath) {
    Copy-Item -LiteralPath $settingsPath -Destination (Join-Path (Get-RunBackups) 'settings.json')
}
$markets = Get-Child $settings 'extraKnownMarketplaces'
if (-not (Test-JsonObject $markets)) { $markets = New-Object PSObject; Set-Child $settings 'extraKnownMarketplaces' $markets }
Set-Child $markets $MarketplaceName ([PSCustomObject]@{
    source = [PSCustomObject]@{ source = 'directory'; path = ($dest -replace '\\', '/') }
})
$enabled = Get-Child $settings 'enabledPlugins'
if (-not (Test-JsonObject $enabled)) { $enabled = New-Object PSObject; Set-Child $settings 'enabledPlugins' $enabled }
Set-Child $enabled $PluginKey $true
# The team name also lives here when `claude plugin configure` wrote it, and
# there it wins over the plugin's default: keep it in step with the chosen name.
$configs = Get-Child $settings 'pluginConfigs'
$pluginConfig = if (Test-JsonObject $configs) { Get-Child $configs $PluginKey } else { $null }
if (Test-JsonObject $pluginConfig) {
    $options = Get-Child $pluginConfig 'options'
    if ($Nombre) {
        if (-not (Test-JsonObject $options)) { $options = New-Object PSObject; Set-Child $pluginConfig 'options' $options }
        Set-Child $options 'teamName' $Nombre
    } elseif (Test-JsonObject $options) {
        [void](Remove-Child $options 'teamName')
        if (Test-EmptyObject $options) { [void](Remove-Child $pluginConfig 'options') }
    }
    if (Test-EmptyObject $pluginConfig) {
        [void](Remove-Child $configs $PluginKey)
        if (Test-EmptyObject $configs) { [void](Remove-Child $settings 'pluginConfigs') }
    }
}
Write-JsonObject $settingsPath $settings

$others = @($enabled.PSObject.Properties | Where-Object { $_.Name -like 'agent-team@*' -and $_.Name -cne $PluginKey -and $_.Value -eq $true })

# 3b. The team rules in CLAUDE.md, only when asked for.
$rulesResult = $null
if ($Reglas) {
    $rulesResult = Set-RulesBlock $rulesLines $claude { Get-RunBackups } $recordedRulesHash $overrideRules
}
# What the record keeps: whether the block is there, and the hash of the text
# the kit last wrote (the old one stays while the person's own block stays).
$rulesNow = Get-ClaudeMdRules $claudeMdPath
$rulesPresent = ($rulesNow.State -eq 'block')
$rulesHash = $null
if ($rulesPresent) {
    $rulesHash = if ($rulesLines -and $rulesNow.Inner -ceq ($rulesLines -join "`n")) { Get-TextSha256 $rulesNow.Inner } else { $recordedRulesHash }
}

[PSCustomObject]@{
    kit = $kitVersion
    instaladoEl = (Get-Date).ToString('s')
    nombre = $Nombre
    agentes = @($installedAgents)
    reglas = $rulesPresent
    reglasSha256 = $rulesHash
    copias = $backups
} | ForEach-Object { Write-JsonObject $recordPath $_ }

# 4. Claude Code's own records, through its CLI when it is there.
$sync = Sync-ClaudePlugin $claude $Nombre $kitVersion

$title = if ($Nombre) { "$Nombre team" } else { 'Agent team' }
Write-Host ''
Write-Host "Listo. Instalado en $dest" -ForegroundColor Green
if ($rulesResult) {
    $color = if (@('intacto', 'cambiado', 'legado') -contains $rulesResult.Status) { 'Yellow' } else { $null }
    if ($color) { Write-Host "  $($rulesResult.Message)" -ForegroundColor $color } else { Write-Host "  $($rulesResult.Message)" }
}
if ($backups) { Write-Host "Copias de tus ficheros anteriores: $backups" }
if ($others.Count -gt 0) {
    Write-Host ''
    Write-Host "Ojo: también tienes activo $($others[0].Name). Verás dos paneles; desactiva uno en settings.json." -ForegroundColor Yellow
}
Write-Host ''
switch ($sync.Result) {
    'ok' { Write-Host "Claude Code ya lo tiene registrado (agent-team $kitVersion)." -ForegroundColor Green }
    'sin-cli' { Write-Host $sync.Message }
    default { Write-Host $sync.Message -ForegroundColor Yellow }
}
Write-Host 'Siguiente paso: abre una sesión nueva en Claude Code (o escribe /reload-plugins en una abierta).'
Write-Host "Debería salir el panel «$title» a un lado. /agent-team lo oculta o lo vuelve a mostrar."
