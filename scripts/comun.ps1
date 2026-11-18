# Helpers shared by instalar.ps1 and desinstalar.ps1. Works on Windows
# PowerShell 5.1 and on PowerShell 7.

$script:MarketplaceName = 'agent-team-kit'
$script:PluginKey = 'agent-team@agent-team-kit'
$script:Utf8NoBom = New-Object System.Text.UTF8Encoding $false
$script:RulesStart = '<!-- agent-team:reglas:inicio -->'
$script:RulesEnd = '<!-- agent-team:reglas:fin -->'
# A marker counts only when it is alone on its line.
$script:RulesStartPattern = '(?m)^[ \t]*' + [regex]::Escape($script:RulesStart) + '[ \t]*(?=\r?$)'
$script:RulesEndPattern = '(?m)^[ \t]*' + [regex]::Escape($script:RulesEnd) + '[ \t]*(?=\r?$)'

# A leading ~ means the user's home folder, as in kit.py.
function Expand-Home([string]$Path) {
    if ($Path -eq '~') { return $HOME }
    if ($Path -match '^~[\\/]') { return Join-Path $HOME $Path.Substring(2) }
    return $Path
}

function Resolve-ClaudeDir([string]$ClaudeDir) {
    if ($ClaudeDir) { return [IO.Path]::GetFullPath((Expand-Home $ClaudeDir)) }
    if ($env:CLAUDE_CONFIG_DIR) { return [IO.Path]::GetFullPath((Expand-Home $env:CLAUDE_CONFIG_DIR)) }
    return (Join-Path $HOME '.claude')
}

