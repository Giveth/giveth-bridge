export interface IBridgeRecord {
    homeContract: string
    foreignContract: string
    homeLastRelayed: string | number
    foreignLastRelayed: string | number
}
