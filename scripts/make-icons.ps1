Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot "..\public\icons"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-RoundedPath([int]$x, [int]$y, [int]$w, [int]$h, [int]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

$teal = [System.Drawing.Color]::FromArgb(45, 212, 191)
$ink = [System.Drawing.Color]::FromArgb(24, 24, 27)

foreach ($size in 16, 32, 48, 128) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

    $pad = [Math]::Max(1, [int]($size * 0.06))
    $r = [Math]::Max(1, [int]($size * 0.22))
    $path = New-RoundedPath $pad $pad ($size - 2 * $pad) ($size - 2 * $pad) $r
    $g.FillPath((New-Object System.Drawing.SolidBrush $teal), $path)

    $fontSize = [Math]::Max(5, [int]($size * 0.52))
    $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF (2 * $pad), (2 * $pad), ($size - 4 * $pad), ($size - 4 * $pad)
    $g.DrawString("W", $font, (New-Object System.Drawing.SolidBrush $ink), $rect, $fmt)

    $bmp.Save((Join-Path $outDir "$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "icon $size.png"
}