# Finds two keys of one object that differ only in case (for example
# HTTP_PROXY and http_proxy), which Windows PowerShell 5.1 cannot read even
# though the JSON is valid. Answers the pair as text, or $null.
function Find-CaseOnlyDuplicateKeys([string]$Text) {
    $stack = New-Object System.Collections.ArrayList
    $n = $Text.Length
    $i = 0
    while ($i -lt $n) {
        $c = $Text[$i]
        if ($c -eq '"') {
            $j = $i + 1
            while ($j -lt $n -and $Text[$j] -ne '"') {
                if ($Text[$j] -eq '\') { $j++ }
                $j++
            }
            $end = [Math]::Min($j, $n)
            $token = $Text.Substring($i + 1, $end - $i - 1)
            if ($stack.Count -gt 0) {
                $top = $stack[$stack.Count - 1]
                if ($top.Kind -eq 'o' -and $top.ExpectKey) {
                    foreach ($other in $top.Keys) {
                        if ($other -ieq $token -and $other -cne $token) { return "«$other» y «$token»" }
                    }
                    [void]$top.Keys.Add($token)
                    $top.ExpectKey = $false
                }
            }
            $i = $j + 1
            continue
        }
        if ($c -eq '{') {
            [void]$stack.Add([PSCustomObject]@{ Kind = 'o'; Keys = (New-Object System.Collections.ArrayList); ExpectKey = $true })
        } elseif ($c -eq '[') {
            [void]$stack.Add([PSCustomObject]@{ Kind = 'a'; Keys = $null; ExpectKey = $false })
        } elseif (($c -eq '}' -or $c -eq ']') -and $stack.Count -gt 0) {
            $stack.RemoveAt($stack.Count - 1)
        } elseif ($c -eq ',' -and $stack.Count -gt 0 -and $stack[$stack.Count - 1].Kind -eq 'o') {
            $stack[$stack.Count - 1].ExpectKey = $true
        }
        $i++
    }
    return $null
}

# Is the text JSON at all? Asked of a lenient .NET Framework parser, for when
# ConvertFrom-Json refuses it and the reason has to be told apart.
function Test-JsonSyntax([string]$Text) {
    try {
        Add-Type -AssemblyName System.Web.Extensions -ErrorAction Stop
        $serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
        $serializer.MaxJsonLength = [int]::MaxValue
        $serializer.RecursionLimit = 1000
        $null = $serializer.DeserializeObject($Text)
        return $true
    } catch {
        return $false
    }
}

# Reads a JSON object file. A missing or empty file gives an empty object;
# a file that is not valid JSON, or whose top level is not an object, stops
# the script before anything is touched.
function Read-JsonObject([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return New-Object PSObject }
    $text = [IO.File]::ReadAllText($Path)
    if (-not $text.Trim()) { return New-Object PSObject }
    $notObject = "$Path no contiene un objeto JSON. No lo toco."
    try {
        $value = ConvertFrom-Json -InputObject $text
    } catch {
        $detail = $_.Exception.Message
        if (-not (Test-JsonSyntax $text)) {
            throw "No se puede leer $Path porque no es JSON válido. Arréglalo (o renómbralo) y vuelve a ejecutar el script. Detalle: $detail"
        }
        if ($text.TrimStart()[0] -ne '{') { throw $notObject }
        $pair = Find-CaseOnlyDuplicateKeys $text
        $python = 'python scripts\kit.py instalar' + ' (o desinstalar)'
        if ($pair) {
            throw ("No se puede leer $Path con Windows PowerShell: tiene dos claves que solo se diferencian en mayúsculas y minúsculas ($pair). " +
                "El fichero es JSON válido; es un límite de Windows PowerShell, que no las distingue. No he cambiado nada. " +
                "Para seguir, ejecuta el instalador con Python si lo tienes ($python), " +
                "o cambia una de esas claves un momento y devuélvela a su sitio después.")
        }
        throw ("No se puede leer $Path con Windows PowerShell: el fichero es JSON válido, pero PowerShell no sabe leerlo. " +
            "No he cambiado nada. Si tienes Python, ejecuta $python, que sí lo lee.")
    }
    if (-not (Test-JsonObject $value)) { throw $notObject }
    return $value
}

# Re-indents ConvertTo-Json output with two spaces and undoes the <-style
# escapes Windows PowerShell 5.1 adds for < > & '. String contents are copied
# as they are, so the data does not change.
function Format-Json([string]$Json) {
    $out = New-Object System.Text.StringBuilder
    $indent = 0
    $inString = $false
    $i = 0
    $n = $Json.Length
    while ($i -lt $n) {
        $c = $Json[$i]
        if ($inString) {
            if ($c -eq '\') {
                $next = $Json[$i + 1]
                if ($next -eq 'u' -and $i + 5 -lt $n) {
                    $hex = $Json.Substring($i + 2, 4).ToLowerInvariant()
                    $plain = @{ '003c' = '<'; '003e' = '>'; '0026' = '&'; '0027' = "'" }[$hex]
                    if ($plain) {
                        [void]$out.Append($plain)
                        $i += 6
                        continue
                    }
                }
                [void]$out.Append($c).Append($next)
                $i += 2
                continue
            }
            if ($c -eq '"') { $inString = $false }
            [void]$out.Append($c)
            $i++
            continue
        }
        switch -regex ($c) {
            '"' { $inString = $true; [void]$out.Append($c) }
            '[\{\[]' {
                $close = if ($c -eq '{') { '}' } else { ']' }
                $j = $i + 1
                while ($j -lt $n -and [char]::IsWhiteSpace($Json[$j])) { $j++ }
                if ($j -lt $n -and $Json[$j] -eq $close) {
                    [void]$out.Append($c).Append($close)
                    $i = $j
                } else {
                    $indent++
                    [void]$out.Append($c).Append("`n").Append('  ' * $indent)
                }
            }
            '[\}\]]' {
                $indent--
                [void]$out.Append("`n").Append('  ' * $indent).Append($c)
            }
            ',' { [void]$out.Append(",`n").Append('  ' * $indent) }
            ':' { [void]$out.Append(': ') }
            '\s' { }
            default { [void]$out.Append($c) }
        }
        $i++
    }
    return $out.ToString()
}

function Write-JsonObject([string]$Path, $Value) {
    $json = Format-Json ($Value | ConvertTo-Json -Depth 64)
    [IO.File]::WriteAllText($Path, $json + "`n", $script:Utf8NoBom)
}

# Is it a JSON object (what ConvertFrom-Json gives for {...})? `-is [PSCustomObject]`
# is no test: in PowerShell it is true for strings and arrays too.
function Test-JsonObject($Value) {
    return ($null -ne $Value) -and ($Value.PSObject.TypeNames[0] -eq 'System.Management.Automation.PSCustomObject')
}

function Get-Child($Object, [string]$Name) {
    $prop = $Object.PSObject.Properties | Where-Object { $_.Name -ceq $Name } | Select-Object -First 1
    if ($prop) { return $prop.Value }
    return $null
}

function Set-Child($Object, [string]$Name, $Value) {
    $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value -Force
}

# Removes $Name from $Object. Returns $true when it was there.
function Remove-Child($Object, [string]$Name) {
    if (-not (Test-JsonObject $Object)) { return $false }
    $prop = $Object.PSObject.Properties | Where-Object { $_.Name -ceq $Name } | Select-Object -First 1
    if (-not $prop) { return $false }
    $Object.PSObject.Properties.Remove($prop.Name)
    return $true
}

function Test-EmptyObject($Object) {
    return (Test-JsonObject $Object) -and (@($Object.PSObject.Properties).Count -eq 0)
}

function Get-FileHashText([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

# A new, empty folder for this run's copies. Two runs in the same second get
# different folders, so one never reuses (or deletes) another's copies.
function New-BackupDir([string]$ClaudeDir) {
    $root = Join-Path $ClaudeDir 'agent-team-kit-copias'
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $dir = Join-Path $root $stamp
    $n = 1
    while (Test-Path -LiteralPath $dir) {
        $n++
        $dir = Join-Path $root "$stamp-$n"
    }
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    return $dir
}

# Stops the script with a plain message instead of PowerShell's error record.
function Stop-WithMessage($ErrorRecord) {
    Write-Host ''
    Write-Host "Error: $($ErrorRecord.Exception.Message)" -ForegroundColor Red
    exit 1
}

function Get-TextSha256([string]$Text) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha.ComputeHash($script:Utf8NoBom.GetBytes($Text))) -replace '-', '').ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

# ---------------------------------------------------------------- team rules in CLAUDE.md

# The rules the kit ships: the lines of the fenced block in extras\reglas-claude-md.md.
function Get-RulesLines([string]$Kit) {
    $path = Join-Path $Kit 'extras\reglas-claude-md.md'
    if (-not (Test-Path -LiteralPath $path)) { throw "No encuentro $path." }
    $all = [IO.File]::ReadAllText($path, $script:Utf8NoBom) -split '\r?\n'
    $first = -1
    $last = -1
    for ($i = 0; $i -lt $all.Count; $i++) {
        if ($first -lt 0) {
            if ($all[$i].TrimEnd() -ceq '```markdown') { $first = $i + 1 }
        } elseif ($all[$i].TrimEnd() -ceq '```') {
            $last = $i - 1
            break
        }
    }
    if ($first -lt 0 -or $last -lt $first) { throw "No encuentro el bloque de reglas en $path." }
    return @($all[$first..$last])
}

# The spans of the text inside fenced code blocks (``` or ~~~), fence lines
# included, as @(start, end) pairs. A fence that never closes is not a fence
# (otherwise everything written after it would count as inside it).
function Get-FencedRanges([string]$Text) {
    $ranges = New-Object System.Collections.ArrayList
    $pos = 0
    $open = $null
    $openStart = 0
    while ($pos -lt $Text.Length) {
        $nl = $Text.IndexOf("`n", $pos)
        $lineEnd = if ($nl -lt 0) { $Text.Length } else { $nl + 1 }
        $line = $Text.Substring($pos, $lineEnd - $pos).TrimEnd("`r", "`n")
        if ($null -eq $open) {
            if ($line -match '^ {0,3}(`{3,}|~{3,})') {
                $open = $Matches[1]
                $openStart = $pos
            }
        } elseif ($line -match '^ {0,3}(`{3,}|~{3,})[ \t]*$') {
            $fence = $Matches[1]
            if ($fence[0] -eq $open[0] -and $fence.Length -ge $open.Length) {
                [void]$ranges.Add(@($openStart, $lineEnd))
                $open = $null
            }
        }
        $pos = $lineEnd
    }
    return , $ranges
}

function Test-InRanges($Ranges, [int]$Index) {
    foreach ($range in $Ranges) {
        if ($Index -ge $range[0] -and $Index -lt $range[1]) { return $true }
    }
    return $false
}

# Reads CLAUDE.md and finds the managed block (marker lines inside code fences
# do not count). State: 'none' (no markers or no file), 'block' (one start
# marker followed by one end marker; Start/End are the span, markers included,
# and Inner is the text between the marker lines, with LF line ends) or
# 'malformed' (anything else; Reason says why). With no markers, Legacy is the
# first heading (Heading, Line) of old unmarked team rules, if there is one.
function Get-ClaudeMdRules([string]$Path) {
    $info = [PSCustomObject]@{ Exists = $false; Bom = $false; Text = ''; State = 'none'; Reason = ''; Start = 0; End = 0; Inner = ''; Legacy = $null }
    if (-not (Test-Path -LiteralPath $Path)) { return $info }
    $info.Exists = $true
    $bytes = [IO.File]::ReadAllBytes($Path)
    $offset = 0
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $info.Bom = $true
        $offset = 3
    }
    try {
        $info.Text = (New-Object System.Text.UTF8Encoding($false, $true)).GetString($bytes, $offset, $bytes.Length - $offset)
    } catch {
        $info.State = 'malformed'
        $info.Reason = 'no está guardado en UTF-8'
        return $info
    }
    $text = $info.Text
    $ranges = Get-FencedRanges $text
    $starts = @([regex]::Matches($text, $script:RulesStartPattern) | Where-Object { -not (Test-InRanges $ranges $_.Index) })
    $ends = @([regex]::Matches($text, $script:RulesEndPattern) | Where-Object { -not (Test-InRanges $ranges $_.Index) })
    if ($starts.Count -eq 0 -and $ends.Count -eq 0) {
        $pos = 0
        $number = 0
        while ($pos -lt $text.Length) {
            $nl = $text.IndexOf("`n", $pos)
            $lineEnd = if ($nl -lt 0) { $text.Length } else { $nl + 1 }
            $number++
            $line = $text.Substring($pos, $lineEnd - $pos).TrimEnd("`r", "`n")
            if (-not (Test-InRanges $ranges $pos)) {
                $heading = $null
                if ($line -cmatch '^## (Delegation to agents|Agent team)[ \t]*$') { $heading = "## $($Matches[1])" }
                elseif ($line.Contains('I have a team of agents in `~/.claude/agents/`')) { $heading = 'I have a team of agents in `~/.claude/agents/`' }
                if ($heading) {
                    $info.Legacy = [PSCustomObject]@{ Heading = $heading; Line = $number }
                    break
                }
            }
            $pos = $lineEnd
        }
        return $info
    }
    $info.State = 'malformed'
    if ($starts.Count -eq 1 -and $ends.Count -eq 1) {
        if ($starts[0].Index + $starts[0].Length -le $ends[0].Index) {
            $info.State = 'block'
            $info.Start = $starts[0].Index
            $info.End = $ends[0].Index + $ends[0].Length
            $innerStart = $starts[0].Index + $starts[0].Length
            if ($text.Substring($innerStart).StartsWith("`r`n")) { $innerStart += 2 } elseif ($innerStart -lt $text.Length -and $text[$innerStart] -eq "`n") { $innerStart++ }
            $inner = if ($ends[0].Index -gt $innerStart) { $text.Substring($innerStart, $ends[0].Index - $innerStart) } else { '' }
            $inner = $inner.Replace("`r`n", "`n")
            if ($inner.EndsWith("`n")) { $inner = $inner.Substring(0, $inner.Length - 1) }
            $info.Inner = $inner
        } else {
            $info.Reason = 'la marca de fin está antes que la de inicio'
        }
    } elseif ($starts.Count -eq 1 -and $ends.Count -eq 0) {
        $info.Reason = 'tiene la marca de inicio pero no la de fin'
    } elseif ($starts.Count -eq 0 -and $ends.Count -eq 1) {
        $info.Reason = 'tiene la marca de fin pero no la de inicio'
    } else {
        $info.Reason = "tiene marcas repetidas ($($starts.Count) de inicio y $($ends.Count) de fin)"
    }
    return $info
}

