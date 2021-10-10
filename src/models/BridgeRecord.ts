export type ContractAddress = string;

export type BridgeRecord = {
    HomeContract: ContractAddress
    ForeignContract: ContractAddress
    HomeLastRelayed: string | number
    ForeignLastRelayed: string | number
    _id: string
}
