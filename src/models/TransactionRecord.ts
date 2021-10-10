export type TransactionStatus = 'confirmed' | 'pending' | 'to-send' | 'failed-send';

export type TransactionRecord = {
    txHash: string
    toHomeBridge: boolean
    status: TransactionStatus
    receiverId: string | number
    mainToken: string
    sideToken: string
    amount: string | number
    sender: string
    giverId: string | number
    data: string
    _id: string
}
