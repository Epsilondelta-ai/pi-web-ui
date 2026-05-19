This directory is the Go embed target for the built Astro UI.

Run `bun run build:binary` to copy `dist/` assets here before compiling the single executable.
Generated files in this directory are ignored by git; keep this README so `go test ./...` can compile the embed package without a frontend build.
