import { defineConfig } from "@phreshos/core"
import { filesLaunch } from "./server/launches"

export default defineConfig({
    identity: "files",
    name: "Files",
    description: "Browse and manage the files on your machine.",
    website: "https://github.com/PhreshOS/files-program",
    version: "0.8.1",
    categories: ["System"],
    keywords: ["files", "folders", "explorer"],
    // Drawn from icon.svg: the apricot pocket holding two green leaves, the folder Files shows inside.
    icon: "icon.png",
    // Setting a file as the wallpaper uploads it and changes the Appearance; the panel at the edge
    // of the screen stays above every window, in the `over` layer; and it provides the file picker.
    permissions: { uploads: true, appearance: true, layers: ["over"], provideServices: ["file-picker-v1"] },
    // It shows any folder another Program opens.
    opens: ["inode/directory"],
    // Installing it starts its Server, the Process named "files": from then on the Server sees that it
    // starts with the System, and keeps the picker running.
    installLaunch: filesLaunch,
    buildCommand: "vite-node scripts/build.ts",
    // One Server reaches the machine's files directly with Node.js, as a worker. It runs once, in the
    // Process named "files", which only Files' own windows reach; every window is a Client that
    // connects to it, so windows start without it. The same Server also runs in the Process named
    // "picker", where it holds the "file-picker-v1" Service.
    server: {
        start: false,
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
