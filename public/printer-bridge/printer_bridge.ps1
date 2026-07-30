$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Printing
Add-Type -ReferencedAssemblies @("System.Drawing.dll", "System.dll") -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Printing;
using System.Globalization;
using System.Runtime.InteropServices;

public static class LuisITPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public class DOCINFO {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
    static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
    [DllImport("winspool.Drv", SetLastError=true)] static extern bool ClosePrinter(IntPtr handle);
    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
    static extern bool StartDocPrinter(IntPtr handle, int level, DOCINFO info);
    [DllImport("winspool.Drv", SetLastError=true)] static extern bool EndDocPrinter(IntPtr handle);
    [DllImport("winspool.Drv", SetLastError=true)] static extern bool StartPagePrinter(IntPtr handle);
    [DllImport("winspool.Drv", SetLastError=true)] static extern bool EndPagePrinter(IntPtr handle);
    [DllImport("winspool.Drv", SetLastError=true)]
    static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);

    public static void PrintRaw(string printerName, byte[] bytes, string jobName) {
        IntPtr handle;
        if (!OpenPrinter(printerName, out handle, IntPtr.Zero))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        try {
            var info = new DOCINFO { pDocName = jobName, pDataType = "RAW" };
            if (!StartDocPrinter(handle, 1, info))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            try {
                if (!StartPagePrinter(handle))
                    throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
                try {
                    int written;
                    if (!WritePrinter(handle, bytes, bytes.Length, out written) || written != bytes.Length)
                        throw new Exception("No se pudo completar la escritura al spooler.");
                } finally { EndPagePrinter(handle); }
            } finally { EndDocPrinter(handle); }
        } finally { ClosePrinter(handle); }
    }

    static int Mm(double value) { return Math.Max(1, (int)Math.Round(value * 100.0 / 25.4)); }

    static PaperSize ResolvePaper(PrintDocument doc, string requested, Image image) {
        var value = (requested ?? "").Trim().ToLowerInvariant().Replace(" ", "");
        if (value == "ticket") value = "58mm";
        if (value.StartsWith("ticket-")) value = value.Substring(7);
        else if (value.StartsWith("ticket")) value = value.Substring(6);
        if (value.EndsWith("mm")) value = value.Substring(0, value.Length - 2);
        double widthMm;
        if (double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out widthMm)
            && widthMm >= 30 && widthMm <= 120) {
            int width = Mm(widthMm);
            int height = Math.Max(Mm(20), (int)Math.Ceiling((double)image.Height * width / image.Width) + Mm(2));
            return new PaperSize("CustomThermal", width, height);
        }
        var kind = requested == "carta" || requested == "letter" ? PaperKind.Letter : PaperKind.A4;
        foreach (PaperSize paper in doc.PrinterSettings.PaperSizes)
            if (paper.Kind == kind) return paper;
        return doc.DefaultPageSettings.PaperSize;
    }

    public static void PrintImage(string printerName, string imagePath, string jobName, string paperSize) {
        using (var image = Image.FromFile(imagePath))
        using (var doc = new PrintDocument()) {
            doc.PrinterSettings.PrinterName = printerName;
            if (!doc.PrinterSettings.IsValid) throw new Exception("Impresora no valida.");
            doc.DocumentName = jobName;
            doc.OriginAtMargins = false;
            doc.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);
            doc.PrintController = new StandardPrintController();
            var paper = ResolvePaper(doc, paperSize, image);
            bool thermal = paper.PaperName == "CustomThermal";
            doc.DefaultPageSettings.PaperSize = paper;
            doc.PrintPage += delegate(object sender, PrintPageEventArgs e) {
                var bounds = thermal || e.MarginBounds.Width <= 0 ? e.PageBounds : e.MarginBounds;
                int height = (int)Math.Round((double)image.Height * bounds.Width / image.Width);
                e.Graphics.Clear(Color.White);
                e.Graphics.DrawImage(image, new Rectangle(bounds.Left, bounds.Top, bounds.Width, height));
                e.HasMorePages = false;
            };
            doc.Print();
        }
    }
}
"@

function Get-Printers {
    @(Get-CimInstance Win32_Printer | Sort-Object Name | ForEach-Object {
        [ordered]@{
            name = [string]$_.Name
            isDefault = [bool]$_.Default
            driverName = [string]$_.DriverName
            portName = [string]$_.PortName
            isNetwork = [bool]$_.Network
            isOffline = [bool]$_.WorkOffline
            statusCode = [int]$_.PrinterStatus
        }
    })
}

function Resolve-Printer([string]$Name) {
    $printers = @(Get-Printers)
    if ($Name -and ($printers.name -contains $Name)) { return $Name }
    $default = $printers | Where-Object isDefault | Select-Object -First 1
    if ($default) { return $default.name }
    if ($printers.Count) { return $printers[0].name }
    throw "No se encontro una impresora disponible."
}