# Whose is the block? 'current' (the text of this kit version), 'older' (what
# the kit wrote last time, by the hash it recorded) or 'changed' (anything else).
function Get-RulesOwnership([string]$Inner, [string]$CurrentText, $RecordedHash) {
    if ($Inner -ceq $CurrentText) { return 'current' }
    if ($RecordedHash -and (Get-TextSha256 $Inner) -ieq "$RecordedHash") { return 'older' }
    return 'changed'
}

function Write-ClaudeMd([string]$Path, [string]$Text, [bool]$Bom) {
    $bytes = $script:Utf8NoBom.GetBytes($Text)
    if ($Bom) { $bytes = [byte[]]((0xEF, 0xBB, 0xBF) + $bytes) }
    [IO.File]::WriteAllBytes($Path, $bytes)
}

# Puts the kit's rules block into CLAUDE.md: creates the file, replaces the
# kit's own block or appends one. Rules that are the person's (a block they
# changed, or old unmarked rules) are only touched with $Override. $GetBackupDir
# is a script block that gives the folder for the copy of the original. Answers
# an object with Status ('creado', 'añadido', 'actualizado', 'al-dia',
# 'intacto', 'cambiado' or 'legado') and Message.
function Set-RulesBlock([string[]]$RulesLines, [string]$ClaudeDir, [scriptblock]$GetBackupDir, $RecordedHash, [bool]$Override) {
    $path = Join-Path $ClaudeDir 'CLAUDE.md'
    $file = Get-ClaudeMdRules $path
    if ($file.State -eq 'malformed') {
        return [PSCustomObject]@{ Status = 'intacto'; Message = "No he tocado tu CLAUDE.md: $($file.Reason)." }
    }
    $text = $file.Text
    $eol = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
    $block = (@($script:RulesStart) + $RulesLines + @($script:RulesEnd)) -join $eol
    if (-not $file.Exists) {
        $new = $block + $eol
        $status = 'creado'
        $message = 'CLAUDE.md creado con las reglas del equipo.'
    } elseif ($file.State -eq 'block') {
        $owner = Get-RulesOwnership $file.Inner ($RulesLines -join "`n") $RecordedHash
        if ($owner -eq 'changed' -and -not $Override) {
            return [PSCustomObject]@{ Status = 'cambiado'; Message = 'No he tocado las reglas de tu CLAUDE.md porque las has cambiado desde que se instalaron. Contesta s cuando el instalador te lo pregunte, o borra ese bloque y vuelve a ejecutarlo.' }
        }
        $new = $text.Substring(0, $file.Start) + $block + $text.Substring($file.End)
        $status = 'actualizado'
        $message = 'Reglas del equipo de tu CLAUDE.md puestas al día.'
    } else {
        if ($file.Legacy -and -not $Override) {
            return [PSCustomObject]@{ Status = 'legado'; Message = "No he tocado tu CLAUDE.md: ya tiene unas reglas del equipo sin las marcas del kit («$($file.Legacy.Heading)», línea $($file.Legacy.Line)), seguramente de una versión anterior. Si añado las nuevas tendrás las dos. Quita esa sección y vuelve a ejecutar el instalador." }
        }
        $new = $text
        if ($text.Length -gt 0) {
            if (-not $text.EndsWith("`n")) { $new += $eol }
            $new += $eol
        }
        $new += $block + $eol
        $status = if ($text.Length -gt 0) { 'añadido' } else { 'creado' }
        $message = if ($text.Length -gt 0) { 'Reglas del equipo añadidas al final de tu CLAUDE.md.' } else { 'Reglas del equipo escritas en tu CLAUDE.md.' }
    }
    if ($file.Exists -and $new -ceq $text) {
        return [PSCustomObject]@{ Status = 'al-dia'; Message = 'Las reglas ya estaban al día.' }
    }
    if ($file.Exists) {
        Copy-Item -LiteralPath $path -Destination (Join-Path (& $GetBackupDir) 'CLAUDE.md')
    }
    Write-ClaudeMd $path $new $file.Bom
    return [PSCustomObject]@{ Status = $status; Message = $message }
}

