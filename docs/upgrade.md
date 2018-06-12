# Upgrading ForeignGivethBridge

1. bridge owner calls `bridge.pause()`;
2. bring down bridge service
3. for every sideToken in the contract in bridge.tokenMapping call `MiniMeToken(sideToken).createCloneToken(name, decimals, symbol, 0, true)`
4. prepare mapping of mainToken -> newlyClonedSideToken in 2 arrays "mainTokens" and "sideTokens"
5. deploy new ForeignGivethBridge contract w/ the above token mapping arrays
6. call `kernel.setAPP(await kernel.APP_ADDR_NAMESPACE(), web3.utils.keccak256('ForeignGivethBridge'), newlyDeployedBride__address)`
7. (optional) call `bridge.changeOwnership(multisig_addy)`;
8. update any configs to new bridge address (bridge service, giveth-dapp)
9. start bridge service