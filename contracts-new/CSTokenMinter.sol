/**
* Submitted for verification at blockscout.com on 2020-10-03 16:47:59.068216Z
*/

// File: @openzeppelin/contracts/GSN/Context.sol

pragma solidity ^0.5.0;

contract MinterTest {

    event Donate(address indexed sender, address indexed token, uint64 indexed receiverId, uint amount, bytes32 homeTx);

    address public authorizedKey;

    constructor(address _authorizedKey) public {
        require(_authorizedKey != address(0), "Authorized key cannot be empty");
        authorizedKey = _authorizedKey;
    }

    modifier onlyAuthorizedKey {
        require(msg.sender == authorizedKey, "Permission denied");
        _;
    }

    function deposit(address sender, address token, uint64 receiverId, uint amount, bytes32 homeTx) onlyAuthorizedKey external {
        emit Donate(sender, token, receiverId, amount, homeTx);
    }
}
