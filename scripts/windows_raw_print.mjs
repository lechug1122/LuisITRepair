import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { listLocalPrinters } from "./local_printers.mjs"

const execFileAsync = promisify(execFile)
const RAW_SCRIPT_PATH = path.join(os.tmpdir(), "luisitrepair_raw_print.ps1")
const IMAGE_SCRIPT_PATH = path.join(os.tmpdir(), "luisitrepair_image_print.ps1")

const RAW_PRINT_SCRIPT = `
param(
  [string]$PrinterName,
  [string]$Base64Content,
  [string]$JobName = "LuisITRepair Ticket"
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public class DOCINFO
    {
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 Level, DOCINFO di);

    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, Int32 dwCount, out Int32 dwWritten);

    public static void SendBytesToPrinter(string printerName, byte[] bytes, string jobName)
    {
        IntPtr printerHandle;
        if (!OpenPrinter(printerName, out printerHandle, IntPtr.Zero))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());

        try
        {
            DOCINFO di = new DOCINFO();
            di.pDocName = jobName;
            di.pDataType = "RAW";

            if (!StartDocPrinter(printerHandle, 1, di))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());

            try
            {
                if (!StartPagePrinter(printerHandle))
                    throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());

                try
                {
                    Int32 written;
                    if (!WritePrinter(printerHandle, bytes, bytes.Length, out written))
                        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());

                    if (written != bytes.Length)
                        throw new Exception("Escritura incompleta al spooler.");
                }
                finally
                {
                    EndPagePrinter(printerHandle);
                }
            }
            finally
            {
                EndDocPrinter(printerHandle);
            }
        }
        finally
        {
            ClosePrinter(printerHandle);
        }
    }
}
"@

$bytes = [Convert]::FromBase64String($Base64Content)
[RawPrinterHelper]::SendBytesToPrinter($PrinterName, $bytes, $JobName)
`

const IMAGE_PRINT_SCRIPT = `
param(
  [string]$PrinterName,
  [string]$ImagePath,
  [string]$JobName = "LuisITRepair Ticket",
  [string]$PaperSize = "a4"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies @("System.Drawing.dll", "System.dll") -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Printing;
using System.Globalization;
using System.IO;

public class SilentImagePrinter
{
    private static int MmToHundredthsOfInch(double mm)
    {
        return Math.Max(1, (int)Math.Round(mm * 100.0 / 25.4));
    }

    private static bool TryGetThermalPaperWidth(string paperSize, out int width)
    {
        width = 0;
        var normalized = (paperSize ?? "").Trim().ToLowerInvariant().Replace(" ", "");

        if (normalized == "ticket")
        {
            width = MmToHundredthsOfInch(58);
            return true;
        }

        if (normalized.StartsWith("ticket-"))
            normalized = normalized.Substring(7);
        else if (normalized.StartsWith("ticket"))
            normalized = normalized.Substring(6);

        if (normalized.EndsWith("mm"))
            normalized = normalized.Substring(0, normalized.Length - 2);

        double parsedWidth;
        if (!double.TryParse(normalized, NumberStyles.Float, CultureInfo.InvariantCulture, out parsedWidth))
            return false;

        if (parsedWidth < 30 || parsedWidth > 120)
            return false;

        width = MmToHundredthsOfInch(parsedWidth);
        return true;
    }

    private static PaperSize ResolvePaperSize(PrintDocument printDoc, string paperSize, Image image)
    {
        int thermalWidth;
        if (TryGetThermalPaperWidth(paperSize, out thermalWidth))
        {
            var thermalHeight = Math.Max(
                MmToHundredthsOfInch(20),
                (int)Math.Ceiling((double)image.Height * thermalWidth / image.Width) + MmToHundredthsOfInch(2)
            );
            return new PaperSize("CustomThermal", thermalWidth, thermalHeight);
        }

        var requestedPaperKind = string.Equals(paperSize, "carta", StringComparison.OrdinalIgnoreCase)
            || string.Equals(paperSize, "letter", StringComparison.OrdinalIgnoreCase)
            ? PaperKind.Letter
            : PaperKind.A4;

        foreach (PaperSize paper in printDoc.PrinterSettings.PaperSizes)
        {
            if (paper.Kind == requestedPaperKind)
            {
                return paper;
            }
        }

        return printDoc.DefaultPageSettings.PaperSize;
    }

    public static void PrintImage(string printerName, string imagePath, string jobName, string paperSize)
    {
        using (var image = Image.FromFile(imagePath))
        using (var printDoc = new PrintDocument())
        {
            printDoc.PrinterSettings.PrinterName = printerName;
            if (!printDoc.PrinterSettings.IsValid)
                throw new Exception("Impresora no valida.");

            printDoc.DocumentName = jobName;
            printDoc.OriginAtMargins = false;
            printDoc.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);
            printDoc.PrintController = new StandardPrintController();
            printDoc.DefaultPageSettings.Landscape = false;

            var resolvedPaperSize = ResolvePaperSize(printDoc, paperSize, image);
            var useFullPageBounds = string.Equals(
                resolvedPaperSize.PaperName,
                "CustomThermal",
                StringComparison.OrdinalIgnoreCase
            );

            printDoc.DefaultPageSettings.PaperSize = resolvedPaperSize;

            printDoc.PrintPage += (sender, e) =>
            {
                var bounds = useFullPageBounds || e.MarginBounds.Width <= 0 || e.MarginBounds.Height <= 0
                    ? e.PageBounds
                    : e.MarginBounds;
                var targetWidth = bounds.Width;
                var targetHeight = (int)Math.Round((double)image.Height * targetWidth / image.Width);

                e.Graphics.Clear(Color.White);
                e.Graphics.DrawImage(
                    image,
                    new Rectangle(bounds.Left, bounds.Top, targetWidth, targetHeight)
                );
                e.HasMorePages = false;
            };

            printDoc.Print();
        }
    }
}
"@

[SilentImagePrinter]::PrintImage($PrinterName, $ImagePath, $JobName, $PaperSize)
`

