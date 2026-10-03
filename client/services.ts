import { system } from "@phreshos/client"
import type { ServerService } from "@phreshos/core"
import { useEffect, useState } from "react"

/**
 * The Server Service offered under this name, while one is present, or `null`. It follows Services
 * appearing and leaving, so what depends on it shows only while it can work. When several Programs
 * offer the name, the first one found serves.
 */
export function useService(name: string) {
    const [service, setService] = useState<ServerService | null>(null)
    useEffect(() => {
        let active = true
        const look = () => void system.service.list({ name })
            .then(found => found.find((service): service is ServerService => service.address().endpoint === "server") ?? null)
            .catch(() => null)
            .then(found => { if (active) setService(found) })
        const named = (service: { address(): { process: string } }) => { if (service.address().process === name) look() }
        const stopAvailable = system.service.subscribe("available", named)
        const stopUnavailable = system.service.subscribe("unavailable", named)
        look()
        return () => {
            active = false
            stopAvailable()
            stopUnavailable()
        }
    }, [name])
    return service
}
