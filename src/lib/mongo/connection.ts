import mongoose from 'mongoose';

const connProps = {
    host: process.env.MONGO_HOST || 'localhost:27017',
    user: process.env.MONGO_USER || '',
    password: process.env.MONGO_PASS || '',
    db: process.env.MONGO_DB || ''
};

const connStr = process.env.MONGO_USER ?
    `mongodb://${connProps.user}:${connProps.password}@${connProps.host}/${connProps.db}`:
    `mongodb://${connProps.host}/giveth`;

export async function connect(): Promise<void> {
    try {
        await mongoose.connect(connStr);
    } catch (e) {
        console.log('Cannot connect to mongo. Error:', e);
    }
}