# The text of CLAUDE.md without the managed block (its lines) and the one
# blank line that separated it from what came before; every other character
# stays as it is.
function Get-TextWithoutRules([string]$Text, $Info) {
    $end = $Info.End
    if ($Text.Substring($end).StartsWith("`r`n")) { $end += 2 } elseif ($end -lt $Text.Length -and $Text[$end] -eq "`n") { $end += 1 }
    $before = $Text.Substring(0, $Info.Start)
    if ($before.EndsWith("`n")) {
        $cut = $before.Length - 1
        if ($cut -gt 0 -and $before[$cut - 1] -eq "`r") { $cut-- }
        $lineStart = if ($cut -eq 0) { 0 } else { $before.LastIndexOf("`n", $cut - 1) + 1 }
        if ($before.Substring($lineStart, $cut - $lineStart) -match '^[ \t]*$') { $before = $before.Substring(0, $lineStart) }
    }
    return $before + $Text.Substring($end)
}

# Takes the kit's own block out of CLAUDE.md (the caller has already copied the
# file); one the person changed stays. Deletes the file only when nothing at
# all is left. $CurrentText is the rules text of this kit version (or $null).
# Answers an object with Status ('quitado', 'borrado', 'sin-reglas', 'cambiado'
# or 'intacto') and Message.
function Remove-RulesBlock([string]$ClaudeDir, $CurrentText, $RecordedHash) {
    $path = Join-Path $ClaudeDir 'CLAUDE.md'
    $file = Get-ClaudeMdRules $path
    if ($file.State -eq 'malformed') {
        return [PSCustomObject]@{ Status = 'intacto'; Message = "No he tocado tu CLAUDE.md: $($file.Reason)." }
    }
    if ($file.State -ne 'block') {
        return [PSCustomObject]@{ Status = 'sin-reglas'; Message = '' }
    }
    $owner = if ($null -ne $CurrentText) { Get-RulesOwnership $file.Inner $CurrentText $RecordedHash } elseif ($RecordedHash -and (Get-TextSha256 $file.Inner) -ieq "$RecordedHash") { 'older' } else { 'changed' }
    if ($owner -eq 'changed') {
        return [PSCustomObject]@{ Status = 'cambiado'; Message = 'No he quitado las reglas de tu CLAUDE.md porque las has cambiado después de instalarlas.' }
    }
    $new = Get-TextWithoutRules $file.Text $file
    if ($new.Length -eq 0) {
        Remove-Item -LiteralPath $path -Force
        return [PSCustomObject]@{ Status = 'borrado'; Message = 'borrado CLAUDE.md (solo tenía las reglas del equipo)' }
    }
    Write-ClaudeMd $path $new $file.Bom
    return [PSCustomObject]@{ Status = 'quitado'; Message = 'quitadas las reglas del equipo de CLAUDE.md' }
}

