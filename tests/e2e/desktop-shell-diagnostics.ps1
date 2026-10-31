param(
  [uint32]$ApplicationProcess = 0,
  [string]$PlayerHandle = '',
  [string]$WallpaperHandle = ''
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32;

public sealed class MusicaDesktopProbe {
  private delegate bool EnumWindow(IntPtr window, IntPtr parameter);
  [StructLayout(LayoutKind.Sequential)]
  private struct Rect { public int Left, Top, Right, Bottom; }

  [DllImport("user32.dll")] private static extern IntPtr GetShellWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  private static extern IntPtr FindWindow(string className, string name);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindow callback, IntPtr parameter);
  [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
  [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  private static extern int GetClassName(IntPtr window, StringBuilder name, int count);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
  private static extern int GetWindowLong(IntPtr window, int index);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr window);
  [DllImport("user32.dll")] private static extern IntPtr GetWindowDpiAwarenessContext(IntPtr window);
  [DllImport("user32.dll")] private static extern int GetAwarenessFromDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] private static extern bool AreDpiAwarenessContextsEqual(IntPtr first, IntPtr second);
  [DllImport("user32.dll")] private static extern IntPtr GetDpiAwarenessContextForProcess(IntPtr process);
  [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll")] private static extern bool GetLayeredWindowAttributes(IntPtr window, out uint key, out byte alpha, out uint flags);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern IntPtr OpenProcess(uint access, bool inherit, uint process);
  [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);

  private readonly Stopwatch timer = Stopwatch.StartNew();
  private readonly HashSet<IntPtr> visited = new HashSet<IntPtr>();
  private readonly List<object> nodes = new List<object>();
  private uint shellProcess;
  private uint applicationProcess;
  private IntPtr player;
  private IntPtr wallpaper;
  private bool truncated;

  private static string Hex(IntPtr value) { return "0x" + value.ToInt64().ToString("X"); }
  private static string DpiName(IntPtr context) {
    if (AreDpiAwarenessContextsEqual(context, new IntPtr(-4))) return "PER_MONITOR_AWARE_V2";
    if (AreDpiAwarenessContextsEqual(context, new IntPtr(-3))) return "PER_MONITOR_AWARE";
    if (AreDpiAwarenessContextsEqual(context, new IntPtr(-2))) return "SYSTEM_AWARE";
    if (AreDpiAwarenessContextsEqual(context, new IntPtr(-5))) return "UNAWARE_GDISCALED";
    if (AreDpiAwarenessContextsEqual(context, new IntPtr(-1))) return "UNAWARE";
    return "UNKNOWN";
  }

  private static IntPtr ReadHandle(string value, uint process) {
    if (String.IsNullOrEmpty(value)) return IntPtr.Zero;
    ulong numeric;
    if (process == 0 || !value.StartsWith("0x", StringComparison.Ordinal) ||
        !UInt64.TryParse(value.Substring(2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out numeric) ||
        numeric == 0 || numeric > Int64.MaxValue || (IntPtr.Size == 4 && numeric > Int32.MaxValue))
      throw new ArgumentException("The application window handle is invalid.");
    IntPtr handle = new IntPtr((long)numeric);
    if (!IsWindow(handle)) return handle;
    uint owner;
    GetWindowThreadProcessId(handle, out owner);
    if (owner != process) throw new ArgumentException("The requested window does not belong to the application process.");
    return handle;
  }

  private object ReadProcessDpi() {
    if (applicationProcess == 0) return null;
    IntPtr process = OpenProcess(0x1000, false, applicationProcess);
    if (process == IntPtr.Zero) throw new InvalidOperationException("The application process could not be inspected.");
    try {
      IntPtr context = GetDpiAwarenessContextForProcess(process);
      if (context == IntPtr.Zero) throw new InvalidOperationException("The application process DPI context is unavailable.");
      return new { context = Hex(context), name = DpiName(context), awareness = GetAwarenessFromDpiAwarenessContext(context) };
    } finally { CloseHandle(process); }
  }
  private bool Available() {
    if (timer.ElapsedMilliseconds < 1500 && visited.Count < 256 && nodes.Count < 64) return true;
    truncated = true;
    return false;
  }

  private void Visit(IntPtr window, int depth) {
    if (window == IntPtr.Zero || !IsWindow(window) || !Available() || !visited.Add(window)) return;
    uint process;
    uint thread = GetWindowThreadProcessId(window, out process);
    bool ownWindow = process == applicationProcess && (window == player || window == wallpaper);
    if (process != shellProcess && !ownWindow) return;
    StringBuilder name = new StringBuilder(64);
    GetClassName(window, name, name.Capacity);
    string className = name.ToString();
    if (ownWindow || className == "Progman" || className == "WorkerW" || className == "SHELLDLL_DefView") {
      IntPtr dpiContext = GetWindowDpiAwarenessContext(window);
      IntPtr parent = GetAncestor(window, 1);
      uint style = unchecked((uint)GetWindowLong(window, -16));
      uint exStyle = unchecked((uint)GetWindowLong(window, -20));
      Rect rect;
      bool hasRect = GetWindowRect(window, out rect);
      uint key, layeredFlags;
      byte alpha;
      bool hasAlpha = GetLayeredWindowAttributes(window, out key, out alpha, out layeredFlags);
      nodes.Add(new {
        handle = Hex(window), className, process, thread, depth,
        role = ownWindow ? (window == player ? "player" : "wallpaper") : "shell",
        parent = Hex(parent), owner = Hex(GetWindow(window, 4)),
        previousSibling = Hex(GetWindow(window, 3)), nextSibling = Hex(GetWindow(window, 2)),
        visible = IsWindowVisible(window), style = "0x" + style.ToString("X8"),
        exStyle = "0x" + exStyle.ToString("X8"),
        noRedirectionBitmap = (exStyle & 0x00200000) != 0,
        layered = (exStyle & 0x00080000) != 0,
        transparent = (exStyle & 0x00000020) != 0,
        layeredAlpha = hasAlpha && (layeredFlags & 2) != 0 ? (int?)alpha : null,
        dpi = GetDpiForWindow(window), dpiContext = Hex(dpiContext),
        dpiAwareness = GetAwarenessFromDpiAwarenessContext(dpiContext),
        dpiName = DpiName(dpiContext),
        sameDpiAsParent = AreDpiAwarenessContextsEqual(dpiContext, GetWindowDpiAwarenessContext(parent)),
        sameDpiAsWallpaper = AreDpiAwarenessContextsEqual(dpiContext, GetWindowDpiAwarenessContext(wallpaper)),
        rect = hasRect ? new int[] { rect.Left, rect.Top, rect.Right, rect.Bottom } : null
      });
    }
    if (ownWindow) return;
    if (depth >= 4) {
      if (GetWindow(window, 5) != IntPtr.Zero) truncated = true;
      return;
    }
    for (IntPtr child = GetWindow(window, 5); child != IntPtr.Zero && Available(); child = GetWindow(child, 2)) {
      Visit(child, depth + 1);
    }
  }

  public static object Capture(uint applicationProcess, string player, string wallpaper) {
    MusicaDesktopProbe probe = new MusicaDesktopProbe();
    probe.applicationProcess = applicationProcess;
    probe.player = ReadHandle(player, applicationProcess);
    probe.wallpaper = ReadHandle(wallpaper, applicationProcess);
    IntPtr shell = GetShellWindow();
    IntPtr progman = FindWindow("Progman", null);
    uint progmanProcess;
    GetWindowThreadProcessId(shell, out probe.shellProcess);
    GetWindowThreadProcessId(progman, out progmanProcess);
    if (probe.shellProcess != 0) {
      EnumWindows(delegate(IntPtr window, IntPtr parameter) {
        probe.Visit(window, 0);
        return probe.Available();
      }, IntPtr.Zero);
    }
    probe.Visit(probe.player, 0);
    probe.Visit(probe.wallpaper, 0);
    const string versionKey = @"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion";
    return new {
      osVersion = Environment.OSVersion.Version.ToString(),
      productName = Convert.ToString(Registry.GetValue(versionKey, "ProductName", null)),
      displayVersion = Convert.ToString(Registry.GetValue(versionKey, "DisplayVersion", null)),
      build = Convert.ToString(Registry.GetValue(versionKey, "CurrentBuildNumber", null)),
      updateBuildRevision = Registry.GetValue(versionKey, "UBR", null),
      shell = Hex(shell), shellProcess = probe.shellProcess,
      progman = Hex(progman), progmanProcess,
      applicationProcess, processDpi = probe.ReadProcessDpi(),
      requestedPlayer = Hex(probe.player), requestedWallpaper = Hex(probe.wallpaper),
      playerExists = IsWindow(probe.player), wallpaperExists = IsWindow(probe.wallpaper),
      inspected = probe.visited.Count, elapsedMs = probe.timer.ElapsedMilliseconds,
      truncated = probe.truncated, nodes = probe.nodes.ToArray()
    };
  }
}
'@

[MusicaDesktopProbe]::Capture($ApplicationProcess, $PlayerHandle, $WallpaperHandle) | ConvertTo-Json -Depth 8 -Compress
