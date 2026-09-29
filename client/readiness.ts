import { useState } from "react"
import { useRequirement } from "@phreshos/react-ui"

/**
 * Holds the nearest Loading until something has arrived for the first time. What arrives later,
 * such as another folder, never covers the window again: it shows its own progress in place.
 */
export function useFirstArrival(arrived: boolean) {
    const [once, setOnce] = useState(arrived)
    if (arrived && !once) setOnce(true)
    useRequirement(once)
}

/** Declares a first arrival from the component that draws the Loading, into that Loading. */
export function Arrival({ arrived }: Readonly<{ arrived: boolean }>) {
    useFirstArrival(arrived)
    return null
}