async function ensureRawScriptFile() {
  await fs.writeFile(RAW_SCRIPT_PATH, RAW_PRINT_SCRIPT, "utf8")
  return RAW_SCRIPT_PATH
}

async function ensureImageScriptFile() {
  await fs.writeFile(IMAGE_SCRIPT_PATH, IMAGE_PRINT_SCRIPT, "utf8")
  return IMAGE_SCRIPT_PATH
}

function sanitizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
}

function normalizeBase64Image(value) {
  return String(value || "").replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "").trim()
}

async function resolvePrinterName(printerName = "") {
  const printers = await listLocalPrinters()
  const resolvedPrinter =
    String(printerName || "").trim() ||
    printers.find((item) => item.isDefault)?.name ||
    printers[0]?.name ||
    ""

  if (!resolvedPrinter) {
    throw new Error("No se encontro una impresora disponible.")
  }

  return resolvedPrinter
}

export async function printRawText({
  printerName = "",
  text = "",
  jobName = "LuisITRepair Ticket",
} = {}) {
  if (process.platform !== "win32") {
    throw new Error("La impresion silenciosa local solo esta soportada en Windows.")
  }

  const resolvedPrinter = await resolvePrinterName(printerName)
  const scriptPath = await ensureRawScriptFile()
  const payload = Buffer.from(sanitizeText(text), "ascii").toString("base64")

  await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      resolvedPrinter,
      payload,
      String(jobName || "LuisITRepair Ticket"),
    ],
    {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 4,
    },
  )

  return {
    ok: true,
    printerName: resolvedPrinter,
  }
}

export async function printImageBase64({
  printerName = "",
  imageBase64 = "",
  jobName = "LuisITRepair Ticket",
  paperSize = "a4",
} = {}) {
  if (process.platform !== "win32") {
    throw new Error("La impresion silenciosa local solo esta soportada en Windows.")
  }

  const normalizedImage = normalizeBase64Image(imageBase64)
  if (!normalizedImage) {
    throw new Error("No se recibio ninguna imagen para imprimir.")
  }

  const resolvedPrinter = await resolvePrinterName(printerName)
  const scriptPath = await ensureImageScriptFile()
  const imagePath = path.join(
    os.tmpdir(),
    `luisitrepair_ticket_${Date.now()}_${Math.random().toString(16).slice(2)}.png`,
  )

  try {
    await fs.writeFile(imagePath, Buffer.from(normalizedImage, "base64"))

    await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        resolvedPrinter,
        imagePath,
        String(jobName || "LuisITRepair Ticket"),
        String(paperSize || "a4"),
      ],
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 4,
      },
    )
  } finally {
    await fs.unlink(imagePath).catch(() => {})
  }

  return {
    ok: true,
    printerName: resolvedPrinter,
    paperSize: String(paperSize || "a4"),
  }
}
