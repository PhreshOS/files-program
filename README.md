# Files

Files browses and manages the folders and files of the machine running
PhreshOS. Its one Server works on the machine's filesystem; every Client window
presents it, and each follows the changes the others make.

It creates, renames, duplicates, copies, cuts, pastes, and moves entries to the
machine's Trash; uploads files and folders from the owner's device and
downloads files to it; and moves or copies entries by dragging them between
folders and windows. It shows pictures, sound, video, PDF documents, and text;
Markdown, HTML, and SVG show either as they look or as their code.

[PhreshOS](https://phreshos.com) ·
[Documentation](https://phreshos.com/docs) ·
[Source](https://github.com/PhreshOS/files-program)

## Development

```sh
bun install --frozen-lockfile
bun run verify
bun run dev
```

`check` validates TypeScript, `build` produces the Server and Client bundles,
`test` runs the behavior tests, and `verify` runs all three. `bun run pack`
creates a distributable Program archive.

## Related repositories

- [`@phreshos/core`](https://github.com/PhreshOS/core) defines the Program and
  Endpoint contracts.
- [`@phreshos/client`](https://github.com/PhreshOS/client) and
  [`@phreshos/server`](https://github.com/PhreshOS/server) provide the runtime
  boundaries used by Files.
- [`@phreshos/react-ui`](https://github.com/PhreshOS/react-ui) provides its
  interface components.
- [PhreshOS System](https://github.com/PhreshOS/system) runs the Program.

## License

Licensed under the [MIT License](LICENSE). Copyright © 2026 Zohayr SLILEH.