# ---------------------------------------------------------------- Claude Code's CLI

# The claude command as PowerShell finds it ('' when there is none).
function Get-ClaudeLauncher {
    $found = Get-Command claude -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found -and $found.Source) { return $found.Source }
    return ''
}

# Runs `claude` with a closed stdin (so it never waits on the console), unless
# text for stdin is given. Never throws. Answers Code (exit code) and Output
# (stdout; stderr is dropped).
#
# A .cmd or .bat launcher (what npm installs) is run through cmd.exe with every
# argument quoted, so a path with an & or a ^ in it stays one argument.
#
# Text for stdin does not go through the PowerShell pipeline: Windows
# PowerShell 5.1 starts anything it pipes in UTF-8 with a byte-order mark, and
# a program that parses the text as JSON can choke on it (the ASCII default
# turns "María" into "Mar?a"). The text is written as UTF-8 without BOM to a
# temporary file and cmd.exe feeds it to the program.
function Invoke-Claude([string[]]$Arguments, [string]$Stdin) {
    $ErrorActionPreference = 'Continue'
    $tmp = $null
    try {
        $launcher = Get-ClaudeLauncher
        $extension = [IO.Path]::GetExtension($launcher).ToLowerInvariant()
        $withInput = $PSBoundParameters.ContainsKey('Stdin')
        if ($withInput -or $extension -eq '.cmd' -or $extension -eq '.bat') {
            $program = $launcher
            if ($extension -ne '.cmd' -and $extension -ne '.bat' -and $extension -ne '.exe') {
                # A .ps1 launcher: cmd.exe needs a program of its own. The .cmd next
                # to it, or the first program PATH offers, by full path (a shim that
                # uses %~dp0 directly would resolve the wrong folder through a bare name).
                $sibling = [IO.Path]::ChangeExtension($launcher, '.cmd')
                $application = Get-Command claude -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
                $program = if ($launcher -and (Test-Path -LiteralPath $sibling)) { $sibling } elseif ($application -and $application.Source) { $application.Source } else { 'claude' }
            }
            $source = 'NUL'
            if ($withInput) {
                $tmp = [IO.Path]::GetTempFileName()
                [IO.File]::WriteAllBytes($tmp, $script:Utf8NoBom.GetBytes($Stdin))
                $source = '"' + $tmp + '"'
            }
            $quoted = @($Arguments | ForEach-Object { '"' + $_ + '"' })
            $line = '"' + $program + '" ' + ($quoted -join ' ') + ' < ' + $source
            $out = & cmd.exe /d /s /c $line 2>$null
        } else {
            $out = @() | & claude @Arguments 2>$null
        }
        $code = $LASTEXITCODE
        return [PSCustomObject]@{ Code = $code; Output = (($out | Out-String)) }
    } catch {
        return [PSCustomObject]@{ Code = -1; Output = '' }
    } finally {
        if ($tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    }
}

# Is there a usable Claude Code CLI (version 2 or newer)? Kind is 'missing' (no
# claude command at all), 'old' (it fails, or is older than 2) or '' when Ok.
function Test-ClaudeCli {
    $ErrorActionPreference = 'Continue'
    if (-not (Get-ClaudeLauncher)) { return [PSCustomObject]@{ Ok = $false; Kind = 'missing' } }
    $run = Invoke-Claude @('--version')
    $major = 0
    if ($run.Code -eq 0 -and $run.Output -match '(\d+)\.\d+') { $major = [int]$Matches[1] }
    if ($major -lt 2) { return [PSCustomObject]@{ Ok = $false; Kind = 'old' } }
    return [PSCustomObject]@{ Ok = $true; Kind = '' }
}

# The plugin's entry in `claude plugin list --json`. Ok is $false when the list
# could not be read; Entry is $null when the plugin is not in it.
function Get-ClaudePluginEntry {
    $ErrorActionPreference = 'Continue'
    $run = Invoke-Claude @('plugin', 'list', '--json')
    if ($run.Code -ne 0) { return [PSCustomObject]@{ Ok = $false; Entry = $null } }
    $text = "$($run.Output)".Trim()
    if (-not $text) { return [PSCustomObject]@{ Ok = $true; Entry = $null } }
    try {
        # -InputObject keeps the list whole in Windows PowerShell 5.1, which does
        # not unroll it; @() makes it an array of entries.
        $items = @((ConvertFrom-Json -InputObject $text))
    } catch {
        return [PSCustomObject]@{ Ok = $false; Entry = $null }
    }
    $entry = $items | Where-Object { $_.id -ceq $script:PluginKey } | Select-Object -First 1
    return [PSCustomObject]@{ Ok = $true; Entry = $entry }
}

function Test-SamePath([string]$A, [string]$B) {
    try {
        return [IO.Path]::GetFullPath($A).TrimEnd('\', '/') -ieq [IO.Path]::GetFullPath($B).TrimEnd('\', '/')
    } catch {
        return $false
    }
}

# Whose is the marketplace agent-team-kit in Claude Code's known_marketplaces.json?
# State: 'none' (not there), 'ours' (a directory source that is $Dest, or one
# this cannot tell from it) or 'other' (another source, for example GitHub;
# Description says which).
function Get-MarketplaceSource($Known, [string]$Dest) {
    $entry = Get-Child $Known $script:MarketplaceName
    if (-not (Test-JsonObject $entry)) { return [PSCustomObject]@{ State = 'none'; Description = '' } }
    $source = Get-Child $entry 'source'
    $kind = if (Test-JsonObject $source) { "$(Get-Child $source 'source')" } else { '' }
    if ($kind -and $kind -ne 'directory') {
        $where = "$(Get-Child $source 'repo')$(Get-Child $source 'url')$(Get-Child $source 'path')"
        return [PSCustomObject]@{ State = 'other'; Description = ("$kind $where").Trim() }
    }
    if ($kind -eq 'directory') {
        $path = "$(Get-Child $source 'path')"
        if ($path -and -not (Test-SamePath $path $Dest)) {
            return [PSCustomObject]@{ State = 'other'; Description = "directory $path" }
        }
    }
    return [PSCustomObject]@{ State = 'ours'; Description = '' }
}

# Sets CLAUDE_CONFIG_DIR as the CLI must see it: only a folder other than the
# default is passed on (with it set, Claude Code also looks for its global
# config inside that folder) and an inherited one is dropped for the default.
function Set-ClaudeConfigDir([string]$ClaudeDir) {
    $isDefault = [IO.Path]::GetFullPath($ClaudeDir).TrimEnd('\') -ieq [IO.Path]::GetFullPath((Join-Path $HOME '.claude')).TrimEnd('\')
    if ($isDefault) {
        Remove-Item Env:CLAUDE_CONFIG_DIR -ErrorAction SilentlyContinue
    } else {
        $env:CLAUDE_CONFIG_DIR = $ClaudeDir
    }
}

function Restore-ClaudeConfigDir($Saved) {
    if ($null -ne $Saved) { $env:CLAUDE_CONFIG_DIR = $Saved } else { Remove-Item Env:CLAUDE_CONFIG_DIR -ErrorAction SilentlyContinue }
}

# Says what to do when Claude Code already has an agent-team-kit marketplace
# from another source (for example GitHub).
function Get-OtherSourceMessage([string]$Description) {
    return ("Ya tienes un marketplace agent-team-kit de otra fuente ($Description), así que no instalo encima para no pisarlo. " +
        'Quita esa instalación (`claude plugin uninstall ' + $script:PluginKey + '` y `claude plugin marketplace remove ' + $script:MarketplaceName + '`) y vuelve a ejecutar el instalador. ' +
        'Mira LEEME.md, «Instalar desde GitHub».')
}

# Is this settings.json entry a directory marketplace that points to $Dest?
function Test-DirectorySource($Entry, [string]$Dest) {
    if (-not (Test-JsonObject $Entry)) { return $false }
    $source = Get-Child $Entry 'source'
    if (-not (Test-JsonObject $source)) { return $false }
    $path = "$(Get-Child $source 'path')"
    return ("$(Get-Child $source 'source')" -eq 'directory') -and $path -and (Test-SamePath $path $Dest)
}

function New-SyncResult([string]$Result, [string]$Message) {
    return [PSCustomObject]@{ Result = $Result; Message = $Message }
}

# Brings Claude Code's own records in line through its CLI, when the CLI is
# there: a first install is registered at once and an update takes effect
# without waiting for Claude Code's plugin cache. Never throws. Result is 'ok',
# 'sin-cli' (no usable claude command), 'fallo' (not registered), 'version'
# (registered in another version, or off) or 'configure' (the team name was
# refused); Message says what to do. The CLI reports some failures with exit
# code 0, so the outcome is read back from `plugin list`.
function Sync-ClaudePlugin([string]$ClaudeDir, [string]$TeamName, [string]$KitVersion) {
    $ErrorActionPreference = 'Continue'
    Write-Host 'Registrando el plugin en Claude Code…'
    $cli = Test-ClaudeCli
    if ($cli.Kind -eq 'missing') {
        return New-SyncResult 'sin-cli' 'No encuentro el comando claude: Claude Code lo registrará al abrir una sesión nueva.'
    }
    if (-not $cli.Ok) {
        return New-SyncResult 'sin-cli' 'El comando claude es demasiado antiguo o no funciona (hace falta Claude Code 2 o más nuevo): Claude Code lo registrará al abrir una sesión nueva.'
    }
    $dest = Join-Path $ClaudeDir $script:MarketplaceName
    $savedDir = $env:CLAUDE_CONFIG_DIR
    try {
        Set-ClaudeConfigDir $ClaudeDir
        # The CLI knows a marketplace only once it is added (settings.json alone
        # is read by a session, not by the CLI); adding one it knows is a no-op.
        [void](Invoke-Claude @('plugin', 'marketplace', 'add', $dest))
        [void](Invoke-Claude @('plugin', 'marketplace', 'update', $script:MarketplaceName))
        $before = Get-ClaudePluginEntry
        $verb = if ($before.Entry) { 'update' } else { 'install' }
        [void](Invoke-Claude @('plugin', $verb, $script:PluginKey))
        $values = '{"teamName":' + (ConvertTo-Json -InputObject $TeamName -Compress) + '}'
        $configure = Invoke-Claude @('plugin', 'configure', $script:PluginKey, '--values-stdin') -Stdin $values
        $after = Get-ClaudePluginEntry
        if (-not $after.Entry) {
            return New-SyncResult 'fallo' 'No he podido registrarlo con el comando claude; Claude Code lo hará al abrir una sesión nueva.'
        }
        $update = 'Ejecuta `claude plugin update ' + $script:PluginKey + '` y abre una sesión nueva.'
        if ("$($after.Entry.version)" -cne $KitVersion) {
            return New-SyncResult 'version' "Claude Code lo tiene registrado en la versión $($after.Entry.version). $update"
        }
        if ($after.Entry.enabled -ne $true) {
            return New-SyncResult 'version' ('Claude Code lo tiene registrado pero desactivado. Ejecuta `claude plugin enable ' + $script:PluginKey + '` y abre una sesión nueva.')
        }
        if ($configure.Code -ne 0) {
            return New-SyncResult 'configure' ('El comando claude no ha aceptado el nombre del equipo. Para ponerlo, ejecuta `claude plugin configure ' + $script:PluginKey + '` y abre una sesión nueva.')
        }
        return New-SyncResult 'ok' ''
    } catch {
        return New-SyncResult 'fallo' 'No he podido registrarlo con el comando claude; Claude Code lo hará al abrir una sesión nueva.'
    } finally {
        Restore-ClaudeConfigDir $savedDir
    }
}

# Asks Claude Code's CLI to forget the plugin and its marketplace, when the
# CLI is there; the uninstaller then clears whatever is left by hand.
function Remove-ClaudePlugin([string]$ClaudeDir) {
    $ErrorActionPreference = 'Continue'
    $cli = Test-ClaudeCli
    if ($cli.Kind -eq 'old') {
        Write-Host 'El comando claude es demasiado antiguo o no funciona: no le pido que lo quite y lo hago a mano.'
    }
    if (-not $cli.Ok) { return }
    Write-Host 'Quitando el plugin de Claude Code…'
    $savedDir = $env:CLAUDE_CONFIG_DIR
    try {
        Set-ClaudeConfigDir $ClaudeDir
        [void](Invoke-Claude @('plugin', 'uninstall', $script:PluginKey))
        [void](Invoke-Claude @('plugin', 'marketplace', 'remove', $script:MarketplaceName))
    } catch {
        # the manual clean-up covers it
    } finally {
        Restore-ClaudeConfigDir $savedDir
    }
}

# Asks yes or no until it gets an answer. Enter gives $Default; so does the
# end of the input, so it never loops for ever.
function Ask-YesNo([string]$Question, [bool]$Default = $false) {
    $hint = if ($Default) { 'S/n' } else { 's/N' }
    while ($true) {
        $answer = "$(Read-Host "$Question ($hint)")".Trim()
        if (-not $answer) { return $Default }
        if ($answer -match '^(s|si|sí|y|yes)$') { return $true }
        if ($answer -match '^(n|no)$') { return $false }
        Write-Host 'Contesta s o n.'
    }
}
