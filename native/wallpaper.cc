#include <node_api.h>
#include <windows.h>
#include <cstring>
#include <string>

namespace {

struct DesktopHost {
  HWND window = nullptr;
  DWORD process = 0;
};

napi_value fail(napi_env env, const char* message) {
  napi_throw_error(env, nullptr, message);
  return nullptr;
}

HWND readWindow(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value value;
  bool isBuffer = false;
  if (napi_get_cb_info(env, info, &argc, &value, nullptr, nullptr) != napi_ok || argc != 1 ||
      napi_is_buffer(env, value, &isBuffer) != napi_ok || !isBuffer) {
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
  GetWindowThreadProcessId(window, &process);
  if (!IsWindow(window) || process != GetCurrentProcessId()) {
    fail(env, "The desktop handle does not belong to On Sight Musica.");
    return nullptr;
  }
  return window;
}

bool isWorker(HWND window, DWORD process) {
  if (!IsWindow(window)) return false;
  wchar_t name[32] = {};
  DWORD actualProcess = 0;
  GetClassNameW(window, name, 32);
  GetWindowThreadProcessId(window, &actualProcess);
  return std::wstring(name) == L"WorkerW" && actualProcess == process &&
         !FindWindowExW(window, nullptr, L"SHELLDLL_DefView", nullptr);
}

BOOL CALLBACK findDesktopHost(HWND window, LPARAM parameter) {
  auto* host = reinterpret_cast<DesktopHost*>(parameter);
  DWORD process = 0;
  GetWindowThreadProcessId(window, &process);
  if (process != host->process || !FindWindowExW(window, nullptr, L"SHELLDLL_DefView", nullptr)) return TRUE;
  HWND worker = FindWindowExW(window, nullptr, L"WorkerW", nullptr);
  if (!isWorker(worker, host->process)) worker = FindWindowExW(nullptr, window, L"WorkerW", nullptr);
  if (!isWorker(worker, host->process)) return TRUE;
  host->window = worker;
  return FALSE;
}

napi_value attach(napi_env env, napi_callback_info info) {
  const HWND window = readWindow(env, info);
  if (!window) return nullptr;
  const HWND shell = GetShellWindow();
  const HWND programManager = FindWindowW(L"Progman", nullptr);
  DWORD shellProcess = 0;
  GetWindowThreadProcessId(shell, &shellProcess);
  DWORD managerProcess = 0;
  GetWindowThreadProcessId(programManager, &managerProcess);
  if (!shellProcess || managerProcess != shellProcess) return fail(env, "Windows Explorer is unavailable. Start Explorer and try desktop mode again.");
  DWORD_PTR response = 0;
  if (!SendMessageTimeoutW(programManager, 0x052C, 0, 0, SMTO_ABORTIFHUNG, 1000, &response)) {
    return fail(env, "Windows Explorer did not respond to the desktop request.");
  }
  DesktopHost host;
  host.process = shellProcess;
  EnumWindows(findDesktopHost, reinterpret_cast<LPARAM>(&host));
  if (!host.window) return fail(env, "This Windows desktop does not expose a supported wallpaper layer. Desktop mode was not started.");
  if (!AreDpiAwarenessContextsEqual(GetWindowDpiAwarenessContext(window), GetWindowDpiAwarenessContext(host.window))) {
    return fail(env, "Windows and On Sight Musica use incompatible display scaling modes. Desktop mode was not started.");
  }

  MONITORINFO monitor = {};
  monitor.cbSize = sizeof(monitor);
  const POINT origin = {0, 0};
  if (!GetMonitorInfoW(MonitorFromPoint(origin, MONITOR_DEFAULTTOPRIMARY), &monitor)) return fail(env, "The primary display could not be read.");
  RECT bounds = monitor.rcMonitor;
  MapWindowPoints(HWND_DESKTOP, host.window, reinterpret_cast<POINT*>(&bounds), 2);
  const LONG_PTR originalStyle = GetWindowLongPtrW(window, GWL_STYLE);
  SetLastError(0);
  SetWindowLongPtrW(window, GWL_STYLE, (originalStyle | WS_CHILD) & ~WS_POPUP);
  if (GetLastError() != 0) return fail(env, "The wallpaper window style could not be set.");
  SetLastError(0);
  const HWND previous = SetParent(window, host.window);
  if (!previous && GetLastError() != 0) {
    SetWindowLongPtrW(window, GWL_STYLE, originalStyle);
    return fail(env, "Windows could not place the player behind the desktop icons.");
  }
  if (!SetWindowPos(window, HWND_BOTTOM, bounds.left, bounds.top,
                    bounds.right - bounds.left, bounds.bottom - bounds.top,
                    SWP_NOACTIVATE | SWP_FRAMECHANGED)) {
    SetParent(window, previous);
    SetWindowLongPtrW(window, GWL_STYLE, originalStyle);
    return fail(env, "The wallpaper could not fit the primary display.");
  }
  if (GetParent(window) != host.window) return fail(env, "Windows did not retain the wallpaper attachment.");
  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}

napi_value isAttached(napi_env env, napi_callback_info info) {
  const HWND window = readWindow(env, info);
  if (!window) return nullptr;
  DWORD shellProcess = 0;
  GetWindowThreadProcessId(GetShellWindow(), &shellProcess);
  const bool attached = shellProcess && isWorker(GetParent(window), shellProcess);
  napi_value result;
  napi_get_boolean(env, attached, &result);
  return result;
}

napi_value initialize(napi_env env, napi_value exports) {
  napi_value attachFunction;
  napi_value statusFunction;
  napi_value taskbarMessage;
  napi_create_function(env, "attach", NAPI_AUTO_LENGTH, attach, nullptr, &attachFunction);
  napi_create_function(env, "isAttached", NAPI_AUTO_LENGTH, isAttached, nullptr, &statusFunction);
  napi_create_uint32(env, RegisterWindowMessageW(L"TaskbarCreated"), &taskbarMessage);
  napi_set_named_property(env, exports, "attach", attachFunction);
  napi_set_named_property(env, exports, "isAttached", statusFunction);
  napi_set_named_property(env, exports, "taskbarMessage", taskbarMessage);
  return exports;
}

}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
