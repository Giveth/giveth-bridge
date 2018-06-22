# Upgrading ForeignGivethBridge

note: bridge service has a check to ensure that the bridge address hasn't changed. We may want to remove this, but for you you need to manually edit the db file

1. bridge owner calls `bridge.pause()`;
2. bring down bridge service
3. for every sideToken in the contract in bridge.tokenMapping call `MiniMeToken(sideToken).createCloneToken(name, decimals, symbol, 0, true)`
4. prepare mapping of mainToken -> newlyClonedSideToken in 2 arrays "mainTokens" and "sideTokens"
5. deploy new ForeignGivethBridge contract w/ the above token mapping arrays
6. call `kernel.setAPP(await kernel.APP_ADDR_NAMESPACE(), web3.utils.keccak256('ForeignGivethBridge'), newlyDeployedBride__address)`
7. call `MiniMeToken(address).changeController(foreignBridge.$address)` for each newly deployed sideToken
8. (optional) call `bridge.changeOwnership(multisig_addy)`;
9. update any configs to new bridge address (bridge service, giveth-dapp)
10. start bridge service


# Upgrading GivethBridge

1. bridge owner calls `bridge.pause()`;
2. bring down bridge service 
3. (optional) bridge owner calls `bridge.setAllowPaymentsWhenPaused(true)`;
4. escape all funds. If you did step 3, leave enough funds in the contract to cover all outstanding payments
5. deploy new GivethBridge contract
6. (optional) call `bridge.changeOwnership(multisig_addy)`;
7. Transfer all escaped funds to the new bridge contract.
8. update any configs to new bridge address (bridge service, giveth-dapp)
9. start bridge service