#include <node_api.h>
#include <windows.h>
#include <cstring>
#include <string>

namespace {

enum class DesktopLayout { Worker, Raised };

struct DesktopHost {
  HWND parent = nullptr;
  HWND worker = nullptr;
  HWND icons = nullptr;
  DWORD process = 0;
  DesktopLayout layout = DesktopLayout::Worker;
};

napi_value fail(napi_env env, const char* message) {
  napi_throw_error(env, nullptr, message);
  return nullptr;
}

bool hasClass(HWND window, DWORD process, const wchar_t* expected) {
  if (!IsWindow(window)) return false;
  wchar_t name[32] = {};
  DWORD actualProcess = 0;
  GetClassNameW(window, name, 32);
  GetWindowThreadProcessId(window, &actualProcess);
  return actualProcess == process && std::wstring(name) == expected;
}

bool isWorker(HWND window, DWORD process) {
  return hasClass(window, process, L"WorkerW") && IsWindowVisible(window) &&
         !FindWindowExW(window, nullptr, L"SHELLDLL_DefView", nullptr);
}

bool isAbove(HWND upper, HWND lower) {
  if (!upper || !lower || GetAncestor(upper, GA_PARENT) != GetAncestor(lower, GA_PARENT)) return false;
  HWND next = GetWindow(upper, GW_HWNDNEXT);
  for (unsigned count = 0; next && count < 256; ++count, next = GetWindow(next, GW_HWNDNEXT)) {
    if (next == lower) return true;
  }
  return false;
}

bool isRaisedHost(const DesktopHost& host) {
  return hasClass(host.parent, host.process, L"Progman") &&
         (GetWindowLongPtrW(host.parent, GWL_EXSTYLE) & WS_EX_NOREDIRECTIONBITMAP) &&
         hasClass(host.icons, host.process, L"SHELLDLL_DefView") &&
         (GetWindowLongPtrW(host.icons, GWL_EXSTYLE) & WS_EX_LAYERED) &&
         GetParent(host.icons) == host.parent && isWorker(host.worker, host.process) &&
         GetParent(host.worker) == host.parent && isAbove(host.icons, host.worker);
}

BOOL CALLBACK findWorkerHost(HWND window, LPARAM parameter) {
  auto* host = reinterpret_cast<DesktopHost*>(parameter);
  DWORD process = 0;
  GetWindowThreadProcessId(window, &process);
  if (process != host->process) return TRUE;
  const HWND icons = FindWindowExW(window, nullptr, L"SHELLDLL_DefView", nullptr);
  if (!hasClass(icons, host->process, L"SHELLDLL_DefView")) return TRUE;
  const HWND worker = FindWindowExW(nullptr, window, L"WorkerW", nullptr);
  if (!isWorker(worker, host->process) || !isAbove(window, worker)) return TRUE;
  host->parent = worker;
  host->worker = worker;
  host->icons = icons;
  return FALSE;
}

const char* discoverHost(DesktopHost& host, bool requestLayer) {
  const HWND shell = GetShellWindow();
  const HWND manager = FindWindowW(L"Progman", nullptr);
  DWORD managerProcess = 0;
  GetWindowThreadProcessId(shell, &host.process);
  GetWindowThreadProcessId(manager, &managerProcess);
  if (!host.process || managerProcess != host.process)
    return "Windows Explorer is unavailable. Start Explorer and try desktop mode again.";
  if (requestLayer) {
    DWORD_PTR response = 0;
    if (!SendMessageTimeoutW(manager, 0x052C, 0xD, 0x1, SMTO_ABORTIFHUNG, 1000, &response))
      return "Windows Explorer did not respond to the desktop request.";
    if (GetShellWindow() != shell || !hasClass(manager, host.process, L"Progman"))
      return "Windows restarted the desktop while it was being prepared. Try desktop mode again.";
  }
  if (GetWindowLongPtrW(manager, GWL_EXSTYLE) & WS_EX_NOREDIRECTIONBITMAP) {
    host.layout = DesktopLayout::Raised;
    host.parent = manager;
    host.icons = FindWindowExW(manager, nullptr, L"SHELLDLL_DefView", nullptr);
    host.worker = FindWindowExW(manager, nullptr, L"WorkerW", nullptr);
    if (!isRaisedHost(host))
      return "This Windows desktop does not expose a supported raised wallpaper layer. Desktop mode was not started.";
  } else {
    EnumWindows(findWorkerHost, reinterpret_cast<LPARAM>(&host));
    if (!host.parent)
      return "This Windows desktop does not expose a supported wallpaper layer. Desktop mode was not started.";
  }
  return nullptr;
}

HWND readWindowValue(napi_env env, napi_value value) {
  bool isBuffer = false;
  if (napi_is_buffer(env, value, &isBuffer) != napi_ok || !isBuffer) {
    fail(env, "Expected an Electron native window handle.");
    return nullptr;
  }
  void* bytes = nullptr;
  size_t length = 0;
  if (napi_get_buffer_info(env, value, &bytes, &length) != napi_ok || length != sizeof(HWND)) {
    fail(env, "The native window handle has the wrong architecture.");
    return nullptr;
  }
  HWND window = nullptr;
  std::memcpy(&window, bytes, sizeof(window));
  DWORD process = 0;
  const DWORD thread = GetWindowThreadProcessId(window, &process);
  if (!IsWindow(window) || process != GetCurrentProcessId() || thread != GetCurrentThreadId()) {
    fail(env, "The desktop handle does not belong to On Sight Musica's window thread.");
    return nullptr;
  }
  return window;
}

HWND readWindow(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value value;
  if (napi_get_cb_info(env, info, &argc, &value, nullptr, nullptr) != napi_ok || argc != 1) {
    fail(env, "Expected an Electron native window handle.");
    return nullptr;
  }
  return readWindowValue(env, value);
}

const char* dpiName(DPI_AWARENESS_CONTEXT context) {
  if (AreDpiAwarenessContextsEqual(context, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)) return "per-monitor v2";
  if (AreDpiAwarenessContextsEqual(context, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE)) return "per-monitor v1";
  if (AreDpiAwarenessContextsEqual(context, DPI_AWARENESS_CONTEXT_SYSTEM_AWARE)) return "system aware";
  if (AreDpiAwarenessContextsEqual(context, DPI_AWARENESS_CONTEXT_UNAWARE_GDISCALED)) return "unaware GDI scaled";
  if (AreDpiAwarenessContextsEqual(context, DPI_AWARENESS_CONTEXT_UNAWARE)) return "unaware";
  return "unknown";
}

napi_value failDpi(napi_env env, HWND window, HWND parent) {
  const std::string message = std::string("The wallpaper window uses ") +
    dpiName(GetWindowDpiAwarenessContext(window)) + "; Windows requires " +
    dpiName(GetWindowDpiAwarenessContext(parent)) + ". Desktop mode was not started.";
  return fail(env, message.c_str());
}

class ThreadDpiScope {
 public:
  explicit ThreadDpiScope(DPI_AWARENESS_CONTEXT context)
      : previous_(SetThreadDpiAwarenessContext(context)) {}
  ~ThreadDpiScope() {
    if (previous_) SetThreadDpiAwarenessContext(previous_);
  }
  bool entered() const { return previous_ != nullptr; }
  bool restore() {
    if (!previous_ || !SetThreadDpiAwarenessContext(previous_) ||
        !AreDpiAwarenessContextsEqual(GetThreadDpiAwarenessContext(), previous_)) return false;
    previous_ = nullptr;
    return true;
  }
 private:
  DPI_AWARENESS_CONTEXT previous_;
};

napi_value createWindow(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value factory;
  napi_valuetype type;
  if (napi_get_cb_info(env, info, &argc, &factory, nullptr, nullptr) != napi_ok || argc != 1 ||
      napi_typeof(env, factory, &type) != napi_ok || type != napi_function)
    return fail(env, "Expected a synchronous wallpaper window factory.");
  DesktopHost host;
  if (const char* error = discoverHost(host, true)) return fail(env, error);
  const DPI_AWARENESS_CONTEXT target = GetWindowDpiAwarenessContext(host.parent);
  if (!IsValidDpiAwarenessContext(target)) return fail(env, "Windows did not provide a valid desktop display scaling mode.");
  ThreadDpiScope scope(target);
  if (!scope.entered()) return fail(env, "The desktop display scaling mode could not be selected.");
  napi_value receiver;
  napi_value result;
  napi_get_undefined(env, &receiver);
  const napi_status status = napi_call_function(env, receiver, factory, 0, nullptr, &result);
  if (!scope.restore()) {
    bool pending = false;
    napi_is_exception_pending(env, &pending);
    if (pending) {
      napi_value ignored;
      napi_get_and_clear_last_exception(env, &ignored);
    }
    return fail(env, "The player display scaling mode could not be restored. Desktop mode was not started.");
  }
  if (status != napi_ok) {
    if (status == napi_pending_exception) return nullptr;
    return fail(env, "The desktop window could not be created.");
  }
  const HWND window = readWindowValue(env, result);
  if (!window) return nullptr;
  if (!AreDpiAwarenessContextsEqual(GetWindowDpiAwarenessContext(window), target))
    return failDpi(env, window, host.parent);
  napi_value value;
  napi_get_undefined(env, &value);
  return value;
}

bool isPlaced(HWND window, const DesktopHost& host) {
  if (GetParent(window) != host.parent || !(GetWindowLongPtrW(window, GWL_STYLE) & WS_CHILD) ||
      !AreDpiAwarenessContextsEqual(GetWindowDpiAwarenessContext(window), GetWindowDpiAwarenessContext(host.parent)))
    return false;
  return host.layout == DesktopLayout::Worker ||
    ((GetWindowLongPtrW(window, GWL_EXSTYLE) & WS_EX_LAYERED) &&
     isAbove(host.icons, window) && isAbove(window, host.worker));
}

napi_value attach(napi_env env, napi_callback_info info) {
  const HWND window = readWindow(env, info);
  if (!window) return nullptr;
  DesktopHost host;
  if (const char* error = discoverHost(host, false)) return fail(env, error);
  if (!AreDpiAwarenessContextsEqual(GetWindowDpiAwarenessContext(window), GetWindowDpiAwarenessContext(host.parent)))
    return failDpi(env, window, host.parent);
  MONITORINFO monitor = {};
  monitor.cbSize = sizeof(monitor);
  const POINT origin = {0, 0};
  if (!GetMonitorInfoW(MonitorFromPoint(origin, MONITOR_DEFAULTTOPRIMARY), &monitor))
    return fail(env, "The primary display could not be read.");
  RECT bounds = monitor.rcMonitor;
  SetLastError(0);
  if (!MapWindowPoints(HWND_DESKTOP, host.parent, reinterpret_cast<POINT*>(&bounds), 2) && GetLastError() != 0)
    return fail(env, "The primary display could not be mapped to the desktop.");
  const LONG_PTR originalStyle = GetWindowLongPtrW(window, GWL_STYLE);
  SetLastError(0);
  SetWindowLongPtrW(window, GWL_STYLE, (originalStyle | WS_CHILD) & ~WS_POPUP);
  if (GetLastError() != 0) return fail(env, "The wallpaper window style could not be set.");
  if (host.layout == DesktopLayout::Raised) {
    const LONG_PTR style = GetWindowLongPtrW(window, GWL_EXSTYLE);
    SetLastError(0);
    SetWindowLongPtrW(window, GWL_EXSTYLE, style | WS_EX_LAYERED);
    if (GetLastError() != 0 || !SetLayeredWindowAttributes(window, 0, 255, LWA_ALPHA))
      return fail(env, "The wallpaper window could not join the raised desktop layer.");
  }
  SetLastError(0);
  if (!SetParent(window, host.parent) && GetLastError() != 0)
    return fail(env, "Windows could not place the player behind the desktop icons.");
  const HWND after = host.layout == DesktopLayout::Raised ? host.icons : HWND_BOTTOM;
  if (!SetWindowPos(window, after, bounds.left, bounds.top,
                    bounds.right - bounds.left, bounds.bottom - bounds.top,
                    SWP_NOACTIVATE | SWP_FRAMECHANGED))
    return fail(env, "The wallpaper could not fit the primary display.");
  if (!isPlaced(window, host)) return fail(env, "Windows did not retain the wallpaper's desktop placement.");
  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}

napi_value isAttached(napi_env env, napi_callback_info info) {
  const HWND window = readWindow(env, info);
  if (!window) return nullptr;
  DesktopHost host;
  const bool attached = !discoverHost(host, false) && isPlaced(window, host);
  napi_value result;
  napi_get_boolean(env, attached, &result);
  return result;
}

napi_value initialize(napi_env env, napi_value exports) {
  napi_value createFunction;
  napi_value attachFunction;
  napi_value statusFunction;
  napi_value taskbarMessage;
  napi_create_function(env, "createWindow", NAPI_AUTO_LENGTH, createWindow, nullptr, &createFunction);
  napi_create_function(env, "attach", NAPI_AUTO_LENGTH, attach, nullptr, &attachFunction);
  napi_create_function(env, "isAttached", NAPI_AUTO_LENGTH, isAttached, nullptr, &statusFunction);
  napi_create_uint32(env, RegisterWindowMessageW(L"TaskbarCreated"), &taskbarMessage);
  napi_set_named_property(env, exports, "createWindow", createFunction);
  napi_set_named_property(env, exports, "attach", attachFunction);
  napi_set_named_property(env, exports, "isAttached", statusFunction);
  napi_set_named_property(env, exports, "taskbarMessage", taskbarMessage);
  return exports;
}

}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
