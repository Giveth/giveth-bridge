pragma solidity ^0.4.21;

import "./ProxyStorage.sol";

contract DelegateProxy is ProxyStorage {
    function DelegateProxy(address _dest) public {
        destination = _dest;
    }

    function() payable external {
        require(destination != 0);
        address target = destination;

        // Make the call
        assembly {
            calldatacopy(mload(0x40), 0, calldatasize)
            let result := delegatecall(sub(gas, 700), target, mload(0x40), calldatasize, mload(0x40), 0)
            returndatacopy(mload(0x40), 0, returndatasize)
            switch result
            case 1 { return(mload(0x40), returndatasize) }
            default { revert(mload(0x40), returndatasize) }
        }
    }
}