import { context } from "@phreshos/server"
import { pickerLaunch } from "./launches"

// One Server, two roles by the name of its Process: the picker, the one Service other Programs reach;
// or the files themselves, which only Files' own windows reach.
if (await context.name() === pickerLaunch.name) await import("./picker")
else await import("./files")