function Send-Response($Stream, [int]$Status, $Payload) {
    $json = $Payload | ConvertTo-Json -Depth 6 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $reason = if ($Status -eq 200) { "OK" } else { "Error" }
    $header = "HTTP/1.1 $Status $reason`r`nContent-Type: application/json; charset=utf-8`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: Content-Type, Accept`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    $Stream.Write($bytes, 0, $bytes.Length)
}

function Read-Request($Stream) {
    $headerBytes = New-Object Collections.Generic.List[byte]
    $lastFour = New-Object Collections.Generic.Queue[byte]
    while ($headerBytes.Count -lt 64KB) {
        $value = $Stream.ReadByte()
        if ($value -lt 0) { break }
        $byte = [byte]$value
        $headerBytes.Add($byte)
        $lastFour.Enqueue($byte)
        if ($lastFour.Count -gt 4) { [void]$lastFour.Dequeue() }
        if ($lastFour.Count -eq 4 -and (($lastFour.ToArray() -join ",") -eq "13,10,13,10")) { break }
    }
    $header = [Text.Encoding]::ASCII.GetString($headerBytes.ToArray())
    $lines = $header -split "`r`n"
    $first = $lines[0]
    if (-not $first) { return $null }
    $parts = $first.Split(" ")
    $length = 0
    foreach ($line in $lines) {
        if ($line -match "^Content-Length:\s*(\d+)$") { $length = [int]$Matches[1] }
    }
    if ($length -gt 20MB) { throw "Solicitud demasiado grande." }
    $body = ""
    if ($length -gt 0) {
        $bodyBytes = New-Object byte[] $length
        $read = 0
        while ($read -lt $length) {
            $count = $Stream.Read($bodyBytes, $read, $length - $read)
            if ($count -le 0) { break }
            $read += $count
        }
        $body = [Text.Encoding]::UTF8.GetString($bodyBytes, 0, $read)
    }
    [ordered]@{ method = $parts[0]; path = $parts[1].Split("?")[0]; body = $body }
}

$mutex = New-Object Threading.Mutex($false, "Local\LuisITRepairPrinterBridge")
if (-not $mutex.WaitOne(0, $false)) { exit 0 }

$listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 3210)
$listener.Start()
Write-Host "LuisITRepair Printer Bridge activo en 127.0.0.1:3210"

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        try {
            $request = Read-Request $stream
            if (-not $request) { continue }
            if ($request.method -eq "OPTIONS") {
                Send-Response $stream 200 @{ ok = $true }
                continue
            }
            if ($request.method -eq "GET" -and $request.path -eq "/health") {
                Send-Response $stream 200 @{ ok = $true; service = "printer-bridge-powershell" }
                continue
            }
            if ($request.method -eq "GET" -and $request.path -eq "/api/printers") {
                $items = @(Get-Printers)
                Send-Response $stream 200 @{ ok = $true; printers = $items; total = $items.Count }
                continue
            }
            $data = if ($request.body) { $request.body | ConvertFrom-Json } else { @{} }
            if ($request.method -eq "POST" -and $request.path -eq "/api/print-text") {
                $printer = Resolve-Printer ([string]$data.printerName)
                $text = [string]$(if ($null -ne $data.content) { $data.content } else { $data.text })
                $bytes = [Text.Encoding]::ASCII.GetBytes($text)
                [LuisITPrinter]::PrintRaw($printer, $bytes, [string]$(if ($data.jobName) { $data.jobName } else { "LuisITRepair Ticket" }))
                Send-Response $stream 200 @{ ok = $true; printerName = $printer }
                continue
            }
            if ($request.method -eq "POST" -and $request.path -eq "/api/print-image") {
                $printer = Resolve-Printer ([string]$data.printerName)
                $base64 = [string]$(if ($data.imageBase64) { $data.imageBase64 } else { $data.imageDataUrl })
                $base64 = $base64 -replace "^data:image/[^;]+;base64,", ""
                if (-not $base64) { throw "No se recibio ninguna imagen para imprimir." }
                $temp = Join-Path $env:TEMP ("luisitrepair_" + [Guid]::NewGuid().ToString("N") + ".png")
                try {
                    [IO.File]::WriteAllBytes($temp, [Convert]::FromBase64String($base64))
                    [LuisITPrinter]::PrintImage($printer, $temp, [string]$(if ($data.jobName) { $data.jobName } else { "LuisITRepair Ticket" }), [string]$(if ($data.paperSize) { $data.paperSize } else { "a4" }))
                } finally { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
                Send-Response $stream 200 @{ ok = $true; printerName = $printer; paperSize = $data.paperSize }
                continue
            }
            Send-Response $stream 404 @{ ok = $false; error = "Ruta no encontrada." }
        } catch {
            try { Send-Response $stream 500 @{ ok = $false; error = "No se pudo completar la operacion."; detail = $_.Exception.Message } } catch {}
        } finally {
            $stream.Dispose()
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
