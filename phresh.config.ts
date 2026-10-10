import { defineConfig } from "@phreshos/core"

export default defineConfig({
    identity: "files",
    name: "Files",
    description: "Browse and manage the files on your machine.",
    website: "https://github.com/PhreshOS/files-program",
    version: "0.4.0",
    categories: ["System"],
    keywords: ["files", "folders", "explorer"],
    // Drawn from icon.svg: the apricot pocket holding two green leaves, the folder Files shows inside.
    icon: "icon.png",
    // Setting a file as the wallpaper uploads it and changes the Appearance; the panel at the edge
    // of the screen stays above every window, in the `over` layer.
    permissions: { uploads: true, appearance: true, layers: ["over"] },
    // It shows any folder another Program opens.
    opens: ["inode/directory"],
    buildCommand: "vite-node scripts/build.ts",
    // One Server reaches the machine's files directly with Node.js, as a worker. It runs once, in the
    // Process named "files", which is the "files" Service; every window is a Client that connects to
    // it, so windows start without it.
    server: {
        start: false,
        service: true,
        location: "dist/server",
        worker: "main.js",
        devCommand: "vite-node server/main.ts"
    },
    // An ordinary frame, not a sandboxed one: the browser drags between frames of the same origin only,
    // so entries dragged between Files windows, and files dragged in, need the Desktop's origin.
    client: {
        location: "dist/client",
        sandbox: false,
        title: "Files",
        size: { width: 960, height: 600 },
        devCommand: "vite --config vite.client.ts"
    }
})
