import deploy from './helpers/deploy';
import config from '../src/configuration';

// process.on('unhandledRejection', (reason, p) => {
//   console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
//   // application specific logging, throwing an error, or other logic here
// });

describe('Bridge Integration Tests', function () {
  this.timeout(0);

  let deployData;

  before(async () => {
    deployData = await deploy();
  });

  after(async () => {
    if (deployData) {
      deployData.homeNetwork.close();
      deployData.foreignNetwork.close();
    }
  });

  it('Should deploy', async function () {

  });
});