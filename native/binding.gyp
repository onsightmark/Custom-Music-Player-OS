{
  "targets": [
    {
      "target_name": "wallpaper",
      "sources": ["wallpaper.cc"],
      "defines": ["NAPI_VERSION=8", "UNICODE", "_UNICODE", "_WIN32_WINNT=0x0A00"],
      "libraries": ["user32.lib"],
      "msvs_settings": { "VCCLCompilerTool": { "AdditionalOptions": ["/std:c++17"] } }
    }
  ]
}
