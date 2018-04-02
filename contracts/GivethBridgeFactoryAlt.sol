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
import "./DelegateProxy.sol";
import "./GivethBridge.sol";

contract GivethBridgeFactoryAlt is Escapable {

    event Deployed(address destination);

    address CALLER = 0x839395e20bbB182fa440d08F850E6c7A8f6F0780;
    address DESTINATION = 0x8Ff920020c8AD673661c8117f2855C384758C572; // WHG multisig

    function GivethBridgeFactoryAlt() Escapable(CALLER, DESTINATION) public {}

    function newBridge(
        address _baseGivethBridge,
        address _owner,
        address _escapeHatchCaller,
        address _escapeHatchDestination
    ) public 
    {
        require(_baseGivethBridge != 0);

        GivethBridge bridge = GivethBridge(new DelegateProxy(_baseGivethBridge));
        bridge.initialize(_owner, _escapeHatchCaller, _escapeHatchDestination);

        emit Deployed(address(bridge));
    }
}