import { useState } from "react"

/**
 * A change that goes to the Server, with what it is doing in words. Whoever runs it shows that it
 * is under way, and why it failed: a window in its status line, the panel beside its folder.
 */
export type Work = (doing: string, change: () => Promise<unknown>) => void

/** Changes under way, the most recent first; each leaves once it settles, however it settles. */
export function useWork() {
    const [doing, setDoing] = useState<readonly Readonly<{ id: number, doing: string }>[]>([])
    const work: Work = (words, change) => {
        const id = Math.random()
        setDoing(current => [{ id, doing: words }, ...current])
        void change().catch(() => undefined).finally(() => setDoing(current => current.filter(item => item.id !== id)))
    }
    return { doing: doing[0]?.doing ?? null, work }
}
