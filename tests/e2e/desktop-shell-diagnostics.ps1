$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
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

  private readonly Stopwatch timer = Stopwatch.StartNew();
  private readonly HashSet<IntPtr> visited = new HashSet<IntPtr>();
  private readonly List<object> nodes = new List<object>();
  private uint shellProcess;
  private bool truncated;

  private static string Hex(IntPtr value) { return "0x" + value.ToInt64().ToString("X"); }
  private bool Available() {
    if (timer.ElapsedMilliseconds < 1500 && visited.Count < 256 && nodes.Count < 64) return true;
    truncated = true;
    return false;
  }

  private void Visit(IntPtr window, int depth) {
    if (window == IntPtr.Zero || !Available() || !visited.Add(window)) return;
    uint process;
    GetWindowThreadProcessId(window, out process);
    if (process != shellProcess) return;
    StringBuilder name = new StringBuilder(64);
    GetClassName(window, name, name.Capacity);
    string className = name.ToString();
    if (className == "Progman" || className == "WorkerW" || className == "SHELLDLL_DefView") {
      IntPtr dpiContext = GetWindowDpiAwarenessContext(window);
      uint style = unchecked((uint)GetWindowLong(window, -16));
      uint exStyle = unchecked((uint)GetWindowLong(window, -20));
      Rect rect;
      bool hasRect = GetWindowRect(window, out rect);
      nodes.Add(new {
        handle = Hex(window), className, process, depth,
        parent = Hex(GetAncestor(window, 1)), owner = Hex(GetWindow(window, 4)),
        previousSibling = Hex(GetWindow(window, 3)), nextSibling = Hex(GetWindow(window, 2)),
        visible = IsWindowVisible(window), style = "0x" + style.ToString("X8"),
        exStyle = "0x" + exStyle.ToString("X8"),
        noRedirectionBitmap = (exStyle & 0x00200000) != 0,
        layered = (exStyle & 0x00080000) != 0,
        dpi = GetDpiForWindow(window), dpiContext = Hex(dpiContext),
        dpiAwareness = GetAwarenessFromDpiAwarenessContext(dpiContext),
        rect = hasRect ? new int[] { rect.Left, rect.Top, rect.Right, rect.Bottom } : null
      });
    }
    if (depth >= 4) {
      if (GetWindow(window, 5) != IntPtr.Zero) truncated = true;
      return;
    }
    for (IntPtr child = GetWindow(window, 5); child != IntPtr.Zero && Available(); child = GetWindow(child, 2)) {
      Visit(child, depth + 1);
    }
  }

  public static object Capture() {
    MusicaDesktopProbe probe = new MusicaDesktopProbe();
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
    const string versionKey = @"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion";
    return new {
      osVersion = Environment.OSVersion.Version.ToString(),
      productName = Convert.ToString(Registry.GetValue(versionKey, "ProductName", null)),
      displayVersion = Convert.ToString(Registry.GetValue(versionKey, "DisplayVersion", null)),
      build = Convert.ToString(Registry.GetValue(versionKey, "CurrentBuildNumber", null)),
      updateBuildRevision = Registry.GetValue(versionKey, "UBR", null),
      shell = Hex(shell), shellProcess = probe.shellProcess,
      progman = Hex(progman), progmanProcess,
      inspected = probe.visited.Count, elapsedMs = probe.timer.ElapsedMilliseconds,
      truncated = probe.truncated, nodes = probe.nodes.ToArray()
    };
  }
}
'@

[MusicaDesktopProbe]::Capture() | ConvertTo-Json -Depth 8 -Compress
