const chai = require('chai');
const gasPrice = require('../lib/gasPrice').default;

const { assert } = chai;

describe('Gas Price test', function() {
    it('Gas Now response', async function() {
        const price = await gasPrice({ homeGasPrice: 'gasNow' }, true);

        console.log('Price:', price);

        assert.notEqual(price, 1000000000);
    });
});
