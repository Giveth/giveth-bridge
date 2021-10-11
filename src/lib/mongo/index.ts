import BridgeRecord from './schemas/BridgeRecord';
import TransactionRecord from './schemas/TransactionRecord';
import {connect} from "./connection";

let _ = connect();

export {
    BridgeRecord,
    TransactionRecord
}
