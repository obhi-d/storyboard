# Storyboard v1.0

An infinite canvas for connected ideas, now available as a standalone desktop app.

- Arrange images and Markdown cards; connect them with curved arrows.
- Draw and handwrite notes with adjustable pen colors and widths.
- Pan, zoom, resize, recolor, duplicate, and undo/redo.
- Autosave locally and import/export complete boards, including images and drawings.
- Bundled fonts and UI assets work without an internet connection.

## Downloads

- **Windows x64:** download `Storyboard-1.0.0-win-x64.exe` and run it. This is a portable executable; no installation is required.
- **Linux x64:** download `Storyboard-1.0.0-linux-x86_64.AppImage`, mark it executable (`chmod +x`), and run it. If your distribution lacks FUSE, use `--appimage-extract-and-run` or download the `.tar.gz`, extract it, and launch `storyboard`.
- `SHA256SUMS.txt` contains checksums for all downloads.

The Windows executable is unsigned, so Windows may show an unknown-publisher warning. Linux requires a graphical desktop and system Chromium dependencies (supported Ubuntu 22.04+ or equivalent). Only x64 builds are included in this release.

Desktop data is stored in the app's local profile, separately from browser data. Export your browser board and import it into the desktop app to transfer it. Export regularly for backups. No cloud sync or automatic updater is included.
