# ReadAloud AI — tiny local server (fully offline, serves only this folder)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$mime = @{
  '.html'='text/html; charset=utf-8'; '.js'='text/javascript'; '.css'='text/css'
  '.wasm'='application/wasm'; '.gz'='application/gzip'; '.json'='application/json'
  '.pdf'='application/pdf'; '.png'='image/png'; '.jpg'='image/jpeg'; '.svg'='image/svg+xml'
  '.traineddata'='application/octet-stream'
}
$port = 8977
$listener = $null
while ($port -lt 8990) {
  try {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$port/")
    $listener.Start()
    break
  } catch { $port++ }
}
if (-not $listener -or -not $listener.IsListening) { Write-Host 'Could not start server.'; exit 1 }
Write-Host ""
Write-Host "  ReadAloud AI is running at  http://localhost:$port" -ForegroundColor Green
Write-Host "  Keep this window open while using the app. Close it to stop." -ForegroundColor Yellow
Start-Process "http://localhost:$port/index.html"
while ($true) {
  $ctx = $listener.GetContext()
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }
    $full = Join-Path $root $path
    $fullResolved = [IO.Path]::GetFullPath($full)
    if (-not $fullResolved.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $fullResolved -PathType Leaf)) {
      $ctx.Response.StatusCode = 404
      $bytes = [Text.Encoding]::UTF8.GetBytes('Not found')
    } else {
      $ext = [IO.Path]::GetExtension($fullResolved).ToLower()
      $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $bytes = [IO.File]::ReadAllBytes($fullResolved)
    }
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {} finally { try { $ctx.Response.Close() } catch {} }
}
