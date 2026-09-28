# Files

Files browses the folders and files available to the machine running PhreshOS.
Its Server reads the machine's filesystem; each Client window presents that
shared view, opens folders, and previews supported files.

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
