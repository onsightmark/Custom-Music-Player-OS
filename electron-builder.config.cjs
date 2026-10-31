module.exports = {
  appId: 'com.onsight.musica',
  productName: 'On Sight Musica',
  directories: { output: 'release' },
  files: [
    'dist/**',
    'desktop/*.cjs',
    'native/build/Release/wallpaper.node',
    'electron-builder.config.cjs',
    'package.json',
    'LICENSE',
    '!node_modules/**',
  ],
  asarUnpack: ['native/build/Release/*.node'],
  npmRebuild: false,
  artifactName: 'On-Sight-Musica-${version}-${os}-${arch}.${ext}',
  mac: {
    category: 'public.app-category.music',
    target: ['dmg', 'zip'],
    icon: 'public/icon-512.png',
  },
  win: {
    target: ['nsis'],
    icon: 'public/icon-512.png',
  },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true },
};
