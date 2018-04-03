pragma solidity ^0.4.21;

/*
    Copyright 2017, RJ Ewing <perissology@protonmail.com>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import "giveth-common-contracts/contracts/Escapable.sol";
import "giveth-common-contracts/contracts/ERC20.sol";
import "./ProxyStorage.sol";

contract GivethBridge is ProxyStorage, Escapable {

    bool initialized = false;
    bool public paused = false;

    event Donate(uint64 giverId, uint64 receiverId, address token, uint amount);
    event DonateAndCreateGiver(address giver, uint64 receiverId, address token, uint amount);
    event Withdraw(address receiver, address token, uint amount);
    event Pause();
    event UnPause();
    event Upgrade(address newCode);
    event EscapeFundsCalled(address token, uint amount);

    modifier notPaused {
        require(!paused);
        _;
    }

    address CALLER = 0x839395e20bbB182fa440d08F850E6c7A8f6F0780;
    address DESTINATION = 0x8Ff920020c8AD673661c8117f2855C384758C572; // WHG multisig

    //== constructor

    function GivethBridge()
        Escapable(CALLER, DESTINATION) public 
    {
    }

    function initialize(address _owner, address _escapeHatchCaller, address _escapeHatchDestination) public {
        require(!initialized);
        require(_owner != 0);
        require(_escapeHatchCaller != 0);
        require(_escapeHatchDestination != 0);

        owner = _owner;
        escapeHatchCaller = _escapeHatchCaller;
        escapeHatchDestination = _escapeHatchDestination;
        initialized = true;
    }

    //== public methods

    function donateAndCreateGiver(address giver, uint64 receiverId, address token, uint _amount) notPaused payable external {
        require(giver != 0);
        uint amount = _doDonate(receiverId, token, _amount);
        emit DonateAndCreateGiver(giver, receiverId, token, amount);
    }

    function donate(uint64 giverId, uint64 receiverId) payable external {
        donate(giverId, receiverId, 0, 0);
    }

    function donate(uint64 giverId, uint64 receiverId, address token, uint _amount) notPaused payable public {
        require(giverId != 0);
        uint amount = _doDonate(receiverId, token, _amount);
        emit Donate(giverId, receiverId, token, amount);
    }

    function withdraw(address[] addresses, address[] tokens, uint[] amounts) notPaused onlyOwner external {
        require(addresses.length == tokens.length);
        require(addresses.length == amounts.length);

        for (uint i = 0; i < addresses.length; i++) {
            address to = addresses[i];
            uint amount = amounts[i];
            address token = tokens[i];

            require(to != 0);
            require(amount > 0);

            if (token == 0) {
                to.transfer(amount);
            } else {
                require(token != 0);
                require(ERC20(token).transfer(to, amount));
            }

            emit Withdraw(to, token, amount);
        }
    }

    function pause() notPaused onlyOwner external {
        paused = true;
        emit Pause();
    }

    function unPause() onlyOwner external {
        require(paused);
        paused = false;
        emit UnPause();
    }

    function upgrade(address newCode) onlyOwner external {
        require(newCode != 0);
        destination = newCode;
        emit Upgrade(destination);
    }

    /// Transfer tokens/eth to the escapeHatchDestination.
    /// Used as a safety mechanism to prevent the bridge from holding too much value
    /// before being thoroughly battle-tested.
    /// @param _token to transfer
    /// @param _amount to transfer
    function escapeFunds(address _token, uint _amount) external onlyEscapeHatchCallerOrOwner {
        /// @dev Logic for ether
        if (_token == 0) {
            escapeHatchDestination.transfer(_amount);
            emit EscapeFundsCalled(_token, _amount);
            return;
        }
        /// @dev Logic for tokens
        ERC20 token = ERC20(_token);
        require(token.transfer(escapeHatchDestination, _amount));
        emit EscapeFundsCalled(_token, _amount);
    }

    function _doDonate(uint64 receiverId, address token, uint _amount) internal returns(uint amount) {
        require(receiverId != 0);
        amount = _amount;

        // eth donation
        if (token == 0) {
            amount = msg.value;
        }

        require(amount > 0);

        if (token != 0) {
            require(ERC20(token).transferFrom(msg.sender, this, amount));
        }
    }
}