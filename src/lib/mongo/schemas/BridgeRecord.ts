import {IBridgeRecord} from "../../../models";
import mongoose, {Schema} from "mongoose";

export interface IBridgeRecordMongo extends IBridgeRecord {}

const BridgeRecordSchema: Schema = new Schema<IBridgeRecord>({
    homeContract: {type: String, required: true},
    foreignContract: {type: String, required: true},
    homeLastRelayed: {type: String, required: true},
    foreignLastRelayed: {type: String, required: true}
});

export default mongoose.model<IBridgeRecord>('BridgeRecord', BridgeRecordSchema);
