import {IBridgeRecord, ITransactionRecord} from "../../../models";
import mongoose, {Schema} from "mongoose";

export interface ITransactionRecordMongo extends ITransactionRecord {}

const TransactionRecordSchema: Schema = new Schema<ITransactionRecord>({
    txHash: String,
    toHomeBridge: String,
    status: String,
    receiverId: String,
    mainToken: String,
    sideToken: String,
    amount: String,
    sender: String,
    giverId: String,
    data: String,
});

export default mongoose.model<ITransactionRecord>('Transaction', TransactionRecordSchema);
